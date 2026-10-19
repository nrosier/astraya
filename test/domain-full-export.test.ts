/**
 * The full export (#export) against the real Swiss Ephemeris: every person with the birth record as stored,
 * the natal chart's tables for each one that has a complete birth moment, and a spreadsheet of the people.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildFullExport,
  FULL_EXPORT_FORMAT,
  FULL_EXPORT_VERSION,
  fullExportFilename,
  peopleCsvFilename,
  peopleToCsv,
  type FullExport,
} from '../src/domain/full-export.js';
import { VARGA_PRESETS } from '../src/astrology/harmonics.js';
import type { Person } from '../src/domain/person.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { DEFAULT_EXTENDED_SETTINGS, toChartCalculationOptions } from '../src/chart/extended-settings.js';
import { buildCalculationArtifact } from '../src/domain/calculation-artifact.js';
import { CURRENT_SNAPSHOT_VERSION, parseCalculationSnapshot } from '../src/domain/calculation-snapshot.js';
import { computeChartData } from '../src/domain/chart-compute.js';
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
  notes: 'Wrote, "the first program".\nSecond line.',
  missing: [],
  moment: {
    civil: { year: 1815, month: 12, day: 10, hour: 7, minute: 45, second: 0 },
    coordinates: { latitude: 51.5072, longitude: -0.1276 },
  },
};
const UNKNOWN_TIME: Person = {
  ...ADA,
  id: 'p-unknown',
  displayName: 'Unknown Time',
  timeAccuracy: 'unknown',
  notes: '',
};
const INCOMPLETE: Person = {
  id: 'p-incomplete',
  displayName: '',
  placeLabel: '',
  timeAccuracy: 'recorded',
  notes: 'no date yet',
  missing: ['civil'],
};
const NOW = new Date('2026-10-04T12:00:00.000Z');

// Born while Pluto transited Scorpio (1983-11-05 to 1995-01-17): under 'modern' rulership Pluto
// rules its own sign here (ruler: true), but under 'traditional' rulership Scorpio's ruler is
// Mars, not Pluto, so the same placement must score as non-ruling (#460).
const PLUTO_IN_SCORPIO: Person = {
  ...ADA,
  id: 'p-pluto-scorpio',
  displayName: 'Pluto In Scorpio',
  moment: {
    civil: { year: 1990, month: 6, day: 1, hour: 12, minute: 0, second: 0 },
    coordinates: { latitude: 51.5072, longitude: -0.1276 },
  },
};

const build = (people: readonly Person[], rulership: 'modern' | 'traditional' | 'both' = 'modern') =>
  buildFullExport({
    people,
    provider: engine,
    appVersion: '9.9.9',
    settings: DEFAULT_EXTENDED_SETTINGS,
    rulership,
    symbolClass: 'drawn',
    now: NOW,
  });

describe('buildFullExport', () => {
  it('states what it is, when and by which version, and which preferences were in force', async () => {
    const archive = await build([ADA]);
    expect(archive).toMatchObject({
      format: FULL_EXPORT_FORMAT,
      version: FULL_EXPORT_VERSION,
      exportedAt: '2026-10-04T12:00:00.000Z',
      app: { version: '9.9.9' },
      preferences: { rulership: 'modern', symbolClass: 'drawn' },
    });
    expect(archive.note).toMatch(/recalculated/);
  });

  it('states this device’s own effective settings, not a fixed "application defaults" claim (#541)', async () => {
    const customSettings = { ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'K', orbScalePercent: -40 };
    const archive = await buildFullExport({
      people: [ADA],
      provider: engine,
      appVersion: '9.9.9',
      settings: customSettings,
      rulership: 'traditional',
      symbolClass: 'drawn',
      now: NOW,
    });
    expect(archive.preferences.settings).toEqual(customSettings);
    expect(archive.note).toContain("this device's own current calculation settings");
    expect(archive.note).toContain('traditional');
    expect(archive.note).not.toContain('application defaults');

    // The chart itself was actually computed under Koch houses, not silently defaulted to Placidus.
    const defaultArchive = await build([ADA]);
    const kochCusps = archive.people[0]?.natalChart?.houses?.cusps;
    const placidusCusps = defaultArchive.people[0]?.natalChart?.houses?.cusps;
    expect(kochCusps).toBeDefined();
    expect(kochCusps).not.toEqual(placidusCusps);
  });

  it('says plainly when the application defaults really were used, unchanged', async () => {
    const archive = await build([ADA]);
    expect(archive.preferences.settings).toEqual(DEFAULT_EXTENDED_SETTINGS);
    expect(archive.note).toContain('application defaults');
  });

  it('holds the birth record as stored and the natal chart’s data for a person with a complete moment', async () => {
    const [ada] = (await build([ADA])).people;
    expect(ada).toMatchObject({
      id: 'p-ada',
      displayName: 'Ada Lovelace',
      placeLabel: 'London, UK',
      notes: ADA.notes,
      birth: ADA.moment,
    });
    const chart = ada?.natalChart;
    expect(chart?.positions.map((row) => row.bodyKey)).toEqual(expect.arrayContaining(['sun', 'moon', 'asc', 'mc']));
    expect(chart?.houses?.cusps).toHaveLength(12);
    // Empty under the app's own defaults is correct now (#542): Fortune/Vertex/Spirit/midpoints
    // are all hidden by default, same as the live chart screen shows for a never-customized chart.
    expect(chart?.houses?.derivedPoints).toEqual([]);
    expect((chart?.aspects.length ?? 0) > 0).toBe(true);
    expect(chart?.dignities.length).toBeGreaterThan(0);
    expect(['day', 'night']).toContain(chart?.sect);
    // The same Sun the chart screen shows: Ada Lovelace's Sun is in Sagittarius.
    expect(chart?.positions.find((row) => row.bodyKey === 'sun')?.sign).toBe('Sagittarius');
    // #556: antiscia/declinations are always included (same "compute, don't gate" convention
    // as the live chart screen); midpoint tree and all-midpoints are empty under default
    // settings, since `dial90Visible`/`midpointsVisible` are both off by default.
    expect(Array.isArray(chart?.antiscia)).toBe(true);
    expect(Array.isArray(chart?.declinations)).toBe(true);
    expect(chart?.midpointTree).toEqual([]);
    expect(chart?.allMidpoints).toEqual([]);
    expect(ada?.harmonicCharts?.map((harmonic) => harmonic.key)).toEqual(['D1', 'D9', 'D10']);
    // #725: the D10 export says the classical odd/even sign restart is not applied.
    expect(ada?.harmonicCharts?.find((harmonic) => harmonic.key === 'D10')?.convention).toMatch(/odd\/even/);
    for (const harmonic of ada?.harmonicCharts ?? []) {
      expect(harmonic.source).toEqual({
        kind: 'radix',
        transform: 'longitude-times-n-mod-360',
        houses: 'whole-sign-from-harmonic-ascendant',
      });
      expect(harmonic.convention).toBe(VARGA_PRESETS.find((preset) => preset.key === harmonic.key)?.description);
      expect(harmonic.radixPositions.length).toBeGreaterThan(0);
      expect(harmonic.chart.houses?.cusps).toHaveLength(12);
    }
  });

  it('includes saved custom formula points in natal and harmonic exports', async () => {
    const person: Person = {
      ...ADA,
      customPoints: [{ id: 'formula-point', name: 'Formula point', formula: 'ascendant + moon - sun' }],
    };
    const [exported] = (await build([person])).people;

    expect(exported?.natalChart?.positions.some((row) => row.bodyName === 'Formula point')).toBe(true);
    for (const harmonic of exported?.harmonicCharts ?? []) {
      expect(harmonic.chart.positions.some((row) => row.bodyName === 'Formula point')).toBe(true);
      expect(harmonic.radixPositions.some((row) => row.bodyName === 'Formula point')).toBe(true);
    }
  });

  it('carries relocationPlaces/customPoints back out, so a restore (#587) is not lossy', async () => {
    const withBoth: Person = {
      ...ADA,
      relocationPlaces: [{ id: 'place-1', label: 'Paris', latitude: 48.8566, longitude: 2.3522 }],
      customPoints: [{ id: 'formula-point', name: 'Formula point', formula: 'ascendant + moon - sun' }],
    };
    const [exported] = (await build([withBoth])).people;
    expect(exported?.relocationPlaces).toEqual(withBoth.relocationPlaces);
    expect(exported?.customPoints).toEqual(withBoth.customPoints);

    // A person with neither omits both keys entirely, matching `birth`'s own absence rule —
    // never an empty array standing in for "nothing saved".
    const [plain] = (await build([ADA])).people;
    expect(plain).not.toHaveProperty('relocationPlaces');
    expect(plain).not.toHaveProperty('customPoints');
  });

  it('includes 90°-dial midpoint-tree hits once dial90Visible is set (#556)', async () => {
    const archive = await buildFullExport({
      people: [ADA],
      provider: engine,
      appVersion: '9.9.9',
      settings: { ...DEFAULT_EXTENDED_SETTINGS, dial90Visible: true, midpointTreeOrb: 3 },
      rulership: 'modern',
      symbolClass: 'drawn',
      now: NOW,
    });
    const chart = archive.people[0]?.natalChart;
    expect(chart?.midpointTree).toBeDefined();
    // Not asserting any specific hit (depends on Ada's real positions) — just that the gate works
    // and the shape is right when enabled.
    for (const row of chart?.midpointTree ?? []) {
      expect(row.orb).toBeLessThanOrEqual(3);
    }
  });

  it('includes every body-pair midpoint (direct and indirect) once midpointsVisible is set (#555)', async () => {
    const archive = await buildFullExport({
      people: [ADA],
      provider: engine,
      appVersion: '9.9.9',
      settings: { ...DEFAULT_EXTENDED_SETTINGS, midpointsVisible: true },
      rulership: 'modern',
      symbolClass: 'drawn',
      now: NOW,
    });
    const chart = archive.people[0]?.natalChart;
    expect(chart?.allMidpoints.length ?? 0).toBeGreaterThan(0);
    expect(chart?.allMidpoints.filter((row) => row.kind === 'direct').length).toBe(
      chart?.allMidpoints.filter((row) => row.kind === 'indirect').length,
    );
  });

  it('computes dignities under the device’s own rulership scheme, not a hardcoded one (#460)', async () => {
    const [modern] = (await build([PLUTO_IN_SCORPIO], 'modern')).people;
    const [traditional] = (await build([PLUTO_IN_SCORPIO], 'traditional')).people;
    const plutoRow = (person: typeof modern) => person?.natalChart?.dignities.find((row) => row.bodyKey === 'pluto');

    const underModern = plutoRow(modern);
    const underTraditional = plutoRow(traditional);
    expect(underModern?.ruler).toBe(true);
    // Before the fix, `data.dignities` was always computed with the hardcoded default ('modern'),
    // so this stayed `true` even when the export's own `preferences.rulership` said 'traditional'.
    expect(underTraditional?.ruler).toBe(false);
  });

  it('leaves out the houses for an unknown birth time, as the chart screen does', async () => {
    const [person] = (await build([UNKNOWN_TIME])).people;
    expect(person?.natalChart?.houses).toBeUndefined();
    expect(person?.natalChart?.positions.some((row) => row.bodyKey === 'asc')).toBe(false);
    expect(person?.harmonicCharts).toBeUndefined();
  });

  it('keeps a person with no usable birth moment, saying what is missing, and never invents a chart', async () => {
    const [person] = (await build([INCOMPLETE])).people;
    expect(person).toMatchObject({ id: 'p-incomplete', missing: ['civil'], notes: 'no date yet' });
    expect(person?.natalChart).toBeUndefined();
    expect(person?.birth).toBeUndefined();
  });

  it('does not lose the other people when one chart cannot be calculated', async () => {
    if (ADA.moment === undefined) throw new Error('fixture bug: ADA has a birth moment');
    const outOfRange: Person = {
      ...ADA,
      id: 'p-far',
      moment: {
        ...ADA.moment,
        civil: { year: 5000, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      },
    };
    const people = (await build([ADA, outOfRange, INCOMPLETE])).people;
    expect(people.map((p) => p.id)).toEqual(['p-ada', 'p-far', 'p-incomplete']);
    expect(people[0]?.natalChart).toBeDefined();
    expect(people[1]?.natalChart).toBeUndefined();
    expect(people[1]?.chartError).toMatch(/.+/);
  });

  it('is plain JSON that survives a round trip', async () => {
    const archive = await build([ADA, UNKNOWN_TIME, INCOMPLETE]);
    expect(JSON.parse(JSON.stringify(archive))).toEqual(archive);
  });
});

describe('peopleToCsv and the filenames', () => {
  it('writes one row per person with the birth record in plain columns, quoting what needs it', () => {
    const lines = peopleToCsv([ADA, UNKNOWN_TIME, INCOMPLETE]).trimEnd().split('\n');
    expect(lines[0]).toBe(
      'name,date,time,time accuracy,place,latitude,longitude,utc offset override (minutes),timezone override,calendar,notes',
    );
    // The note with a quote and a newline is one quoted field, so its newline splits the physical line.
    const csv = peopleToCsv([ADA]);
    expect(csv).toContain('"Wrote, ""the first program"".\nSecond line."');
    expect(csv).toContain('Ada Lovelace,1815-12-10,07:45:00,recorded,"London, UK",51.5072,-0.1276');
    // An unknown time is blank, not a made-up midnight; a person with no moment has blank birth columns.
    expect(peopleToCsv([UNKNOWN_TIME])).toContain('Unknown Time,1815-12-10,,unknown');
    expect(peopleToCsv([INCOMPLETE])).toContain(',,,recorded,,,,,,,no date yet');
  });

  it('names the files by day', () => {
    expect(fullExportFilename(NOW)).toBe('astraya-export-2026-10-04.json');
    expect(peopleCsvFilename(NOW)).toBe('astraya-people-2026-10-04.csv');
  });
});

describe('the natal calculation artifact in a full export (#582)', () => {
  const WITH_POINT: Person = {
    ...ADA,
    customPoints: [{ id: 'fortune-like', name: 'Fortune-like', formula: 'ascendant + moon - sun' }],
  };

  it('carries the complete inputs, versions and SHA-256 fingerprints', async () => {
    const archive = await build([WITH_POINT], 'traditional');
    const calculation = archive.people[0]?.calculation;
    expect(calculation?.moment).toEqual(WITH_POINT.moment);
    expect(calculation?.snapshot).toMatchObject({ version: CURRENT_SNAPSHOT_VERSION, rulership: 'traditional' });
    expect(calculation?.snapshot.customPoints).toEqual(WITH_POINT.customPoints);
    expect(calculation?.provenance.astrayaVersion).toBe('9.9.9');
    expect(calculation?.provenance.swephVersion).toBe(await engine.version());
    expect(calculation?.fingerprint.resultHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is verifiable: recomputing from the exported inputs alone reproduces the result hash', async () => {
    const archive = JSON.parse(JSON.stringify(await build([WITH_POINT]))) as FullExport;
    const calculation = archive.people[0]?.calculation;
    if (calculation === undefined) throw new Error('expected a calculation artifact');
    const snapshot = parseCalculationSnapshot(calculation.snapshot);
    const data = await computeChartData(calculation.moment, engine, {
      ...toChartCalculationOptions(snapshot.settings),
      rulership: snapshot.rulership,
      customPoints: snapshot.customPoints,
    });
    const recomputed = await buildCalculationArtifact(snapshot, calculation.moment, data, {
      astrayaVersion: calculation.provenance.astrayaVersion,
      swephVersion: calculation.provenance.swephVersion,
    });
    expect(recomputed.fingerprint).toEqual(calculation.fingerprint);
  });

  it('leaves out the artifact, not the person, when there is no birth moment to calculate', async () => {
    const withoutMoment: Person = {
      id: ADA.id,
      displayName: ADA.displayName,
      placeLabel: ADA.placeLabel,
      timeAccuracy: ADA.timeAccuracy,
      notes: ADA.notes,
      missing: ['date'],
    };
    const archive = await build([withoutMoment]);
    expect(archive.people[0]?.calculation).toBeUndefined();
  });
});
