/**
 * The full-export restore workflow (#587), against the real Swiss Ephemeris and a real
 * IndexedDB-backed store: `validateFullExport` on real and tampered archives, `stageFullExportRestore`'s
 * new/updated/unchanged/deletedLocally classification, and that a restore batch commits atomically.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateFullExport, stageFullExportRestore } from '../src/domain/full-export-importer.js';
import { buildFullExport, FULL_EXPORT_FORMAT, FULL_EXPORT_VERSION } from '../src/domain/full-export.js';
import type { Person } from '../src/domain/person.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { openStore, type Store } from '../src/store/store.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;
beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

const ADA_MOMENT = {
  civil: { year: 1815, month: 12, day: 10, hour: 7, minute: 45, second: 0 },
  coordinates: { latitude: 51.5072, longitude: -0.1276 },
};
const ADA: Person = {
  id: 'p-ada',
  displayName: 'Ada Lovelace',
  placeLabel: 'London, UK',
  timeAccuracy: 'recorded',
  notes: 'Wrote the first program.',
  missing: [],
  moment: ADA_MOMENT,
};
const NOW = new Date('2026-10-15T12:00:00.000Z');

/** Round-tripped through JSON, like a file read back off disk — never the live object graph. */
function roundTripped(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

const build = (people: readonly Person[]) =>
  buildFullExport({
    people,
    provider: engine,
    appVersion: '9.9.9',
    settings: DEFAULT_EXTENDED_SETTINGS,
    rulership: 'modern',
    symbolClass: 'drawn',
    now: NOW,
  });

describe('validateFullExport', () => {
  it('accepts a real archive produced by buildFullExport', async () => {
    const archive = await build([ADA]);
    const result = validateFullExport(roundTripped(archive));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.people).toHaveLength(1);
    expect(result.value.people[0]).toMatchObject({ id: 'p-ada', displayName: 'Ada Lovelace', birth: ADA.moment });
  });

  it('rejects a non-object value, and a value with the wrong format', async () => {
    expect(validateFullExport('not an object').ok).toBe(false);
    expect(validateFullExport(null).ok).toBe(false);
    expect(validateFullExport(42).ok).toBe(false);

    const result = validateFullExport({ format: 'some-other-app-export' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('wrong-format');
  });

  // The #605 regression, explicitly: a prior importer compared the export's version against
  // the wrong constant (the calculation-snapshot version), so the check did nothing. These two
  // assert the comparison is actually against the imported FULL_EXPORT_VERSION, in both
  // directions a mismatch can go.
  it('rejects a version older than any supported one, naming the direction (#605 regression)', async () => {
    const archive = await build([ADA]);
    const tampered = { ...(roundTripped(archive) as Record<string, unknown>), version: 1 };
    const result = validateFullExport(tampered);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      kind: 'wrong-version',
      got: 1,
      expected: FULL_EXPORT_VERSION,
      direction: 'older',
    });
  });

  it('rejects a version newer than FULL_EXPORT_VERSION, naming the direction', async () => {
    const archive = await build([ADA]);
    const tampered = { ...(roundTripped(archive) as Record<string, unknown>), version: FULL_EXPORT_VERSION + 1 };
    const result = validateFullExport(tampered);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      kind: 'wrong-version',
      got: FULL_EXPORT_VERSION + 1,
      expected: FULL_EXPORT_VERSION,
      direction: 'newer',
    });
  });

  it('rejects a v1-shaped export by its version, not by inferring the shape', () => {
    // Representative of the v1 shape per docs/domain/EXPORT_SCHEMA.md's "Version history" — no
    // antiscia/declinations/midpointTree/allMidpoints on the chart, which only matters if
    // this ever started validating chart rows; it deliberately does not (see module doc).
    const v1Shaped: unknown = {
      format: FULL_EXPORT_FORMAT,
      version: 1,
      exportedAt: '2020-01-01T00:00:00.000Z',
      app: { version: '1.0.0' },
      preferences: { settings: {}, rulership: 'modern', symbolClass: 'drawn' },
      note: '',
      people: [
        { id: 'p-ada', displayName: 'Ada', placeLabel: 'London', timeAccuracy: 'recorded', notes: '', missing: [] },
      ],
    };
    const result = validateFullExport(v1Shaped);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ kind: 'wrong-version', got: 1, expected: FULL_EXPORT_VERSION, direction: 'older' });
  });

  it('rejects a malformed civil date with a specific path', async () => {
    const archive = await build([ADA]);
    const copy = roundTripped(archive) as { people: [{ birth: { civil: { day: unknown } } }] };
    copy.people[0].birth.civil.day = 'thirty-one';
    const result = validateFullExport(copy);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ kind: 'malformed', path: 'people[0].birth.civil' });
  });

  it('rejects a duplicate custom-point id, invalidating the whole list atomically', async () => {
    const person: Person = { ...ADA, customPoints: [{ id: 'cp-1', name: 'A', formula: 'sun' }] };
    const archive = await build([person]);
    const copy = roundTripped(archive) as { people: [{ customPoints: unknown[] }] };
    copy.people[0].customPoints.push({ id: 'cp-1', name: 'B', formula: 'moon' });
    const result = validateFullExport(copy);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ kind: 'malformed', path: 'people[0].customPoints' });
  });

  it('rejects a person missing displayName, naming the exact field', async () => {
    const archive = await build([ADA]);
    const copy = roundTripped(archive) as { people: [Record<string, unknown>] };
    delete copy.people[0].displayName;
    const result = validateFullExport(copy);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ kind: 'malformed', path: 'people[0].displayName' });
  });

  it('never requires or restores the computed chart fields', async () => {
    const archive = await build([ADA]);
    const copy = roundTripped(archive) as { people: [Record<string, unknown>] };
    // A chart row deliberately corrupted — if this were validated, it would fail here.
    copy.people[0].natalChart = { not: 'a real chart' };
    const result = validateFullExport(copy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.people[0]).not.toHaveProperty('natalChart');
  });

  it('accepts an export with zero people', async () => {
    const archive = await build([]);
    const result = validateFullExport(roundTripped(archive));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.people).toEqual([]);
  });

  it('rejects a non-array people field', async () => {
    const archive = await build([ADA]);
    const copy = roundTripped(archive) as Record<string, unknown>;
    copy.people = { 'p-ada': ADA };
    const result = validateFullExport(copy);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ kind: 'malformed', path: 'people' });
  });

  it('rejects two people sharing one id, rather than silently folding them into one entity', async () => {
    const other: Person = { ...ADA, displayName: 'Impostor' };
    const archive = await build([ADA, other]); // buildFullExport itself doesn't dedupe ids
    const result = validateFullExport(roundTripped(archive));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ kind: 'malformed', path: 'people[1].id' });
  });

  it('rejects a person id that is a reserved register name, before it can reach store.mutate', async () => {
    const archive = await build([ADA]);
    const copy = roundTripped(archive) as { people: [{ id: string }] };
    copy.people[0].id = '__proto__';
    const result = validateFullExport(copy);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ kind: 'malformed', path: 'people[0].id' });
  });
});

