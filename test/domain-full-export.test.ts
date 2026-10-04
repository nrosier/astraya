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
} from '../src/domain/full-export.js';
import type { Person } from '../src/domain/person.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
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

const build = (people: readonly Person[]) =>
  buildFullExport({
    people,
    provider: engine,
    appVersion: '9.9.9',
    rulership: 'modern',
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
    expect(chart?.houses?.derivedPoints.length).toBeGreaterThan(0);
    expect((chart?.aspects.length ?? 0) > 0).toBe(true);
    expect(chart?.dignities.length).toBeGreaterThan(0);
    expect(['day', 'night']).toContain(chart?.sect);
    // The same Sun the chart screen shows: Ada Lovelace's Sun is in Sagittarius.
    expect(chart?.positions.find((row) => row.bodyKey === 'sun')?.sign).toBe('Sagittarius');
  });

  it('leaves out the houses for an unknown birth time, as the chart screen does', async () => {
    const [person] = (await build([UNKNOWN_TIME])).people;
    expect(person?.natalChart?.houses).toBeUndefined();
    expect(person?.natalChart?.positions.some((row) => row.bodyKey === 'asc')).toBe(false);
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
