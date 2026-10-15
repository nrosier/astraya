/**
 * Checking a full export's recorded calculations against the real Swiss Ephemeris (#582
 * follow-up): verified/inconsistent/changed/no-artifact/error, each driven off the file's raw,
 * unvalidated people array the way `checkExportedCalculations` actually consumes it.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { checkExportedCalculations } from '../src/domain/full-export-check.js';
import { validateFullExport } from '../src/domain/full-export-importer.js';
import { buildFullExport } from '../src/domain/full-export.js';
import type { Person } from '../src/domain/person.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;
beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

const ADA: Person = {
  id: 'p-ada',
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
const NOW = new Date('2026-10-15T12:00:00.000Z');

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

const currentInputs = async () => ({ astrayaVersion: '9.9.9', swephVersion: await engine.version() });

describe('checkExportedCalculations', () => {
  it('reports "verified" when the file reproduces on the same engine', async () => {
    const archive = await build([ADA]);
    const rawFile = roundTripped(archive) as { people: readonly unknown[] };
    const validated = validateFullExport(rawFile);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const current = await currentInputs();
    const checks = await checkExportedCalculations(validated.value, rawFile.people, engine, current);
    expect(checks).toEqual([{ id: 'p-ada', displayName: 'Ada Lovelace', outcome: { kind: 'verified' } }]);
  });

  it('reports "inconsistent" when the recorded moment no longer hashes to the recorded inputHash', async () => {
    const archive = await build([ADA]);
    const rawFile = roundTripped(archive) as { people: [{ calculation: { moment: { civil: { day: number } } } }] };
    rawFile.people[0].calculation.moment.civil.day = 11; // tampered after the hash was recorded
    const validated = validateFullExport(rawFile);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const current = await currentInputs();
    const checks = await checkExportedCalculations(validated.value, rawFile.people, engine, current);
    expect(checks).toEqual([{ id: 'p-ada', displayName: 'Ada Lovelace', outcome: { kind: 'inconsistent' } }]);
  });

  it('reports "changed" when the inputs are intact but the recorded result hash is stale', async () => {
    const archive = await build([ADA]);
    const rawFile = roundTripped(archive) as { people: [{ calculation: { fingerprint: { resultHash: string } } }] };
    // moment/snapshot/technique untouched, so the input hash still matches — only the claimed
    // result differs, as it would after a genuine engine/ephemeris-data change.
    rawFile.people[0].calculation.fingerprint.resultHash = '0'.repeat(64);
    const validated = validateFullExport(rawFile);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const current = await currentInputs();
    const checks = await checkExportedCalculations(validated.value, rawFile.people, engine, current);
    // Nothing about the engine/provenance actually moved in this test (same engine, same
    // process, same assets), so the real diff is deterministically empty — asserting that
    // exactly, not just "is an array", so a spurious reported difference would fail this.
    expect(checks).toEqual([
      { id: 'p-ada', displayName: 'Ada Lovelace', outcome: { kind: 'changed', differences: [] } },
    ]);
  });

  it('reports "error" when the recorded provenance is missing a field the "changed" diff reads', async () => {
    const archive = await build([ADA]);
    const rawFile = roundTripped(archive) as {
      people: [{ calculation: { provenance: { time?: unknown }; fingerprint: { resultHash: string } } }];
    };
    // moment/snapshot/technique untouched, so the inputHash gate still passes and a real
    // recompute runs; resultHash tampered so verification takes the "changed" branch into
    // `differencesBetween`, which unconditionally reads `recorded.provenance.time.tzdbFingerprint`
    // — the deeper throw risk this module's own doc comment names, distinct from the shallower
    // one the "garbage" case below exercises.
    rawFile.people[0].calculation.fingerprint.resultHash = '0'.repeat(64);
    delete rawFile.people[0].calculation.provenance.time;
    const validated = validateFullExport(rawFile);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const current = await currentInputs();
    const checks = await checkExportedCalculations(validated.value, rawFile.people, engine, current);
    expect(checks).toHaveLength(1);
    expect(checks[0]?.outcome.kind).toBe('error');
    if (checks[0]?.outcome.kind === 'error') {
      expect(checks[0].outcome.message.length).toBeGreaterThan(0);
    }
  });

  it('reports "no-artifact" for a person with no calculation field at all', async () => {
    const archive = await build([ADA]);
    const validated = validateFullExport(roundTripped(archive));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const rawPeopleWithoutCalculation = [{ id: 'p-ada', displayName: 'Ada Lovelace' }];
    const current = await currentInputs();
    const checks = await checkExportedCalculations(validated.value, rawPeopleWithoutCalculation, engine, current);
    expect(checks).toEqual([{ id: 'p-ada', displayName: 'Ada Lovelace', outcome: { kind: 'no-artifact' } }]);
  });

  it('reports "error" rather than throwing, for a calculation field that is not a usable shape', async () => {
    const archive = await build([ADA]);
    const validated = validateFullExport(roundTripped(archive));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const rawPeopleWithGarbage = [{ id: 'p-ada', displayName: 'Ada Lovelace', calculation: 'garbage-not-an-object' }];
    const current = await currentInputs();
    const checks = await checkExportedCalculations(validated.value, rawPeopleWithGarbage, engine, current);
    expect(checks).toHaveLength(1);
    expect(checks[0]?.outcome.kind).toBe('error');
    if (checks[0]?.outcome.kind === 'error') {
      expect(checks[0].outcome.message.length).toBeGreaterThan(0);
    }
  });

  it('aligns each outcome to the right person by position, not by searching for a matching id', async () => {
    const BOB: Person = {
      id: 'p-bob',
      displayName: 'Bob Noyce',
      placeLabel: 'San Francisco, CA',
      timeAccuracy: 'recorded',
      notes: '',
      missing: [],
      moment: {
        civil: { year: 1927, month: 12, day: 12, hour: 10, minute: 0, second: 0 },
        coordinates: { latitude: 37.7749, longitude: -122.4194 },
      },
    };
    const archive = await build([ADA, BOB]);
    const rawFile = roundTripped(archive) as {
      people: [{ calculation?: unknown }, { calculation: { moment: { civil: { day: number } } } }];
    };
    // Two different outcome kinds, deliberately — a same-kind pair wouldn't expose an index
    // swap between `archive.people` and `rawPeople` the way different kinds would.
    delete rawFile.people[0].calculation; // Ada: no artifact at all
    rawFile.people[1].calculation.moment.civil.day = 13; // Bob: tampered after the hash was recorded

    const validated = validateFullExport(rawFile);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const current = await currentInputs();
    const checks = await checkExportedCalculations(validated.value, rawFile.people, engine, current);
    expect(checks).toEqual([
      { id: 'p-ada', displayName: 'Ada Lovelace', outcome: { kind: 'no-artifact' } },
      { id: 'p-bob', displayName: 'Bob Noyce', outcome: { kind: 'inconsistent' } },
    ]);
  });
});