// The #605 regression's defining trait is comparing against the *wrong* constant that happens
// to currently share a value with the right one (FULL_EXPORT_VERSION and
// calculation-snapshot.ts's CURRENT_SNAPSHOT_VERSION are both 2 today) — a numeric-mismatch
// test alone can't tell "right constant" from "wrong constant that coincides", which is exactly
// how #600 passed review once already. This is a structural check instead, matching this
// project's own precedent for import-boundary enforcement (`test/no-runtime-llm-access.test.ts`).
describe('version check is wired to the right constant (#605 regression)', () => {
  it('imports FULL_EXPORT_VERSION from full-export.js and never references calculation-snapshot', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/domain/full-export-importer.ts'), 'utf8');
    expect(source).toMatch(/import\s*\{[^}]*\bFULL_EXPORT_VERSION\b[^}]*\}\s*from\s*['"]\.\/full-export\.js['"]/);
    expect(source).not.toMatch(/calculation-snapshot/);
  });
});

describe('v2 files and per-person settings (#806)', () => {
  const custom = { ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'K', orbScalePercent: -40 };

  it('exports each person with their own settings, charted with them', async () => {
    const archive = await build([{ ...ADA, calculationSettings: custom }]);
    expect(archive.version).toBe(4);
    expect(archive.people[0]?.calculationSettings).toEqual(custom);
    const plain = await build([ADA]);
    expect(JSON.stringify(archive.people[0]?.natalChart)).not.toBe(JSON.stringify(plain.people[0]?.natalChart));
  });

  it('writes the device default into a person with no register, so the export is self-contained and round-trips', async () => {
    const archive = await buildFullExport({
      people: [ADA],
      provider: engine,
      appVersion: '9.9.9',
      settings: custom,
      rulership: 'modern',
      symbolClass: 'drawn',
      now: NOW,
    });
    expect(archive.people[0]?.calculationSettings).toEqual(custom);
    const result = validateFullExport(roundTripped(archive));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.people[0]?.calculationSettings).toEqual(custom);
    const preview = stageFullExportRestore(result.value, new Map());
    expect(preview.items[0]?.mutations.map((m) => m.field)).toContain('calculationSettings');
  });

  it('does not export settings for a person whose register is unreadable', async () => {
    const archive = await build([{ ...ADA, calculationSettingsUnreadable: true }]);
    expect(archive.people[0]?.calculationSettings).toBeUndefined();
  });

  it('refuses to chart a person whose saved settings are unreadable', async () => {
    const archive = await build([{ ...ADA, calculationSettingsUnreadable: true }]);
    expect(archive.people[0]?.natalChart).toBeUndefined();
    expect(archive.people[0]?.chartError).toMatch(/could not be read/);
  });

  it('round-trips a v3 person setting and stages it as a calculationSettings write', async () => {
    const archive = await build([{ ...ADA, calculationSettings: custom }]);
    const result = validateFullExport(roundTripped(archive));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const preview = stageFullExportRestore(result.value, new Map());
    expect(preview.items[0]?.mutations.map((m) => m.field)).toContain('calculationSettings');
  });

  it('accepts a v2 file: its people take the file preferences as their settings', async () => {
    const archive = await buildFullExport({
      people: [ADA],
      provider: engine,
      appVersion: '9.9.9',
      settings: custom,
      rulership: 'modern',
      symbolClass: 'drawn',
      now: NOW,
    });
    const v2 = { ...(roundTripped(archive) as Record<string, unknown>), version: 2 };
    const result = validateFullExport(v2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.people[0]?.calculationSettings).toMatchObject({ houseSystem: 'K', orbScalePercent: -40 });
  });

  it.each([
    ['garbage objectPolicies', { objectPolicies: 'garbage' }],
    ['a non-boolean visibility flag', { declinationVisible: 'yes' }],
    ['an out-of-range orb', { antisciaMaxOrb: -5 }],
  ])('fails a v2 import whose preferences.settings has %s', async (_name, bad) => {
    const archive = roundTripped(await build([ADA])) as { preferences: { settings: Record<string, unknown> } };
    archive.preferences.settings = { ...archive.preferences.settings, ...bad };
    const v2 = { ...archive, version: 2 };
    const result = validateFullExport(v2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ kind: 'malformed', path: 'preferences.settings' });
  });

  it.each([
    ['garbage objectPolicies', { objectPolicies: 'garbage' }],
    ['a non-boolean visibility flag', { declinationVisible: 'yes' }],
    ['an out-of-range orb', { antisciaMaxOrb: -5 }],
  ])('rejects a v3 person whose calculationSettings has %s', async (_name, bad) => {
    const archive = roundTripped(await build([{ ...ADA, calculationSettings: custom }])) as {
      people: { calculationSettings: Record<string, unknown> }[];
    };
    const first = archive.people[0];
    if (first === undefined) throw new Error('no person');
    first.calculationSettings = { ...first.calculationSettings, ...bad };
    const result = validateFullExport(archive);
    expect(result.ok).toBe(false);
  });

  it('rejects an unreadable per-person settings bag', async () => {
    const archive = roundTripped(await build([ADA])) as { people: Record<string, unknown>[] };
    archive.people[0] = { ...archive.people[0], calculationSettings: { houseSystem: 'nonsense' } };
    expect(validateFullExport(archive).ok).toBe(false);
  });
});

