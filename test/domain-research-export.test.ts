/**
 * The research block of the full export (#1194): live items only, strict validation through the store guards, and a
 * restore that adds what is missing and never overwrites or un-deletes (decisions R1-R3).
 */
import { describe, expect, it } from 'vitest';
import { validateFullExport } from '../src/domain/full-export-importer.js';
import { FULL_EXPORT_FORMAT, FULL_EXPORT_VERSION } from '../src/domain/full-export.js';
import {
  buildResearchExport,
  stageResearchRestore,
  validateResearch,
  type ExistingResearch,
  type ExportedResearch,
} from '../src/domain/research-export.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { fold } from '../src/store/fold.js';
import { annotationRevision } from '../src/store/annotations.js';
import { createClock } from '../src/store/hlc.js';
import { NOTE_MAX_CHARACTERS } from '../src/store/notes.js';
import { append, emptyLog, type Mutation } from '../src/store/oplog.js';
import { pinCreate, pinTargetOf } from '../src/store/pins.js';
import { savedQueryCreate, type SavedQueryDefinition } from '../src/store/saved-queries.js';

const T0 = 1_780_963_200_000;
const DEFINITION: SavedQueryDefinition = {
  tool: 'event-search',
  version: 1,
  parameters: {
    from: '2027-01-01',
    to: '2027-12-31',
    kinds: ['station'],
    stationBody: 'mercury',
    ingressBody: 'sun',
    aspectBodyA: 'jupiter',
    aspectBodyB: 'saturn',
    aspectKey: 'conjunction',
  },
};
const TARGET = pinTargetOf({ kind: 'lunation', jd: 2461466, label: 'New Moon' });
const Q1 = 'q-aaaaaaaaaaaaaaaa';
const K1 = 'k-aaaaaaaaaaaaaaaa';
const K2 = 'k-bbbbbbbbbbbbbbbb';
const R1 = 'r-aaaaaaaaaaaaaaaa';
const R2 = 'r-bbbbbbbbbbbbbbbb';
const R3 = 'r-cccccccccccccccc';

function stateOf(entries: readonly (readonly [Mutation, number])[]): ExistingResearch & ReturnType<typeof fold> {
  let log = emptyLog(createClock('a1b2c3d4e5f60718'));
  for (const [mutation, millis] of entries) log = append(log, mutation, millis).log;
  return fold(log.records);
}

function at(mutations: readonly Mutation[], start: number): readonly (readonly [Mutation, number])[] {
  return mutations.map((mutation, index) => [mutation, start + index * 1000] as const);
}

const EMPTY: ExistingResearch = fold([]);

function mustExport(state: ExistingResearch): ExportedResearch {
  const research = buildResearchExport(state);
  if (research === undefined) throw new Error('expected a research block');
  return research;
}

function fullState(): ExistingResearch {
  return stateOf([
    ...at(savedQueryCreate(Q1, 'Mercury stations', DEFINITION), T0),
    ...at(pinCreate(K1, TARGET), T0 + 10_000),
    [annotationRevision(K1, R1, 'first', []), T0 + 20_000],
    [annotationRevision(K1, R2, 'second', [R1]), T0 + 21_000],
  ]);
}

