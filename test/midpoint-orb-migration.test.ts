/**
 * The midpoint-tree orb default change (#2045): 0°15′ on the 90° dial, Solar Fire's 1°00′ on the 360° circle.
 *
 * Owner decision on #2045: live settings written before the change that still hold the old default, exactly 1°, read as
 * the new default; any other value is kept. Snapshots (share links, calculation artifacts) keep their stored orb, so
 * they reproduce what was calculated when they were made.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTENDED_SETTINGS,
  MIDPOINT_TREE_ORB_DEFAULT,
  withCurrentMidpointOrbDefault,
} from '../src/chart/extended-settings.js';
import { ACCOUNT_PROFILE_FIELD } from '../src/store/account.js';
import { readAccountFieldValue } from '../src/domain/account-preferences.js';
import { decodeCalculationSnapshot, parseCalculationSnapshot } from '../src/domain/calculation-snapshot.js';
import { validateFullExport } from '../src/domain/full-export-importer.js';
import { buildFullExport } from '../src/domain/full-export.js';
import {
  buildPerson,
  readCalculationSettings,
  serializeCalculationSettings,
  SETTINGS_REGISTER_VERSION,
  type Person,
} from '../src/domain/person.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { getEngine } from './engine-harness.js';

const OLD_DEFAULT = { ...DEFAULT_EXTENDED_SETTINGS, midpointTreeOrb: 1 };

/** A register exactly as a build from before #2045 wrote it. */
function oldRegister(midpointTreeOrb: number): unknown {
  return JSON.parse(JSON.stringify({ version: 3, settings: { ...DEFAULT_EXTENDED_SETTINGS, midpointTreeOrb } }));
}

function orbOf(read: ReturnType<typeof readCalculationSettings>): number | undefined {
  return read?.kind === 'settings' ? read.settings.midpointTreeOrb : undefined;
}

describe('the midpoint-tree orb default (#2045)', () => {
  it('is 0°15′, a quarter of Solar Fire’s 1° on the 90° dial', () => {
    expect(MIDPOINT_TREE_ORB_DEFAULT).toBe(0.25);
    expect(DEFAULT_EXTENDED_SETTINGS.midpointTreeOrb).toBe(0.25);
  });

  it('withCurrentMidpointOrbDefault moves only the old default, 1, and keeps every other value', () => {
    expect(withCurrentMidpointOrbDefault(OLD_DEFAULT).midpointTreeOrb).toBe(0.25);
    for (const orb of [0, 0.25, 0.5, 1.5, 2, 10]) {
      const settings = { ...DEFAULT_EXTENDED_SETTINGS, midpointTreeOrb: orb };
      expect(withCurrentMidpointOrbDefault(settings)).toBe(settings);
    }
  });
});

describe('live settings: a person’s register (#2045)', () => {
  it('reads an old register’s untouched 1° as 0°15′', () => {
    expect(orbOf(readCalculationSettings(oldRegister(1)))).toBe(0.25);
  });

  it('keeps any other value in an old register', () => {
    expect(orbOf(readCalculationSettings(oldRegister(1.5)))).toBe(1.5);
    expect(orbOf(readCalculationSettings(oldRegister(0.5)))).toBe(0.5);
  });

  it('keeps a 1° written after the change, which is the user’s own choice', () => {
    const register = serializeCalculationSettings(OLD_DEFAULT);
    expect(register).toMatchObject({ version: SETTINGS_REGISTER_VERSION });
    expect(SETTINGS_REGISTER_VERSION).toBe(4);
    expect(orbOf(readCalculationSettings(register))).toBe(1);
  });

  it('is idempotent: reading, writing back and reading again keeps 0°15′', () => {
    const first = readCalculationSettings(oldRegister(1));
    if (first?.kind !== 'settings') throw new Error('unreadable');
    const second = readCalculationSettings(serializeCalculationSettings(first.settings));
    expect(orbOf(second)).toBe(0.25);
  });

  it('gives a person built from an old register the new default', () => {
    const person = buildPerson('p', new Map([['calculationSettings', oldRegister(1)]]));
    expect(person.calculationSettings?.midpointTreeOrb).toBe(0.25);
  });

  it('applies the same rule to the account’s default calculation profile', () => {
    expect(readAccountFieldValue(ACCOUNT_PROFILE_FIELD, oldRegister(1))?.midpointTreeOrb).toBe(0.25);
    expect(readAccountFieldValue(ACCOUNT_PROFILE_FIELD, oldRegister(2))?.midpointTreeOrb).toBe(2);
    expect(
      readAccountFieldValue(ACCOUNT_PROFILE_FIELD, serializeCalculationSettings(OLD_DEFAULT))?.midpointTreeOrb,
    ).toBe(1);
  });
});

describe('snapshots keep their stored orb (#2045)', () => {
  it.each([3, 4])('a version-%i snapshot holding 1° still reads 1°', (version) => {
    const snapshot = { version, settings: OLD_DEFAULT, rulership: 'modern' };
    expect(decodeCalculationSnapshot(JSON.parse(JSON.stringify(snapshot))).settings.midpointTreeOrb).toBe(1);
    expect(parseCalculationSnapshot(JSON.parse(JSON.stringify(snapshot))).settings.midpointTreeOrb).toBe(1);
  });

  it('a new snapshot with no orb of its own takes the new default', () => {
    expect(parseCalculationSnapshot({ version: 4, settings: {} }).settings.midpointTreeOrb).toBe(0.25);
  });
});

describe('importing a full export (#2045)', () => {
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
    calculationSettings: OLD_DEFAULT,
  };

  async function importedOrb(version: number): Promise<number | undefined> {
    const archive = await buildFullExport({
      people: [ADA],
      provider: engine,
      appVersion: '9.9.9',
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: 'modern',
      symbolClass: 'drawn',
      now: new Date('2026-11-27T12:00:00.000Z'),
    });
    const file = JSON.parse(JSON.stringify({ ...archive, version })) as unknown;
    const result = validateFullExport(file);
    if (!result.ok) throw new Error(`import refused: ${JSON.stringify(result.error)}`);
    return result.value.people[0]?.calculationSettings?.midpointTreeOrb;
  }

  it('reads a person’s 1° from an export older than v5 as the old default, 0°15′', async () => {
    expect(await importedOrb(4)).toBe(0.25);
  });

  it('keeps a person’s 1° from a v5 export, written after the change', async () => {
    expect(await importedOrb(5)).toBe(1);
  });
});