describe('per-person rulership and export v4 (#806)', () => {
  const buildWith = (people: readonly Person[], rulership: 'modern' | 'traditional' | 'both' = 'modern') =>
    buildFullExport({
      people,
      provider: engine,
      appVersion: '9.9.9',
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership,
      symbolClass: 'drawn',
      now: NOW,
    });

  it('exports each person with their own rulership, charted with it, and preferences.rulership as the default', async () => {
    const archive = await buildWith([
      { ...ADA, rulership: 'traditional' },
      { ...ADA, id: 'p-plain', displayName: 'Plain' },
    ]);
    expect(archive.version).toBe(4);
    expect(archive.preferences.rulership).toBe('modern');
    expect(archive.people[0]?.rulership).toBe('traditional');
    // A person with no rulership of their own is charted, and written, with the device default.
    expect(archive.people[1]?.rulership).toBe('modern');
    expect(archive.people[0]?.calculation?.snapshot.rulership).toBe('traditional');
    expect(archive.people[1]?.calculation?.snapshot.rulership).toBe('modern');
  });

  it('round-trips a v4 person rulership and stages it as a rulership write', async () => {
    const archive = await buildWith([{ ...ADA, rulership: 'both' }]);
    const result = validateFullExport(roundTripped(archive));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.people[0]?.rulership).toBe('both');
    const preview = stageFullExportRestore(result.value, new Map());
    expect(preview.items[0]?.mutations).toContainEqual({
      entity: 'person',
      entityId: ADA.id,
      field: 'rulership',
      value: 'both',
    });
  });

  it('stages nothing for a person who already holds the same rulership', async () => {
    const archive = await buildWith([{ ...ADA, calculationSettings: DEFAULT_EXTENDED_SETTINGS, rulership: 'both' }]);
    const result = validateFullExport(roundTripped(archive));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const preview = stageFullExportRestore(
      result.value,
      new Map([[ADA.id, { ...ADA, calculationSettings: DEFAULT_EXTENDED_SETTINGS, rulership: 'both' }]]),
    );
    expect(preview.items[0]?.status).toBe('unchanged');
    expect(preview.items[0]?.mutations).toEqual([]);
  });

  it('does not export a rulership for a person whose saved settings are unreadable', async () => {
    const archive = await buildWith([{ ...ADA, calculationSettingsUnreadable: true }]);
    expect(archive.people[0]?.rulership).toBeUndefined();
  });

  it.each([2, 3])('accepts a v%i file: its people take the file preferences as their rulership', async (version) => {
    const archive = await buildWith([ADA], 'traditional');
    const old = roundTripped(archive) as { people: Record<string, unknown>[] };
    for (const person of old.people) delete person.rulership;
    const result = validateFullExport({ ...old, version });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.people[0]?.rulership).toBe('traditional');
  });

  it('rejects an unknown rulership on a person, naming the path', async () => {
    const archive = roundTripped(await buildWith([ADA])) as { people: Record<string, unknown>[] };
    archive.people[0] = { ...archive.people[0], rulership: 'ptolemaic' };
    const result = validateFullExport(archive);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ kind: 'malformed', path: 'people[0].rulership' });
  });
});

