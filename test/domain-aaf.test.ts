/**
 * AAF'97 birth-record interchange (#591): the reader and writer checked against the specification's own sample
 * records (http://www.astrowissen.de/aaf/eng/lib/aafspecs.htm, sections 2 and 4), field by field, then round trips.
 * Compatibility is claimed only for what these fixtures cover.
 */
import { describe, expect, it } from 'vitest';
import { encodeAafRecord, parseAaf, type AafRecord } from '../src/domain/aaf.js';

// The specification's example record (section 2), verbatim.
const SPEC_EXAMPLE = '#A93:Ferber,Tobias,m,27.9.1970,11:04,Kandel/Pfalz,D\n#B93:*,49n05,8e11,1he,0\n#ZNAM:CET\n';

// The specification's #SUB example (section 4): the top-level record, with its sub-records left in the file.
const SPEC_SUB_EXAMPLE = [
  '#A93:Niehenke,Peter,m,9.5.1949,22h30,Hamm,D',
  '#B93:2433046.354167,51n41,7e49,1he,1',
  '#SRC:Birth certificate (registered time)',
  '#SUB1_ALT:^,^,^,^,22:22,^,^',
  '#B93:2433046.348611,51n41,7e49,1he,1',
  '#SRC:Birth time corrected by Niehenke',
  '',
].join('\n');

describe('reading the specification’s own example record', () => {
  const { records, errors } = parseAaf(SPEC_EXAMPLE);

  it('reads one record with no errors', () => {
    expect(errors).toEqual([]);
    expect(records).toHaveLength(1);
  });

  it('reads the #A93 fields: name, first name, date in day.month.year order, civil time and place', () => {
    const [record] = records;
    expect(record?.name).toBe('Ferber');
    expect(record?.firstName).toBe('Tobias');
    expect(record?.birth.civil).toEqual({ year: 1970, month: 9, day: 27, hour: 11, minute: 4, second: 0 });
    expect(record?.place).toBe('Kandel/Pfalz');
  });

  it('reads the #B93 coordinates and the offset east of Greenwich', () => {
    const [record] = records;
    expect(record?.birth.coordinates.latitude).toBeCloseTo(49 + 5 / 60, 10);
    expect(record?.birth.coordinates.longitude).toBeCloseTo(8 + 11 / 60, 10);
    expect(record?.birth.offsetOverrideMinutes).toBe(60);
  });

  it('leaves the calendar unset when the date has no g or j suffix, so the reform date decides it', () => {
    expect(records[0]?.birth.calendar).toBeUndefined();
  });
});

describe('the field forms section 2 defines', () => {
  const one = (a93: string, b93 = '*,48n46,9e10,1he,0'): AafRecord | undefined =>
    parseAaf(`#A93:${a93}\n#B93:${b93}\n`).records[0];

  it('reads h as the hour separator, and optional seconds', () => {
    expect(one('X,Y,m,1.1.2000,22h30:12,P,D')?.birth.civil).toMatchObject({ hour: 22, minute: 30, second: 12 });
    expect(one('X,Y,m,1.1.2000,23:59:59,P,D')?.birth.civil).toMatchObject({ hour: 23, minute: 59, second: 59 });
  });

  it('reads the g and j calendar suffixes, and a year before the common era', () => {
    expect(one('X,Y,e,24.12.-6g,12:00,P,*')?.birth).toMatchObject({ civil: { year: -6 }, calendar: 'gregorian' });
    expect(one('X,Y,e,7.10.1582j,12:00,P,*')?.birth.calendar).toBe('julian');
  });

  it('reads southern latitudes, western longitudes, seconds of arc, and an offset west of Greenwich', () => {
    const record = one('X,Y,m,1.1.2000,12:00,P,*', '*,15s53:03,74w54:45,5hw00,0');
    expect(record?.birth.coordinates.latitude).toBeCloseTo(-(15 + 53 / 60 + 3 / 3600), 10);
    expect(record?.birth.coordinates.longitude).toBeCloseTo(-(74 + 54 / 60 + 45 / 3600), 10);
    expect(record?.birth.offsetOverrideMinutes).toBe(-300);
  });

  it('reads an offset with minutes, and * as no stated offset', () => {
    expect(one('X,Y,m,1.1.1900,12:00,P,*', '*,52n22,4e54,0he32,0')?.birth.offsetOverrideMinutes).toBe(32);
    expect(one('X,Y,m,1.1.1900,12:00,P,*', '*,52n22,4e54,*,L')?.birth.offsetOverrideMinutes).toBeUndefined();
  });

  it('reads * in the first name and place as empty', () => {
    const record = one('Founding,*,e,1.1.2000,12:00,*,*');
    expect(record?.firstName).toBe('');
    expect(record?.place).toBe('');
  });

  it('ignores leading and trailing white space in fields', () => {
    expect(one(' Ferber , Tobias , m , 27.9.1970 , 11:04 , Kandel , D ')?.name).toBe('Ferber');
  });
});

