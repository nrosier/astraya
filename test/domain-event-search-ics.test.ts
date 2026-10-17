/**
 * Event search as an iCalendar file (#639), checked against the requirements of RFC 5545 that are easy to get
 * wrong: CRLF line ends, folding at 75 octets without splitting a UTF-8 character, TEXT escaping, UTC times,
 * and a UID that is the same for the same event. Pure, no ephemeris.
 */
import { describe, expect, it } from 'vitest';
import type { EventSearchResult } from '../src/domain/event-search.js';
import {
  escapeIcsText,
  eventSearchIcsFilename,
  eventSearchToIcs,
  foldIcsLine,
} from '../src/domain/event-search-ics.js';

// 2024-03-25 07:00:00 UTC is JD 2460394.791666667 (the full Moon of March 2024, rounded).
const FULL_MOON: EventSearchResult = { kind: 'lunation', jd: 2460394.7916666665, label: 'Full Moon' };
const STATION: EventSearchResult = {
  kind: 'station',
  jd: 2460400.5,
  bodyKey: 'mercury',
  label: 'Mercury stations retrograde',
};
const NOW = new Date('2026-10-17T12:30:45Z');

const octets = (text: string): number => new TextEncoder().encode(text).length;

describe('the file as a whole', () => {
  const text = eventSearchToIcs([FULL_MOON, STATION], NOW);
  const lines = text.split('\r\n');

  it('uses CRLF throughout and ends with one, with no bare line feeds', () => {
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('is a VCALENDAR with VERSION and PRODID, and one VEVENT per result', () => {
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines.some((line) => line.startsWith('PRODID:'))).toBe(true);
    expect(lines.filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(lines.filter((line) => line === 'END:VEVENT')).toHaveLength(2);
    expect(lines[lines.length - 2]).toBe('END:VCALENDAR');
  });

  it('gives every event a UID, a DTSTAMP and a DTSTART, each exactly once', () => {
    for (const name of ['UID', 'DTSTAMP', 'DTSTART']) {
      expect(
        lines.filter((line) => line.startsWith(`${name}:`)),
        name,
      ).toHaveLength(2);
    }
  });

  it('writes times in UTC form with a Z suffix, DTSTART from the event and DTSTAMP from the clock passed in', () => {
    expect(lines).toContain('DTSTART:20240325T070000Z');
    expect(lines).toContain('DTSTAMP:20261017T123045Z');
    expect(lines.filter((line) => line.startsWith('DTSTART')).every((line) => line.endsWith('Z'))).toBe(true);
  });

  it('has no DTEND, which makes a valid zero-length event', () => {
    expect(text).not.toContain('DTEND');
  });

  it('is identical for the same input, since DTSTAMP is passed in and not read from the clock', () => {
    expect(eventSearchToIcs([FULL_MOON, STATION], NOW)).toBe(text);
  });

  it('is an empty but valid calendar for no results', () => {
    expect(eventSearchToIcs([], NOW)).toBe(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Astraya//Event search//EN',
        'CALSCALE:GREGORIAN',
        'END:VCALENDAR',
        '',
      ].join('\r\n'),
    );
  });
});

describe('UIDs', () => {
  const uidOf = (result: EventSearchResult, now = NOW): string =>
    eventSearchToIcs([result], now)
      .split('\r\n')
      .find((line) => line.startsWith('UID:')) ?? '';

  it('are the same for the same event on different days, so re-importing does not duplicate it', () => {
    expect(uidOf(FULL_MOON, new Date('2026-01-01T00:00:00Z'))).toBe(uidOf(FULL_MOON, new Date('2027-06-30T23:59:59Z')));
  });

  it('differ between events, and end in @astraya', () => {
    expect(uidOf(FULL_MOON)).not.toBe(uidOf(STATION));
    expect(uidOf(FULL_MOON)).toMatch(/^UID:[0-9a-f]{16}@astraya$/);
  });

  it('differ when only the instant differs, even by a second', () => {
    expect(uidOf(FULL_MOON)).not.toBe(uidOf({ ...FULL_MOON, jd: FULL_MOON.jd + 1 / 86400 }));
  });
});

describe('TEXT escaping (RFC 5545 section 3.3.11)', () => {
  it('escapes backslash, semicolon, comma and newline, and leaves a colon alone', () => {
    expect(escapeIcsText('a\\b;c,d\ne:f')).toBe(['a', '\\\\', 'b', '\\;', 'c', '\\,', 'd', '\\n', 'e:f'].join(''));
    expect(escapeIcsText('line1\r\nline2')).toBe('line1\\nline2');
  });

  it('escapes the backslash first, so the escapes it adds are not doubled', () => {
    expect(escapeIcsText('a,b')).toBe('a\\,b');
    expect(escapeIcsText('a\\,b')).toBe('a\\\\\\,b');
  });

  it('is applied to the SUMMARY of an event', () => {
    const text = eventSearchToIcs([{ ...STATION, label: 'Mercury; stations, retrograde' }], NOW);
    expect(text).toContain('SUMMARY:Mercury\\; stations\\, retrograde');
  });
});

describe('folding (RFC 5545 section 3.1)', () => {
  it('leaves a line of 75 octets alone', () => {
    const line = `SUMMARY:${'x'.repeat(67)}`;
    expect(octets(line)).toBe(75);
    expect(foldIcsLine(line)).toBe(line);
  });

  it('folds a 76-octet line into 75 plus a continuation that starts with one space', () => {
    const line = `SUMMARY:${'x'.repeat(68)}`;
    const folded = foldIcsLine(line);
    const parts = folded.split('\r\n');
    expect(parts).toHaveLength(2);
    expect(octets(parts[0] ?? '')).toBe(75);
    expect(parts[1]).toBe(' x');
  });

  it('keeps every line, continuation included, within 75 octets, and unfolds back to the original', () => {
    const line = `DESCRIPTION:${'The quick brown fox jumps over the lazy dog. '.repeat(12)}`;
    const folded = foldIcsLine(line);
    for (const part of folded.split('\r\n')) expect(octets(part)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });

  it('never splits a multi-byte UTF-8 character across lines', () => {
    // Each of these is 3 octets; the line is long enough to fold several times, at every possible phase.
    for (let prefix = 0; prefix < 6; prefix += 1) {
      const line = `SUMMARY:${'a'.repeat(prefix)}${'☿'.repeat(60)}`;
      const folded = foldIcsLine(line);
      for (const part of folded.split('\r\n')) {
        expect(octets(part)).toBeLessThanOrEqual(75);
        // A split character would leave a lone surrogate or a replacement character when decoded.
        expect(part).not.toContain('�');
      }
      expect(folded.replace(/\r\n /g, '')).toBe(line);
    }
  });

  it('counts a 4-octet character (an astral-plane symbol) as four, and keeps it whole', () => {
    const line = `SUMMARY:${'𝓐'.repeat(40)}`;
    const folded = foldIcsLine(line);
    for (const part of folded.split('\r\n')) expect(octets(part)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });

  it('is applied to every line of the file', () => {
    const long = 'x'.repeat(200);
    const text = eventSearchToIcs([{ ...STATION, label: long }], NOW);
    for (const line of text.split('\r\n')) expect(octets(line)).toBeLessThanOrEqual(75);
  });
});

it('names its file with the date and an .ics extension', () => {
  expect(eventSearchIcsFilename(new Date('2026-10-17T23:59:59Z'))).toBe('astraya-event-search-2026-10-17.ics');
});