describe('FULL_EXPORT_VERSION stayed at 2 through #585 (preferences.settings is never deeply validated)', () => {
  it('accepts a real archive whose preferences.settings is still pre-#585-shaped, with no objectPolicies field', async () => {
    const archive = roundTripped(await build([ADA])) as Record<string, unknown>;
    const preferences = archive.preferences as Record<string, unknown>;
    const legacyShaped = {
      ...archive,
      preferences: {
        ...preferences,
        // The exact pre-#585 shape: scattered booleans, no objectPolicies at all. #585
        // deliberately did not bump FULL_EXPORT_VERSION because validatePreferences only checks
        // `settings` is an object and never reads a field inside it — this is the regression
        // test for that claim, not just a doc comment asserting it.
        settings: {
          houseSystem: 'P',
          fortuneVisible: true,
          vertexVisible: false,
          chironVisible: false,
          aspectsToChiron: true,
          modernPointVisibility: { meanNode: true },
        },
      },
    };
    const result = validateFullExport(legacyShaped);
    expect(result.ok).toBe(true);
  });
});

describe('stageFullExportRestore', () => {
  it('classifies new/updated/unchanged, and an update only touches the fields that actually differ', async () => {
    const bob: Person = {
      id: 'p-bob',
      displayName: 'Bob',
      placeLabel: 'NYC',
      timeAccuracy: 'unknown',
      notes: '',
      missing: ['civil', 'coordinates'],
    };
    const carol: Person = { ...ADA, id: 'p-carol', displayName: 'Carol' };
    const dave: Person = { ...ADA, id: 'p-dave', displayName: 'Dave' };

    const archive = await build([bob, carol, dave]);
    const validated = validateFullExport(roundTripped(archive));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    // The export writes the device default into every person without a register (#806), so a device
    // already holding those settings as their own register sees no change.
    const withRegister = (person: Person): Person => ({
      ...person,
      calculationSettings: DEFAULT_EXTENDED_SETTINGS,
      rulership: 'modern',
    });
    const existing = new Map<string, Person>([
      ['p-carol', withRegister(carol)],
      ['p-dave', withRegister({ ...dave, notes: 'old notes' })],
      // p-bob is intentionally absent: this device has never seen it.
    ]);

    const preview = stageFullExportRestore(validated.value, existing);
    expect(preview.newCount).toBe(1);
    expect(preview.updatedCount).toBe(1);
    expect(preview.unchangedCount).toBe(1);

    const byId = new Map(preview.items.map((item) => [item.id, item]));
    expect(byId.get('p-bob')?.status).toBe('new');
    expect(byId.get('p-carol')?.status).toBe('unchanged');
    expect(byId.get('p-carol')?.mutations).toEqual([]);
    expect(byId.get('p-dave')?.status).toBe('updated');
    expect(byId.get('p-dave')?.mutations.map((mutation) => mutation.field)).toEqual(['notes']);
  });

  it('a brand-new person gets the full field set, with the birth moment as whole registers', async () => {
    const archive = await build([ADA]);
    const validated = validateFullExport(roundTripped(archive));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const preview = stageFullExportRestore(validated.value, new Map());
    const [item] = preview.items;
    expect(item?.status).toBe('new');
    const fields = item?.mutations.map((mutation) => mutation.field);
    expect(fields).toEqual(
      expect.arrayContaining(['displayName', 'placeLabel', 'notes', 'timeAccuracy', 'civil', 'coordinates']),
    );
  });

  it('never clears a field the export did not itself carry', async () => {
    // The export has no customPoints for Ada (she never had any); the local copy does.
    // A restore must not read that absence as "clear it" — see the module's own doc comment.
    const archive = await build([ADA]);
    const validated = validateFullExport(roundTripped(archive));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const localWithCustomPoints: Person = {
      ...ADA,
      customPoints: [{ id: 'cp-1', name: 'Kept', formula: 'sun' }],
    };
    const preview = stageFullExportRestore(validated.value, new Map([['p-ada', localWithCustomPoints]]));
    const [item] = preview.items;
    expect(item?.mutations.some((mutation) => mutation.field === 'customPoints')).toBe(false);
  });

  it('never clears a birth-level override (calendar/zoneOverride) the export does not carry, even when civil time changed', async () => {
    const withOverride: Person = {
      ...ADA,
      moment: { ...ADA_MOMENT, zoneOverride: 'Europe/London', calendar: 'gregorian' },
    };
    // The exported birth record differs (civil hour changed) but was built from a Person with
    // no override set, so the export's own birth record never carries zoneOverride/calendar.
    const changedCivil: Person = { ...ADA, moment: { ...ADA_MOMENT, civil: { ...ADA_MOMENT.civil, hour: 8 } } };
    const archive = await build([changedCivil]);
    const validated = validateFullExport(roundTripped(archive));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const preview = stageFullExportRestore(validated.value, new Map([['p-ada', withOverride]]));
    const [item] = preview.items;
    const fields = item?.mutations.map((mutation) => mutation.field);
    expect(fields).toContain('civil');
    expect(fields).not.toContain('zoneOverride');
    expect(fields).not.toContain('calendar');
  });

  it('writes relocationPlaces/customPoints (including a disabled point) when the export carries them and they differ', async () => {
    const withBoth: Person = {
      ...ADA,
      relocationPlaces: [{ id: 'place-1', label: 'Paris', latitude: 48.8566, longitude: 2.3522 }],
      customPoints: [{ id: 'cp-1', name: 'Disabled point', formula: 'sun', enabled: false }],
    };
    const archive = await build([withBoth]);
    const validated = validateFullExport(roundTripped(archive));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const preview = stageFullExportRestore(validated.value, new Map());
    const [item] = preview.items;
    const places = item?.mutations.find((mutation) => mutation.field === 'relocationPlaces')?.value;
    const points = item?.mutations.find((mutation) => mutation.field === 'customPoints')?.value;
    expect(places).toEqual([{ id: 'place-1', label: 'Paris', latitude: 48.8566, longitude: 2.3522 }]);
    expect(points).toEqual([{ id: 'cp-1', name: 'Disabled point', formula: 'sun', enabled: false }]);
  });

  it('a person with no recorded birth time writes no birth-moment fields, for either a new or existing person', async () => {
    const unknownTime: Person = {
      id: 'p-unknown',
      displayName: 'Unknown Time',
      placeLabel: '',
      timeAccuracy: 'unknown',
      notes: '',
      missing: ['civil', 'coordinates'],
    };
    const archive = await build([unknownTime]);
    const validated = validateFullExport(roundTripped(archive));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const birthFields = ['civil', 'coordinates', 'calendar', 'zoneOverride', 'offsetOverrideMinutes'];
    const newPreview = stageFullExportRestore(validated.value, new Map());
    expect(newPreview.items[0]?.mutations.map((mutation) => mutation.field)).toEqual(
      expect.not.arrayContaining(birthFields),
    );

    const existingPreview = stageFullExportRestore(
      validated.value,
      new Map([['p-unknown', { ...unknownTime, calculationSettings: DEFAULT_EXTENDED_SETTINGS, rulership: 'modern' }]]),
    );
    expect(existingPreview.items[0]?.status).toBe('unchanged');
  });

  it('classifies a person tombstoned on this device as deletedLocally, distinct from new/updated', async () => {
    const archive = await build([ADA]);
    const validated = validateFullExport(roundTripped(archive));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    // Absent from `existingPeople` (as a soft-deleted person is, per `fold.ts`'s `materialise`)
    // but present, with stale `notes`, in `deletedPeople` (`store.state.deleted.people`).
    const deletedCopy: Person = { ...ADA, notes: 'old notes' };
    const preview = stageFullExportRestore(validated.value, new Map(), new Map([['p-ada', deletedCopy]]));
    expect(preview.deletedLocallyCount).toBe(1);
    expect(preview.newCount).toBe(0);
    const [item] = preview.items;
    expect(item?.status).toBe('deletedLocally');
    // Still carries real field mutations (notes differs) — restoring never fabricates a
    // `deleted: false` write, but it also doesn't withhold the other field updates.
    expect(item?.mutations.map((mutation) => mutation.field)).toContain('notes');
    expect(item?.mutations.some((mutation) => mutation.field === 'deleted')).toBe(false);
  });
});

