/**
 * Event search results as an iCalendar (.ics) file (#639), so stations, ingresses, lunations and exact
 * aspects can be added to a calendar app.
 *
 * Person-independent sky events only: the results of `event-search.ts`, which involve no birth data. An
 * .ics file has no access control once shared, so natal-dependent events are deliberately not offered here.
 *
 * Written to RFC 5545 (https://www.rfc-editor.org/rfc/rfc5545):
 * - content lines end in CRLF, and a line longer than 75 octets is folded by inserting CRLF and one space
 *   (section 3.1). Folding is done by bytes but only between characters, never inside a UTF-8 sequence;
 * - a VCALENDAR needs VERSION and PRODID; each VEVENT needs UID and DTSTAMP, and DTSTART (section 3.6.1);
 * - times are written in UTC form, with the Z suffix (section 3.3.5, form 2);
 * - TEXT escapes backslash, semicolon, comma and newline (section 3.3.11);
 * - no DTEND is a valid zero-length event.
 */
/**
 * @module domain/event-search-ics
 * @purpose Formats event-search results as an RFC 5545 iCalendar file (#639).
 * @conventions Pure. UIDs are a hash of the event's identity plus `@astraya`, so importing the same event twice does not duplicate it; DTSTAMP is passed in, never read from the clock, so output is reproducible. Folding counts UTF-8 octets, not characters.
 * @exports eventSearchToIcs, foldIcsLine, escapeIcsText
 */
import { civilFromJulianDay } from '../time/julian.js';
import type { JulianDayUT } from '../ephemeris/types.js';
import type { EventSearchResult } from './event-search.js';

const MAX_OCTETS = 75;
const CRLF = '\r\n';
const PRODID = '-//Astraya//Event search//EN';

/** Escapes TEXT per RFC 5545 section 3.3.11: backslash, semicolon, comma and newline. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

/**
 * Folds one content line at 75 octets (RFC 5545 section 3.1): each continuation starts with a single space,
 * which counts toward its 75. A character is never split across lines, so a multi-byte UTF-8 sequence stays whole.
 */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= MAX_OCTETS) return line;
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    // The first line may use all 75 octets; a continuation spends one on its leading space.
    const limit = parts.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += character;
    octets += size;
  }
  parts.push(current);
  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join(CRLF);
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** A UTC date-time in iCalendar form 2: `19980119T070000Z`. */
function utcStamp(jd: JulianDayUT): string {
  const civil = civilFromJulianDay(jd);
  return `${pad(civil.year, 4)}${pad(civil.month)}${pad(civil.day)}T${pad(civil.hour)}${pad(civil.minute)}${pad(civil.second)}Z`;
}

/** A short stable hash (FNV-1a, 32 bit) rendered in hex. Not security: it only has to be the same for the same event. */
function stableHash(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function uidFor(result: EventSearchResult): string {
  // The instant to the second, the kind and the bodies and aspect: the same event always gets the same UID.
  const identity = [
    result.kind,
    result.bodyKey ?? '',
    result.relatedBodyKey ?? '',
    result.aspectKey ?? '',
    utcStamp(result.jd),
    result.label,
  ].join('|');
  return `${stableHash(identity)}${stableHash(identity.split('').reverse().join(''))}@astraya`;
}

/**
 * The results as an iCalendar file. `now` becomes every event's DTSTAMP (when the file was made), and is a
 * parameter so the same input always gives the same file.
 */
export function eventSearchToIcs(results: readonly EventSearchResult[], now: Date): string {
  const stamp = utcStamp(now.getTime() / 86_400_000 + 2440587.5);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${PRODID}`, 'CALSCALE:GREGORIAN'];
  for (const result of results) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uidFor(result)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(result.jd)}`,
      `SUMMARY:${escapeIcsText(result.label)}`,
      `CATEGORIES:${escapeIcsText(result.kind)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join(CRLF)}${CRLF}`;
}