describe('the time type: the offset field is standard time, the time type adds daylight saving (section 2.2)', () => {
  const offsetOf = (b93: string): number | undefined =>
    parseAaf(`#A93:X,Y,m,9.5.1949,22h30,P,D\n#B93:${b93}\n`).records[0]?.birth.offsetOverrideMinutes;

  it('adds the daylight hour for time type 1, which the specification’s own Julian day confirms', () => {
    // Niehenke's record (section 4): 22h30 civil time, 1he, time type 1, Julian day 2433046.354167.
    // That Julian day is 20:30 UT, so the full offset is 2 hours: 1 standard plus 1 daylight.
    expect(offsetOf('2433046.354167,51n41,7e49,1he,1')).toBe(120);
  });

  it('adds nothing for standard time or a capital’s local time, and 60, 120 or 30 minutes for w, 2 and h', () => {
    expect(offsetOf('*,51n41,7e49,1he,0')).toBe(60);
    expect(offsetOf('*,51n41,7e49,0he09,m')).toBe(9);
    expect(offsetOf('*,51n41,7e49,1he,w')).toBe(120);
    expect(offsetOf('*,51n41,7e49,1he,2')).toBe(180);
    expect(offsetOf('*,51n41,7e49,5he30,h')).toBe(360);
  });

  it('states no offset for local mean time, so Astraya derives it from the longitude', () => {
    expect(offsetOf('*,51n41,7e49,*,L')).toBeUndefined();
  });

  it('refuses a time type the specification does not define, and an unreadable offset', () => {
    expect(parseAaf('#A93:X,Y,m,9.5.1949,22h30,P,D\n#B93:*,51n41,7e49,1he,9\n').errors[0]?.message).toMatch(
      /time type/,
    );
    expect(parseAaf('#A93:X,Y,m,9.5.1949,22h30,P,D\n#B93:*,51n41,7e49,1xe,0\n').errors[0]?.message).toMatch(/offset/);
  });
});

describe('records it refuses, rather than guessing', () => {
  const errorOf = (text: string): string | undefined => parseAaf(text).errors[0]?.message;

  it('a #A93 without exactly seven fields', () => {
    expect(errorOf('#A93:Ferber,Tobias,m,27.9.1970,11:04\n#B93:*,49n05,8e11,1he,0\n')).toMatch(/7/);
  });

  it('a date or time that is not in the specified form', () => {
    expect(errorOf('#A93:X,Y,m,1970-09-27,11:04,P,D\n#B93:*,49n05,8e11,1he,0\n')).toMatch(/date/);
    expect(errorOf('#A93:X,Y,m,27.9.1970,25:00,P,D\n#B93:*,49n05,8e11,1he,0\n')).toMatch(/time/);
  });

  it('an unknown sex or type code', () => {
    expect(errorOf('#A93:X,Y,q,27.9.1970,11:04,P,D\n#B93:*,49n05,8e11,1he,0\n')).toMatch(/sex/);
  });

  it('a record with no usable coordinates, since it cannot be cast', () => {
    expect(errorOf('#A93:X,Y,m,27.9.1970,11:04,P,D\n')).toMatch(/coordinates/);
    expect(errorOf('#A93:X,Y,m,27.9.1970,11:04,P,D\n#B93:*,49x05,8e11,1he,0\n')).toMatch(/latitude/);
  });

  it('reports the line of the bad record and still reads the good ones around it', () => {
    const text = `${SPEC_EXAMPLE}#A93:Bad,Y,m,nope,11:04,P,D\n#B93:*,49n05,8e11,1he,0\n${SPEC_EXAMPLE}`;
    const { records, errors } = parseAaf(text);
    expect(records).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(4);
    expect(errors[0]?.message).toMatch(/date/);
  });
});

