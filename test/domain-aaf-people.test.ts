/**
 * AAF people exchange (#591): a person written as AAF and read back stages as "unchanged", a file from another
 * program stages as new people, and nothing AAF cannot hold is lost for a file Astraya wrote itself.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aafToExportedPeople, isAafText, peopleToAaf } from '../src/domain/aaf-people.js';
import { stageFullExportRestore } from '../src/domain/full-export-importer.js';
import { peopleAafFilename, type FullExport } from '../src/domain/full-export.js';
import { buildPerson, type Person } from '../src/domain/person.js';

const ADA: Person = buildPerson(
  'p-ada',
  new Map<string, unknown>([
    ['displayName', 'Ada Lovelace'],
    ['civil', { year: 1815, month: 12, day: 10, hour: 7, minute: 45, second: 0 }],
    ['coordinates', { latitude: 51.5, longitude: -0.125 }],
    ['calendar', 'gregorian'],
    ['offsetOverrideMinutes', 0],
    ['placeLabel', 'London'],
    ['timeAccuracy', 'remembered'],
    ['notes', 'From family letters, with a comma'],
    ['relocationPlaces', [{ id: 'r1', label: 'Paris', latitude: 48.8566, longitude: 2.3522 }]],
  ]),
);

const NO_BIRTH: Person = buildPerson('p-empty', new Map<string, unknown>([['displayName', 'Not yet entered']]));

function archiveOf(people: ReturnType<typeof aafToExportedPeople>['people']): Pick<FullExport, 'people'> {
  return { people };
}

describe('peopleToAaf', () => {
  it('writes a person with a birth record and names the ones it cannot write', () => {
    const { text, skipped } = peopleToAaf([ADA, NO_BIRTH]);
    expect(text.match(/^#A93:/gm)).toHaveLength(1);
    expect(skipped.map((person) => person.id)).toEqual(['p-empty']);
  });

  it('ends with a #: chunk, as the specification recommends for a mailed file', () => {
    expect(peopleToAaf([ADA]).text.endsWith('#:\n')).toBe(true);
  });

  it('names its file with the .aaf extension and the date', () => {
    expect(peopleAafFilename(new Date('2026-10-17T12:00:00Z'))).toBe('astraya-people-2026-10-17.aaf');
  });

  it('tells an AAF file from a JSON export', () => {
    expect(isAafText(peopleToAaf([ADA]).text)).toBe(true);
    expect(isAafText('{"format":"astraya-export","people":[]}')).toBe(false);
  });
});

describe('a file Astraya wrote, read back', () => {
  const { people, errors } = aafToExportedPeople(peopleToAaf([ADA]).text);

  it('reads it with no errors and keeps the person’s id', () => {
    expect(errors).toEqual([]);
    expect(people.map((person) => person.id)).toEqual(['p-ada']);
  });

  it('stages as unchanged against the same person: nothing is lost in the round trip', () => {
    const preview = stageFullExportRestore(archiveOf(people), new Map([[ADA.id, ADA]]));
    expect(preview.unchangedCount).toBe(1);
    expect(preview.items[0]?.mutations).toEqual([]);
  });

  it('keeps what AAF has no field for: time accuracy, notes and saved relocation places', () => {
    expect(people[0]?.timeAccuracy).toBe('remembered');
    expect(people[0]?.notes).toBe('From family letters, with a comma');
    expect(people[0]?.relocationPlaces).toEqual(ADA.relocationPlaces);
  });
});

describe('coordinates that are not on a whole arc-second', () => {
  const fine = buildPerson(
    'p-fine',
    new Map<string, unknown>([
      ['displayName', 'Fine'],
      ['civil', { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 }],
      ['coordinates', { latitude: 38.7478, longitude: -85.0672 }],
      ['timeAccuracy', 'recorded'],
    ]),
  );

  it('come back exactly from a file Astraya wrote, so re-importing it changes nothing', () => {
    const { people } = aafToExportedPeople(peopleToAaf([fine]).text);
    expect(people[0]?.birth?.coordinates).toEqual({ latitude: 38.7478, longitude: -85.0672 });
    expect(stageFullExportRestore(archiveOf(people), new Map([[fine.id, fine]])).unchangedCount).toBe(1);
  });

  it('take the AAF fields instead when another program has moved them', () => {
    const edited = peopleToAaf([fine]).text.replace(/#B93:\*,38n44:52,85w04:02/, '#B93:*,40n00,85w04:02');
    const [back] = aafToExportedPeople(edited).people;
    expect(back?.birth?.coordinates.latitude).toBe(40);
  });
});

describe('a file from another program', () => {
  const OTHER =
    '#A93:Ferber,Tobias,m,27.9.1970,11:04,Kandel/Pfalz,D\n#B93:*,49n05,8e11,1he,0\n#COM:Imported from elsewhere\n';
  const { people } = aafToExportedPeople(OTHER);

  it('joins first and last name, and reads the place and #COM note', () => {
    expect(people[0]?.displayName).toBe('Tobias Ferber');
    expect(people[0]?.placeLabel).toBe('Kandel/Pfalz');
    expect(people[0]?.notes).toBe('Imported from elsewhere');
  });

  it('stages as a new person with a positional id, since the file carries none', () => {
    const preview = stageFullExportRestore(archiveOf(people), new Map());
    expect(preview.newCount).toBe(1);
    expect(people[0]?.id).toBe('aaf-1');
  });

  it('gives "recorded" time accuracy when the file says nothing about it', () => {
    expect(people[0]?.timeAccuracy).toBe('recorded');
  });
});

describe('the extension chunk is documented', () => {
  it('lists, in docs/domain/AAF_INTERCHANGE.md, every key Astraya writes there', () => {
    const doc = readFileSync(resolve(import.meta.dirname, '../docs/domain/AAF_INTERCHANGE.md'), 'utf8');
    const full = buildPerson(
      'p-full',
      new Map<string, unknown>([
        ['displayName', 'Full'],
        ['civil', { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 }],
        ['coordinates', { latitude: 38.7478, longitude: -85.0672 }],
        ['calendar', 'auto'],
        ['zoneOverride', 'America/Chicago'],
        ['timeAccuracy', 'remembered'],
        ['notes', 'n'],
        ['relocationPlaces', [{ id: 'r1', label: 'Paris', latitude: 48.8566, longitude: 2.3522 }]],
        ['customPoints', [{ id: 'c1', name: 'Fortune-like', formula: 'ascendant + moon - sun' }]],
      ]),
    );
    const line =
      peopleToAaf([full])
        .text.split('\n')
        .find((text) => text.startsWith('#:astraya ')) ?? '';
    const keys = line
      .slice('#:astraya '.length)
      .split(',')
      .map((pair) => pair.split('=')[0] ?? '');
    const described: Readonly<Record<string, RegExp>> = {
      id: /person's id/,
      timeAccuracy: /time accuracy/,
      notes: /notes/,
      zoneOverride: /time-zone override/,
      calendar: /`auto`\s+calendar/,
      relocationPlaces: /relocation places/,
      customPoints: /formula points/,
      latitude: /coordinates at full precision/,
      longitude: /coordinates at full precision/,
    };
    expect(keys.sort()).toEqual(Object.keys(described).sort());
    for (const [key, pattern] of Object.entries(described)) expect(doc, key).toMatch(pattern);
  });
});
