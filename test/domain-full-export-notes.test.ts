/**
 * Notes in the full export and its restore (#919), against the real Swiss Ephemeris and a real
 * IndexedDB-backed store.
 *
 * The export carries the note entities the store folds (Birth Record revisions and Consultation notes keyed
 * by note id), and the importer restores them through the note mutation path, so imported notes are real
 * op-log entries. These tests cover export then import into an empty store and into a store that already
 * holds the note, for both note kinds, and that a restore never forks a note or writes `person.notes`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { buildFullExport, FULL_EXPORT_VERSION, type FullExport } from '../src/domain/full-export.js';
import { stageFullExportRestore, validateFullExport } from '../src/domain/full-export-importer.js';
import type { Person } from '../src/domain/person.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import {
  birthNoteRevision,
  consultationNoteDelete,
  consultationNoteRevision,
  NOTE_MAX_CHARACTERS,
  revisionParents,
} from '../src/store/notes.js';
import { createClock, encodeHlc } from '../src/store/hlc.js';
import { openStore, type Store } from '../src/store/store.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;
beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

const PERSON = 'p-ada';
const NODE = 'a1b2c3d4e5f60718';
const T_MILLIS = 1_780_000_000_000;
const ADA: Person = {
  id: PERSON,
  displayName: 'Ada Lovelace',
  placeLabel: 'London, UK',
  timeAccuracy: 'recorded',
  notes: '',
  missing: [],
  moment: {
    civil: { year: 1815, month: 12, day: 10, hour: 7, minute: 45, second: 0 },
    coordinates: { latitude: 51.5072, longitude: -0.1276 },
  },
};
const NOW = new Date('2026-11-02T12:00:00.000Z');

let dbCounter = 0;
function ticking(start = 1_780_000_000_000): () => number {
  let millis = start;
  return () => {
    millis += 1000;
    return millis;
  };
}

async function withStore(body: (store: Store) => Promise<void>): Promise<void> {
  dbCounter += 1;
  const store = await openStore({ name: `astraya-export-notes-test-${String(dbCounter)}`, now: ticking() });
  try {
    await body(store);
  } finally {
    store.close();
  }
}

/** Write a person with a Birth Record note (two revisions) and two Consultation notes (one edited). */
async function seed(store: Store): Promise<void> {
  await store.mutate([
    { entity: 'person', entityId: PERSON, field: 'displayName', value: ADA.displayName },
    birthNoteRevision(PERSON, 'r-birth1', 'Birth, first draft', []),
  ]);
  await store.mutate([birthNoteRevision(PERSON, 'r-birth2', 'Birth, second draft', ['r-birth1'])]);
  await store.mutate([consultationNoteRevision(PERSON, 'r-c1', 'r-c1', 'First consultation', [])]);
  await store.mutate([consultationNoteRevision(PERSON, 'r-c1', 'r-c1b', 'First consultation, edited', ['r-c1'])]);
  await store.mutate([consultationNoteRevision(PERSON, 'r-c2', 'r-c2', 'Second consultation', [])]);
}

async function exportOf(store: Store): Promise<unknown> {
  const archive = await buildFullExport({
    people: [...store.state.people.values()],
    provider: engine,
    appVersion: '9.9.9',
    settings: DEFAULT_EXTENDED_SETTINGS,
    rulership: 'modern',
    symbolClass: 'drawn',
    now: NOW,
    notes: store.state,
  });
  // Through JSON, like a file read back off disk.
  return JSON.parse(JSON.stringify(archive));
}

function validated(file: unknown): FullExport {
  const result = validateFullExport(file);
  if (!result.ok) throw new Error(`not valid: ${JSON.stringify(result.error)}`);
  return result.value;
}

/** What the store's fold shows for a person's notes: head text, revision ids, and fork count. */
function shape(store: Store): {
  readonly birth: { head: string; revisions: readonly string[]; forks: number } | undefined;
  readonly consultations: readonly { id: string; head: string; revisions: readonly string[]; forks: number }[];
} {
  const birth = store.state.birthNotes.get(PERSON);
  return {
    birth:
      birth === undefined
        ? undefined
        : { head: birth.content, revisions: birth.revisions.map((r) => r.id), forks: birth.forks.length },
    consultations: (store.state.consultationNotes.get(PERSON) ?? []).map((note) => ({
      id: note.noteId,
      head: note.content,
      revisions: note.revisions.map((r) => r.id),
      forks: note.forks.length,
    })),
  };
}