describe('buildResearchExport (R1)', () => {
  it('has nothing to carry for an empty store, so the key is absent', () => {
    expect(buildResearchExport(EMPTY)).toBeUndefined();
  });

  it('carries saved queries, pins and every annotation revision, sorted by id', () => {
    const research = buildResearchExport(fullState());
    expect(research?.savedQueries).toEqual([{ id: Q1, name: 'Mercury stations', definition: DEFINITION }]);
    expect(research?.pins).toHaveLength(1);
    expect(research?.pins[0]).toMatchObject({ id: K1, target: TARGET });
    expect(research?.pins[0]?.annotation?.revisions.map((revision) => revision.text)).toEqual(['first', 'second']);
    expect(research?.omittedUnreadable).toBeUndefined();
  });

  it('leaves out deleted queries and unpinned pins, with their annotations', () => {
    const state = stateOf([
      ...at(savedQueryCreate(Q1, 'Gone', DEFINITION), T0),
      [{ entity: 'savedQuery', entityId: Q1, field: 'deleted', value: true }, T0 + 5000],
      ...at(pinCreate(K1, TARGET), T0 + 10_000),
      [annotationRevision(K1, R1, 'note', []), T0 + 11_000],
      [{ entity: 'pin', entityId: K1, field: 'deleted', value: true }, T0 + 12_000],
    ]);
    expect(buildResearchExport(state)).toBeUndefined();
  });

  it('leaves out an item from a newer build and counts it', () => {
    const state = stateOf([
      [{ entity: 'pin', entityId: K1, field: 'target', value: { ...TARGET, version: 9 } }, T0],
      [{ entity: 'pin', entityId: K1, field: 'deleted', value: false }, T0 + 1000],
    ]);
    expect(buildResearchExport(state)).toEqual({ savedQueries: [], pins: [], omittedUnreadable: 1 });
  });

  it('gives the same result whatever order the log was written in', () => {
    const a = buildResearchExport(fullState());
    const b = buildResearchExport(fullState());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('validateResearch', () => {
  const valid = (): ExportedResearch => mustExport(fullState());
  const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

  it('accepts what was exported, byte for byte through JSON', () => {
    const result = validateResearch(json(valid()), 'research');
    expect(result.ok).toBe(true);
    expect(result.ok && JSON.stringify(result.value)).toBe(JSON.stringify(valid()));
  });

  it.each([
    ['a non-object block', 'x', 'research'],
    ['savedQueries not an array', { savedQueries: 1, pins: [] }, 'research.savedQueries'],
    ['pins not an array', { savedQueries: [], pins: 1 }, 'research.pins'],
    ['a bad omittedUnreadable', { savedQueries: [], pins: [], omittedUnreadable: -1 }, 'research.omittedUnreadable'],
  ])('refuses %s', (_name, value, path) => {
    const result = validateResearch(value, 'research');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.path).toBe(path);
  });

  it('refuses a saved query whose definition the store would refuse, with its path', () => {
    const block = json(valid()) as { savedQueries: { definition: { parameters: { aspectKey: string } } }[] };
    const first = block.savedQueries[0];
    if (first === undefined) throw new Error('expected a saved query');
    first.definition.parameters.aspectKey = 'not-an-aspect';
    const result = validateResearch(block, 'research');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.path).toBe('research.savedQueries[0]');
  });

  it('refuses a saved query with a non-object definition without throwing', () => {
    const result = validateResearch({ savedQueries: [{ id: Q1, name: 'x', definition: 5 }], pins: [] }, 'research');
    expect(result.ok).toBe(false);
  });

  it('refuses a pin with an unreadable target', () => {
    const result = validateResearch(
      { savedQueries: [], pins: [{ id: K1, target: { ...TARGET, kind: 'eclipse' } }] },
      'research',
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.path).toBe('research.pins[0]');
  });

  it('refuses a pin id that is not a k- id and a repeated id', () => {
    expect(validateResearch({ savedQueries: [], pins: [{ id: Q1, target: TARGET }] }, 'research').ok).toBe(false);
    const twice = {
      savedQueries: [],
      pins: [
        { id: K1, target: TARGET },
        { id: K1, target: TARGET },
      ],
    };
    expect(validateResearch(twice, 'research').ok).toBe(false);
  });

  it('refuses an over-limit annotation revision, naming it', () => {
    const revision = {
      id: R1,
      text: 'x'.repeat(NOTE_MAX_CHARACTERS + 1),
      parents: [],
      hlc: valid().pins[0]?.annotation?.revisions[0]?.hlc,
    };
    const result = validateResearch(
      { savedQueries: [], pins: [{ id: K1, target: TARGET, annotation: { revisions: [revision] } }] },
      'research',
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.path).toBe('research.pins[0].annotation.revisions[0]');
  });

  it('refuses a revision with a bad timestamp or a non-r- id', () => {
    const hlc = valid().pins[0]?.annotation?.revisions[0]?.hlc;
    const bad = (revision: unknown): boolean =>
      validateResearch(
        { savedQueries: [], pins: [{ id: K1, target: TARGET, annotation: { revisions: [revision] } }] },
        'research',
      ).ok;
    expect(bad({ id: R1, text: 'a', parents: [], hlc: 'nope' })).toBe(false);
    expect(bad({ id: 'oops', text: 'a', parents: [], hlc })).toBe(false);
    expect(bad({ id: R1, text: 'a', parents: [], hlc })).toBe(true);
  });
});

describe('stageResearchRestore (R2, R3)', () => {
  const research = (): ExportedResearch => mustExport(fullState());

  it('restores everything into an empty store, annotation revisions oldest first', () => {
    const preview = stageResearchRestore(research(), EMPTY);
    expect(preview).toMatchObject({
      newSavedQueries: 1,
      newPins: 1,
      newAnnotationRevisions: 2,
      alreadyHere: 0,
      deletedHere: 0,
    });
    const revisionFields = preview.mutations.filter((m) => m.entity === 'annotation').map((m) => m.field);
    expect(revisionFields).toEqual([`rev/${R1}`, `rev/${R2}`]);
  });

  it('writes nothing for items already here, and adds only the annotation revisions this device lacks', () => {
    const partial = stateOf([
      ...at(savedQueryCreate(Q1, 'Renamed locally', DEFINITION), T0),
      ...at(pinCreate(K1, TARGET), T0 + 10_000),
      [annotationRevision(K1, R1, 'first', []), T0 + 20_000],
    ]);
    const preview = stageResearchRestore(research(), partial);
    expect(preview).toMatchObject({ newSavedQueries: 0, newPins: 0, newAnnotationRevisions: 1, alreadyHere: 2 });
    expect(preview.mutations).toEqual([annotationRevision(K1, R2, 'second', [R1])]);
  });

  it('never overwrites: an existing query keeps its local name', () => {
    const local = stateOf(at(savedQueryCreate(Q1, 'Renamed locally', DEFINITION), T0));
    const preview = stageResearchRestore(research(), local);
    expect(preview.mutations.some((m) => m.entity === 'savedQuery')).toBe(false);
  });

  it('never brings back an item deleted here, and leaves its annotation alone', () => {
    const local = stateOf([
      ...at(savedQueryCreate(Q1, 'Mercury stations', DEFINITION), T0),
      [{ entity: 'savedQuery', entityId: Q1, field: 'deleted', value: true }, T0 + 5000],
      ...at(pinCreate(K1, TARGET), T0 + 10_000),
      [{ entity: 'pin', entityId: K1, field: 'deleted', value: true }, T0 + 12_000],
    ]);
    const preview = stageResearchRestore(research(), local);
    expect(preview.mutations).toEqual([]);
    expect(preview.deletedHere).toBe(2);
  });

  it('keeps a fork as a fork when restoring a second device’s version', () => {
    const forked = stateOf([
      ...at(pinCreate(K2, TARGET), T0),
      [annotationRevision(K2, R1, 'base', []), T0 + 1000],
      [annotationRevision(K2, R2, 'edit on A', [R1]), T0 + 2000],
      [annotationRevision(K2, R3, 'edit on B', [R1]), T0 + 3000],
    ]);
    const exported = mustExport(forked);
    const restored = stateOf(at(stageResearchRestore(exported, EMPTY).mutations, T0 + 100_000));
    expect(restored.annotations.get(K2)?.revisions).toHaveLength(3);
    expect(restored.annotations.get(K2)?.forks).toHaveLength(1);
  });

  it('a restore of its own export into an empty store reproduces the same export', () => {
    const exported = research();
    const restored = stateOf(at(stageResearchRestore(exported, EMPTY).mutations, T0 + 100_000));
    const again = buildResearchExport(restored);
    expect(again?.savedQueries).toEqual(exported.savedQueries);
    expect(
      again?.pins.map((pin) => [pin.id, pin.target, pin.annotation?.revisions.map((r) => [r.id, r.text, r.parents])]),
    ).toEqual(
      exported.pins.map((pin) => [pin.id, pin.target, pin.annotation?.revisions.map((r) => [r.id, r.text, r.parents])]),
    );
  });
});

describe('the research block in a whole export file', () => {
  const base = {
    format: FULL_EXPORT_FORMAT,
    version: FULL_EXPORT_VERSION,
    exportedAt: '2026-11-05T12:00:00.000Z',
    app: { version: '0.0.0' },
    preferences: { settings: DEFAULT_EXTENDED_SETTINGS, rulership: 'modern', symbolClass: 'astro' },
    note: '',
    people: [],
  };

  it('a file without research reads exactly as before', () => {
    const result = validateFullExport(base);
    expect(result.ok).toBe(true);
    expect(result.ok && 'research' in result.value).toBe(false);
  });

  it('carries a valid research block through validation', () => {
    const research = buildResearchExport(fullState());
    const result = validateFullExport(JSON.parse(JSON.stringify({ ...base, research })));
    expect(result.ok && result.value.research?.pins).toHaveLength(1);
  });

  it('refuses the whole file when the research block is malformed, with the path', () => {
    const result = validateFullExport({ ...base, research: { savedQueries: 'no', pins: [] } });
    expect(result).toMatchObject({ ok: false, error: { kind: 'malformed', path: 'research.savedQueries' } });
  });
});
