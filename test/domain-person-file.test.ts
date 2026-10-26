/** One person to and from a file on the birth-record page (#699): round trips and the replace staging. */
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { peopleToAaf } from '../src/domain/aaf-people.js';
import { buildFullExport } from '../src/domain/full-export.js';
import type { Person } from '../src/domain/person.js';
import { readPersonFile, stagePersonReplace } from '../src/domain/person-file.js';
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
  notes: 'Wrote the first program.',
  missing: [],
  moment: {
    civil: { year: 1815, month: 12, day: 10, hour: 7, minute: 45, second: 0 },
    coordinates: { latitude: 51.5072, longitude: -0.1276 },
  },
};
const KEPT: Person = {
  id: 'p-here',
  displayName: 'Name on this page',
  placeLabel: 'Amsterdam',
  timeAccuracy: 'approximate',
  notes: 'Kept notes.',
  missing: [],
  moment: {
    civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
    coordinates: { latitude: 52.37, longitude: 4.9 },
  },
};

describe('readPersonFile (#699)', () => {
  it('reads one person back from an Astraya JSON export of them', async () => {
    const archive = await buildFullExport({
      people: [ADA],
      provider: engine,
      appVersion: '9.9.9',
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: 'modern',
      symbolClass: 'drawn',
      now: new Date('2026-10-18T12:00:00Z'),
    });
    const read = readPersonFile(JSON.stringify(archive));
    if (!read.ok) throw new Error('expected the file to read');
    expect(read.people).toHaveLength(1);
    expect(read.people[0]).toMatchObject({ displayName: 'Ada Lovelace', placeLabel: 'London, UK', birth: ADA.moment });
  });

  it('reads one person back from an AAF export of them', () => {
    const read = readPersonFile(peopleToAaf([ADA]).text);
    if (!read.ok) throw new Error('expected the file to read');
    expect(read.people).toHaveLength(1);
    expect(read.people[0]?.birth?.civil).toEqual(ADA.moment?.civil);
  });

  it('says why a file cannot be read', () => {
    expect(readPersonFile('not json at all')).toEqual({ ok: false, error: { kind: 'not-json' } });
    const wrong = readPersonFile(JSON.stringify({ format: 'something-else' }));
    expect(!wrong.ok && wrong.error.kind).toBe('invalid-export');
  });
});

describe('stagePersonReplace (#699)', () => {
  it('replaces the birth data, place and time accuracy, and keeps this person’s id, name and notes', () => {
    const read = readPersonFile(peopleToAaf([ADA]).text);
    if (!read.ok || read.people[0] === undefined) throw new Error('fixture bug');
    const { mutations, changes } = stagePersonReplace(KEPT, read.people[0]);
    expect(mutations.every((mutation) => mutation.entityId === 'p-here')).toBe(true);
    const fields = mutations.map((mutation) => mutation.field);
    expect(fields).toEqual(expect.arrayContaining(['civil', 'coordinates', 'placeLabel']));
    expect(fields).not.toContain('displayName');
    expect(fields).not.toContain('notes');
    expect(changes.map((change) => change.field)).toEqual(
      expect.arrayContaining(['date', 'time', 'placeLabel', 'coordinates']),
    );
    expect(changes.find((change) => change.field === 'date')).toEqual({
      field: 'date',
      before: '1990-06-15',
      after: '1815-12-10',
    });
  });

  it('writes nothing when the file holds the same birth data', () => {
    const read = readPersonFile(peopleToAaf([ADA]).text);
    if (!read.ok || read.people[0] === undefined) throw new Error('fixture bug');
    const same = { ...ADA, timeAccuracy: read.people[0].timeAccuracy, placeLabel: read.people[0].placeLabel };
    const { mutations, changes } = stagePersonReplace(same, read.people[0]);
    expect(changes).toEqual([]);
    expect(mutations).toEqual([]);
  });

  it('never writes calculation settings or rulership, even from a v4 file that carries them (#806)', async () => {
    const archive = await buildFullExport({
      people: [{ ...ADA, calculationSettings: { ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'K' }, rulership: 'both' }],
      provider: engine,
      appVersion: '9.9.9',
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: 'modern',
      symbolClass: 'drawn',
      now: new Date('2026-10-18T12:00:00Z'),
    });
    const read = readPersonFile(JSON.stringify(archive));
    if (!read.ok || read.people[0] === undefined) throw new Error('fixture bug');
    expect(read.people[0].rulership).toBe('both');
    const { mutations } = stagePersonReplace(KEPT, read.people[0]);
    const fields = mutations.map((mutation) => mutation.field);
    expect(fields).toContain('civil');
    expect(fields).not.toContain('calculationSettings');
    expect(fields).not.toContain('rulership');
  });
});