describe('notes in the full export (#919)', () => {
  it('keeps the export format version: the new fields are additive', () => {
    expect(FULL_EXPORT_VERSION).toBe(4);
  });

  it('exports the Birth Record note with every revision, and consultation notes keyed to their note id', async () => {
    await withStore(async (store) => {
      await seed(store);
      const file = (await exportOf(store)) as FullExport;
      const [person] = file.people;
      expect(person?.notes).toBe('Birth, second draft');
      expect(person?.birthNote?.revisions.map((r) => [r.id, r.text, r.parents])).toEqual([
        ['r-birth1', 'Birth, first draft', []],
        ['r-birth2', 'Birth, second draft', ['r-birth1']],
      ]);
      expect(person?.consultationNotes?.map((note) => note.id)).toEqual(['r-c1', 'r-c2']);
      expect(person?.consultationNotes?.[0]?.revisions.map((r) => r.text)).toEqual([
        'First consultation',
        'First consultation, edited',
      ]);
    });
  });

  it('exports no note fields for a person without notes, and for a caller that passes no notes', async () => {
    const bare = await buildFullExport({
      people: [ADA],
      provider: engine,
      appVersion: '9.9.9',
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: 'modern',
      symbolClass: 'drawn',
      now: NOW,
    });
    expect(bare.people[0]).not.toHaveProperty('birthNote');
    expect(bare.people[0]).not.toHaveProperty('consultationNotes');
  });
});

describe('restoring notes through the store (#919)', () => {
  it('round-trips into an empty store: same head text, same revisions, no forks, real op-log entries', async () => {
    let expected: ReturnType<typeof shape> | undefined;
    let file: unknown;
    await withStore(async (source) => {
      await seed(source);
      expected = shape(source);
      file = await exportOf(source);
    });

    await withStore(async (target) => {
      const preview = stageFullExportRestore(validated(file), new Map(), new Map(), undefined, target.state);
      const mutations = preview.items.flatMap((item) => item.mutations);
      // Notes go in as note revisions, never as the legacy register.
      expect(mutations.some((m) => m.entity === 'person' && m.field === 'notes')).toBe(false);
      await target.mutate(mutations);

      expect(shape(target)).toEqual(expected);
      expect(target.state.people.get(PERSON)?.notes).toBe('Birth, second draft');
      expect(target.outgoing().some((record) => record.entity === 'birthNote')).toBe(true);
      expect(target.outgoing().some((record) => record.entity === 'consultationNote')).toBe(true);
    });
  });

  it('restoring over a store that already holds the same notes writes nothing and forks nothing', async () => {
    await withStore(async (store) => {
      await seed(store);
      const before = shape(store);
      const file = await exportOf(store);

      const preview = stageFullExportRestore(
        validated(file),
        store.state.people,
        store.state.deleted.people,
        undefined,
        store.state,
      );
      expect(preview.items.flatMap((item) => item.mutations).filter((m) => m.entity !== 'person')).toEqual([]);
      await store.mutate(preview.items.flatMap((item) => item.mutations));
      expect(shape(store)).toEqual(before);
    });
  });

  it('restoring a longer history over an existing note adds only the missing revisions, with no fork', async () => {
    let file: unknown;
    await withStore(async (source) => {
      await seed(source);
      await source.mutate([consultationNoteRevision(PERSON, 'r-c1', 'r-c1c', 'Third edit', ['r-c1b'])]);
      await source.mutate([birthNoteRevision(PERSON, 'r-birth3', 'Birth, third draft', ['r-birth2'])]);
      file = await exportOf(source);
    });

    await withStore(async (target) => {
      // The target holds only the first two revisions of each note.
      await seed(target);
      const preview = stageFullExportRestore(
        validated(file),
        target.state.people,
        target.state.deleted.people,
        undefined,
        target.state,
      );
      const noteMutations = preview.items.flatMap((item) => item.mutations).filter((m) => m.entity !== 'person');
      expect(noteMutations.map((m) => m.field).sort()).toEqual(['rev/r-birth3', 'rev/r-c1/r-c1c']);
      await target.mutate(preview.items.flatMap((item) => item.mutations));

      const after = shape(target);
      expect(after.birth).toEqual({
        head: 'Birth, third draft',
        revisions: ['r-birth1', 'r-birth2', 'r-birth3'],
        forks: 0,
      });
      expect(after.consultations[0]).toEqual({
        id: 'r-c1',
        head: 'Third edit',
        revisions: ['r-c1', 'r-c1b', 'r-c1c'],
        forks: 0,
      });
    });
  });

  it('does not duplicate a revision when a Birth Record note with revisions is restored over itself (the spurious fork)', async () => {
    await withStore(async (store) => {
      await seed(store);
      const file = await exportOf(store);
      // The old importer wrote person.notes over this: a second root beside the revisions, shown as a fork.
      const preview = stageFullExportRestore(
        validated(file),
        store.state.people,
        store.state.deleted.people,
        undefined,
        store.state,
      );
      await store.mutate(preview.items.flatMap((item) => item.mutations));
      expect(store.state.birthNotes.get(PERSON)?.forks).toEqual([]);
    });
  });

  it('never revives a Consultation note deleted on this device (grow-only delete)', async () => {
    let file: unknown;
    await withStore(async (source) => {
      await seed(source);
      file = await exportOf(source);
    });
    await withStore(async (target) => {
      await seed(target);
      await target.mutate([consultationNoteDelete(PERSON, 'r-c2')]);
      const preview = stageFullExportRestore(
        validated(file),
        target.state.people,
        target.state.deleted.people,
        undefined,
        target.state,
      );
      await target.mutate(preview.items.flatMap((item) => item.mutations));
      expect(shape(target).consultations.map((note) => note.id)).toEqual(['r-c1']);
    });
  });

  it('keeps a diverged local edit as a fork instead of overwriting it', async () => {
    let file: unknown;
    await withStore(async (source) => {
      await seed(source);
      file = await exportOf(source);
    });
    await withStore(async (target) => {
      await seed(target);
      await target.mutate([birthNoteRevision(PERSON, 'r-local', 'Local edit', ['r-birth2'])]);
      const preview = stageFullExportRestore(
        validated(file),
        target.state.people,
        target.state.deleted.people,
        undefined,
        target.state,
      );
      await target.mutate(preview.items.flatMap((item) => item.mutations));
      expect(target.state.birthNotes.get(PERSON)?.content).toBe('Local edit');
    });
  });

  it('a file with only head text (an older export) writes one revision on top of the current leaves, only when it differs', async () => {
    await withStore(async (store) => {
      await seed(store);
      const old = {
        people: [
          {
            id: PERSON,
            displayName: ADA.displayName,
            placeLabel: '',
            timeAccuracy: 'recorded',
            notes: 'From an old file',
            missing: [],
          },
        ],
      } as const;
      const same = {
        people: [{ ...old.people[0], notes: 'Birth, second draft' }],
      } as const;

      const unchanged = stageFullExportRestore(
        { people: same.people.map((p) => ({ ...p })) },
        store.state.people,
        store.state.deleted.people,
        undefined,
        store.state,
      );
      expect(unchanged.items[0]?.mutations.filter((m) => m.entity === 'birthNote')).toEqual([]);

      const preview = stageFullExportRestore(
        { people: old.people.map((p) => ({ ...p })) },
        store.state.people,
        store.state.deleted.people,
        undefined,
        store.state,
      );
      const birth = preview.items[0]?.mutations.filter((m) => m.entity === 'birthNote') ?? [];
      expect(birth).toHaveLength(1);
      await store.mutate(preview.items.flatMap((item) => item.mutations));
      const note = store.state.birthNotes.get(PERSON);
      expect(note?.content).toBe('From an old file');
      expect(note?.forks).toEqual([]);
      expect(note).toBeDefined();
      if (note !== undefined) expect(revisionParents(note)).toHaveLength(1);
    });
  });
});

