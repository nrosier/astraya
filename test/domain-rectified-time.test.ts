/**
 * The rectified-time register (#1445): optional, stored with a source note, written only through the person
 * operation log, and never touching the reported time.
 */
import { describe, expect, it } from 'vitest';
import { buildPerson, BIRTH_SOURCE_NOTE_MAX_CHARACTERS, PERSON_FIELDS } from '../src/domain/person.js';
import {
  promotionBlock,
  RECTIFICATION_CITATION_RECORDED,
  RECTIFIED_TIME_NOTE_MAX_CHARACTERS,
  readRectifiedTime,
  rectifiedTimeMutation,
  rectifiedTimeNote,
} from '../src/domain/rectified-time.js';

const CIVIL = { year: 1985, month: 3, day: 12, hour: 8, minute: 20, second: 0 };

describe('rectified time register', () => {
  it('reads a valid time with its note', () => {
    expect(readRectifiedTime({ time: '08:25', note: ' Rectified via Solar Arc ' })).toEqual({
      time: '08:25',
      note: 'Rectified via Solar Arc',
    });
  });

  it('is unreadable for a bad time, a missing or blank note, an over-long note or a non-object', () => {
    expect(readRectifiedTime({ time: '8:25', note: 'x' })).toBeUndefined();
    expect(readRectifiedTime({ time: '24:00', note: 'x' })).toBeUndefined();
    expect(readRectifiedTime({ time: '08:25' })).toBeUndefined();
    expect(readRectifiedTime({ time: '08:25', note: '   ' })).toBeUndefined();
    expect(
      readRectifiedTime({ time: '08:25', note: 'x'.repeat(RECTIFIED_TIME_NOTE_MAX_CHARACTERS + 1) }),
    ).toBeUndefined();
    expect(readRectifiedTime('08:25')).toBeUndefined();
    expect(readRectifiedTime(null)).toBeUndefined();
  });

  it('keeps its note cap equal to the birth source note cap', () => {
    expect(RECTIFIED_TIME_NOTE_MAX_CHARACTERS).toBe(BIRTH_SOURCE_NOTE_MAX_CHARACTERS);
  });

  it('writes one person-register mutation and throws on what would not read back', () => {
    expect(rectifiedTimeMutation('p1', { time: '08:25', note: 'n' })).toEqual({
      entity: 'person',
      entityId: 'p1',
      field: 'rectifiedTime',
      value: { time: '08:25', note: 'n' },
    });
    expect(() => rectifiedTimeMutation('p1', { time: 'nope', note: 'n' })).toThrow(/Rectified time is not valid/);
  });

  it('builds the note with the lift, as an estimate with the citation pending', () => {
    const note = rectifiedTimeNote('1.8');
    expect(note).toContain('lift 1.8');
    expect(note).toContain('estimate');
    expect(note).toContain('citation pending');
    expect(Array.from(note).length).toBeLessThanOrEqual(RECTIFIED_TIME_NOTE_MAX_CHARACTERS);
  });

  it('is a person field; the person keeps the reported time and gains the rectified one', () => {
    expect(PERSON_FIELDS).toContain('rectifiedTime');
    const coordinates = { latitude: 51.5, longitude: -0.1 };
    const person = buildPerson(
      'p',
      new Map<string, unknown>([
        ['civil', CIVIL],
        ['coordinates', coordinates],
        ['rectifiedTime', { time: '08:25', note: 'n' }],
      ]),
    );
    expect(person.moment?.civil).toEqual(CIVIL);
    expect(person.rectifiedTime).toEqual({ time: '08:25', note: 'n' });
  });

  it('leaves the field absent when none was saved or the register is unreadable', () => {
    expect('rectifiedTime' in buildPerson('p', new Map())).toBe(false);
    expect('rectifiedTime' in buildPerson('p', new Map([['rectifiedTime', 'x']]))).toBe(false);
  });
});

describe('promotion gate (#1445)', () => {
  it('keeps promotion disabled while the methodology citation is pending', () => {
    expect(RECTIFICATION_CITATION_RECORDED).toBe(false);
    expect(promotionBlock({ citationRecorded: false, hasPerson: true, topLift: 3 })).toBe('citation');
  });

  it('once a citation is recorded, needs a person and a top lift above 1.0', () => {
    expect(promotionBlock({ citationRecorded: true, hasPerson: false, topLift: 3 })).toBe('noPerson');
    expect(promotionBlock({ citationRecorded: true, hasPerson: true, topLift: 1 })).toBe('noSpike');
    expect(promotionBlock({ citationRecorded: true, hasPerson: true, topLift: 0.5 })).toBe('noSpike');
    expect(promotionBlock({ citationRecorded: true, hasPerson: true, topLift: undefined })).toBe('noSpike');
    expect(promotionBlock({ citationRecorded: true, hasPerson: true, topLift: 1.01 })).toBeUndefined();
  });
});