let dbCounter = 0;
function freshDbName(): string {
  dbCounter += 1;
  return `astraya-restore-test-${String(dbCounter)}`;
}

/** A clock the tests control, matching `test/store-store.test.ts`'s own convention. */
function ticking(start = 1_700_000_000_000): () => number {
  let millis = start;
  return () => {
    millis += 1000;
    return millis;
  };
}

async function withStore(body: (store: Store) => Promise<void>): Promise<void> {
  const store = await openStore({ name: freshDbName(), now: ticking() });
  try {
    await body(store);
  } finally {
    store.close();
  }
}

describe('restoring through the real store', () => {
  it('round-trips build -> validate -> stage -> write, reproducing an equivalent Person', async () => {
    const archive = await build([ADA]);
    const validated = validateFullExport(roundTripped(archive));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const preview = stageFullExportRestore(validated.value, new Map());

    await withStore(async (store) => {
      await store.mutate(preview.items.flatMap((item) => item.mutations));
      const restored = store.state.people.get('p-ada');
      expect(restored?.displayName).toBe(ADA.displayName);
      expect(restored?.placeLabel).toBe(ADA.placeLabel);
      expect(restored?.notes).toBe(ADA.notes);
      expect(restored?.timeAccuracy).toBe(ADA.timeAccuracy);
      expect(restored?.moment).toEqual(ADA.moment);
    });
  });

  // What `confirmRestore` in PreferencesView.tsx relies on: one `store.mutate` call for the
  // whole restore, so one bad entry cannot leave a half-applied batch (#587).
  it('a batch with one malformed mutation leaves every other person untouched', async () => {
    await withStore(async (store) => {
      const batch = [
        { entity: 'person', entityId: 'p-good', field: 'displayName', value: 'Good' },
        { entity: 'person', entityId: '__proto__', field: 'displayName', value: 'Bad' },
      ];
      await expect(store.mutate(batch)).rejects.toThrow(/reserved name/);
      expect(store.state.people.size).toBe(0);
    });
  });

  // The `deletedLocally` classification exists exactly to keep this from happening silently:
  // restoring a person this device already tombstoned must update their stored fields (so the
  // data is right if they're ever undeleted) without resurrecting them on its own.
  it('restoring a person tombstoned on this device updates their fields but leaves them deleted', async () => {
    await withStore(async (store) => {
      await store.mutate([
        { entity: 'person', entityId: 'p-ada', field: 'displayName', value: 'Ada Lovelace' },
        { entity: 'person', entityId: 'p-ada', field: 'notes', value: 'old notes' },
      ]);
      await store.remove('person', 'p-ada');
      expect(store.state.people.has('p-ada')).toBe(false);
      expect(store.state.deleted.people.has('p-ada')).toBe(true);

      const archive = await build([ADA]);
      const validated = validateFullExport(roundTripped(archive));
      expect(validated.ok).toBe(true);
      if (!validated.ok) return;
      const preview = stageFullExportRestore(validated.value, store.state.people, store.state.deleted.people);
      expect(preview.items[0]?.status).toBe('deletedLocally');

      await store.mutate(preview.items.flatMap((item) => item.mutations));
      // Still deleted — a restore never un-deletes on its own.
      expect(store.state.people.has('p-ada')).toBe(false);
      expect(store.state.deleted.people.has('p-ada')).toBe(true);
      // But the field data underneath the tombstone did get updated, so it's correct if the
      // person is ever restored through the normal "undelete" action.
      expect(store.state.deleted.people.get('p-ada')?.notes).toBe(ADA.notes);
    });
  });
});