describe('validating notes in an untrusted file (#919)', () => {
  const good = { id: 'r-a', text: 'x', parents: [], hlc: encodeHlc(createClock(NODE, T_MILLIS)) };

  /** A minimal valid export with one person, patched by `person`. Built without a store, so validation stands alone. */
  function fileWith(person: Record<string, unknown>): unknown {
    return {
      format: 'astraya-export',
      version: FULL_EXPORT_VERSION,
      exportedAt: NOW.toISOString(),
      app: { version: '9.9.9' },
      preferences: { settings: DEFAULT_EXTENDED_SETTINGS, rulership: 'modern', symbolClass: 'drawn' },
      note: '',
      people: [
        {
          id: PERSON,
          displayName: ADA.displayName,
          placeLabel: '',
          timeAccuracy: 'recorded',
          notes: '',
          missing: [],
          ...person,
        },
      ],
    };
  }

  it('accepts a well-formed note block', () => {
    expect(validateFullExport(fileWith({ birthNote: { revisions: [good] } })).ok).toBe(true);
  });

  it('rejects a bad timestamp, a reserved or duplicate id, or a non-list block, naming the path', () => {
    const cases: readonly [Record<string, unknown>, string][] = [
      [{ birthNote: { revisions: [{ ...good, hlc: 'nope' }] } }, 'people[0].birthNote.revisions[0].hlc'],
      [{ birthNote: { revisions: [{ ...good, id: '__proto__' }] } }, 'people[0].birthNote.revisions[0].id'],
      [{ birthNote: { revisions: [good, good] } }, 'people[0].birthNote.revisions[1].id'],
      [{ consultationNotes: [{ id: 'a/b', revisions: [good] }] }, 'people[0].consultationNotes[0].id'],
      [{ consultationNotes: 'x' }, 'people[0].consultationNotes'],
    ];
    for (const [patch, path] of cases) {
      const result = validateFullExport(fileWith(patch));
      expect(result.ok, path).toBe(false);
      if (!result.ok && result.error.kind === 'malformed') expect(result.error.path).toBe(path);
    }
  });

  it('rejects a revision over the character limit at validation, not as a failed batch', () => {
    const long = 'x'.repeat(NOTE_MAX_CHARACTERS + 1);
    expect(validateFullExport(fileWith({ birthNote: { revisions: [{ ...good, text: long }] } })).ok).toBe(false);
  });
});