describe('the rest of a record', () => {
  it('reads #SRC and ignores everything before the first #A93', () => {
    const { records } = parseAaf(`a mail header\nmore text\n${SPEC_SUB_EXAMPLE}`);
    expect(records).toHaveLength(1);
    expect(records[0]?.source).toBe('Birth certificate (registered time)');
  });

  it('reads the parent record of a #SUB example, and does not treat the #SUB chunk as a new person', () => {
    const { records, errors } = parseAaf(SPEC_SUB_EXAMPLE);
    expect(errors).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]?.birth.civil).toMatchObject({ hour: 22, minute: 30 });
  });
});

describe('writing and reading back', () => {
  const record: AafRecord = {
    name: 'Lovelace',
    firstName: 'Ada',
    birth: {
      civil: { year: 1815, month: 12, day: 10, hour: 7, minute: 45, second: 0 },
      coordinates: { latitude: 51.5072, longitude: -0.1276 },
      offsetOverrideMinutes: 0,
      calendar: 'gregorian',
    },
    place: 'London',
    source: 'Family letters',
    comment: 'Notes, with a comma',
    extension: { timeAccuracy: 'remembered', notes: 'Line one\nline two, with a comma' },
  };

  it('writes the #A93 and #B93 fields in the forms section 2 defines', () => {
    const text = encodeAafRecord(record);
    expect(text).toMatch(/^#A93:Lovelace,Ada,\*,10\.12\.1815g,07:45,London,\*$/m);
    expect(text).toMatch(/^#B93:\*,51n30:26,0w07:39,0he,0$/m);
  });

  it('reads back the same record, with coordinates to the arc-second', () => {
    const [back] = parseAaf(encodeAafRecord(record)).records;
    expect(back?.name).toBe('Lovelace');
    expect(back?.firstName).toBe('Ada');
    expect(back?.birth.civil).toEqual(record.birth.civil);
    expect(back?.birth.calendar).toBe('gregorian');
    expect(back?.birth.offsetOverrideMinutes).toBe(0);
    expect(back?.place).toBe('London');
    // Whole arc-seconds: at most half a second of arc lost, about 15 metres.
    expect(Math.abs((back?.birth.coordinates.latitude ?? 0) - 51.5072)).toBeLessThan(0.5 / 3600);
    expect(Math.abs((back?.birth.coordinates.longitude ?? 0) - -0.1276)).toBeLessThan(0.5 / 3600);
  });

  it('carries what AAF has no field for in a #: chunk, which an AAF reader ignores, and restores it exactly', () => {
    const text = encodeAafRecord(record);
    expect(text).toMatch(/^#:astraya /m);
    const [back] = parseAaf(text).records;
    expect(back?.extension).toEqual(record.extension);
  });

  it('never writes a comma inside a field, as the specification forbids', () => {
    const text = encodeAafRecord({ ...record, name: 'Smith, Jr', place: 'Paris, France' });
    const a93 = text.split('\n')[0] ?? '';
    expect(a93.split(',')).toHaveLength(7);
  });

  it('writes * for a stated offset that is absent, and reads it back as absent', () => {
    const birth = { civil: record.birth.civil, coordinates: record.birth.coordinates, calendar: 'gregorian' as const };
    const text = encodeAafRecord({ ...record, birth });
    expect(text).toMatch(/^#B93:\*,51n30:26,0w07:39,\*,0$/m);
    expect(parseAaf(text).records[0]?.birth.offsetOverrideMinutes).toBeUndefined();
  });

  it('round-trips the specification’s own example to the same coordinates and time', () => {
    const [first] = parseAaf(SPEC_EXAMPLE).records;
    if (first === undefined) throw new Error('fixture did not parse');
    const [second] = parseAaf(encodeAafRecord(first)).records;
    expect(second?.birth.civil).toEqual(first.birth.civil);
    expect(second?.birth.coordinates.latitude).toBeCloseTo(first.birth.coordinates.latitude, 6);
    expect(second?.birth.coordinates.longitude).toBeCloseTo(first.birth.coordinates.longitude, 6);
    expect(second?.birth.offsetOverrideMinutes).toBe(first.birth.offsetOverrideMinutes);
  });
});