describe('over-limit notes on import (#919)', () => {
  const OVER = NOTE_MAX_CHARACTERS + 1;
  const LEGACY_HLC = encodeHlc(createClock(NODE, T_MILLIS));

  async function exportWithPeople(people: readonly Person[]): Promise<Record<string, unknown>> {
    const archive = await buildFullExport({
      people,
      provider: engine,
      appVersion: '9.9.9',
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: 'modern',
      symbolClass: 'drawn',
      now: NOW,
    });
    return JSON.parse(JSON.stringify(archive)) as Record<string, unknown>;
  }

  /** A file holding Ada, with her head text and optional Birth Record note block replaced. */
  async function fileWithAda(notes: string, birthNote?: unknown): Promise<Record<string, unknown>> {
    const archive = await exportWithPeople([{ ...ADA, notes }]);
    const [person] = archive.people as Record<string, unknown>[];
    if (person !== undefined && birthNote !== undefined) person.birthNote = birthNote;
    return archive;
  }

  it('accepts a legacy birth note over the limit, and it imports and round-trips with its text intact', async () => {
    const longText = 'b'.repeat(OVER);
    const legacyRoot = { id: `legacy-${LEGACY_HLC}`, text: longText, parents: [], hlc: LEGACY_HLC };
    const result = validateFullExport(await fileWithAda(longText, { revisions: [legacyRoot] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await withStore(async (target) => {
      const preview = stageFullExportRestore(result.value, new Map(), new Map(), undefined, target.state);
      const mutations = preview.items.flatMap((item) => item.mutations);
      // Written under a legacy id, which the push keeps local rather than sending (#919).
      expect(mutations.some((m) => m.entity === 'birthNote' && m.field.startsWith('rev/legacy-'))).toBe(true);
      await target.mutate(mutations);

      expect(target.state.birthNotes.get(PERSON)?.content).toBe(longText);
      expect(target.state.people.get(PERSON)?.notes).toBe(longText);
      // Round-trip: exporting the imported store carries the same text again.
      const again = validated(await exportOf(target));
      expect(again.people[0]?.notes).toBe(longText);
    });
  });

  it('accepts a pre-#919 head with no birth note revisions over the limit', async () => {
    expect(validateFullExport(await fileWithAda('c'.repeat(OVER))).ok).toBe(true);
  });

  it('refuses a new-style birth revision over the limit, naming its path', async () => {
    const revision = { id: 'r-new', text: 'n'.repeat(OVER), parents: [], hlc: LEGACY_HLC };
    const result = validateFullExport(await fileWithAda('', { revisions: [revision] }));
    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'malformed',
        path: 'people[0].birthNote.revisions[0].text',
        reason: `longer than the ${String(NOTE_MAX_CHARACTERS)}-character limit`,
      },
    });
  });

  it('refuses a consultation note over the limit, even one whose id looks legacy', async () => {
    const archive = await fileWithAda('');
    const [person] = archive.people as Record<string, unknown>[];
    if (person !== undefined) {
      person.consultationNotes = [
        { id: 'c1', revisions: [{ id: `legacy-${LEGACY_HLC}`, text: 'x'.repeat(OVER), parents: [], hlc: LEGACY_HLC }] },
      ];
    }
    const result = validateFullExport(archive);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'malformed') {
      expect(result.error.path).toBe('people[0].consultationNotes[0].revisions[0].text');
    }
  });

  it('a legacy over-limit note on one person does not refuse the file: every person still imports', async () => {
    const bob: Person = { ...ADA, id: 'p-bob', displayName: 'Bob', notes: 'd'.repeat(OVER) };
    const archive = await exportWithPeople([ADA, bob]);
    const result = validateFullExport(archive);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.people.map((p) => p.id)).toEqual([PERSON, 'p-bob']);
  });
});
