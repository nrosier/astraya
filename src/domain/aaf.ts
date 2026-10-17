/**
 * AAF (Astrological Automated Format) birth-record interchange (#591): reads and writes the chart-info chunks
 * (#A93, #B93) of AAF'97, for a person's birth record only. Charts are not stored: the format's own
 * specification says computed positions should be recalculated, so this carries the record and nothing derived.
 *
 * Implemented from the AAF'97 specification's field descriptions and examples
 * (http://www.astrowissen.de/aaf/eng/lib/aafspecs.htm, sections 2 and 4). Nothing is copied from the AAF library.
 *
 * What AAF cannot carry (the time-accuracy class, saved relocation places, formula points, and Astraya's own
 * notes) travels in a `#:` chunk, which the specification says readers ignore. A file written here is therefore
 * complete for Astraya, and an ordinary AAF reader still sees the standard chunks. Parsing refuses any record
 * whose fields it cannot read exactly, rather than importing a partial birth time silently.
 */
/**
 * @module Aaf
 * @purpose Encodes and decodes AAF'97 birth records (#A93 and #B93 chunks plus #SRC, #VIA, #COM, and an Astraya extension in a #: chunk) for interchange (#591).
 * @conventions Pure. Each record is one person; the field grammar follows the AAF specification: commas separate fields and cannot appear inside one, * means unknown, and the date/time/place forms are exactly those sections 2.1-2.2 define. Parse errors are returned, never thrown, and a field is never guessed.
 * @exports AafRecord, AafParseError, encodeAafRecord, parseAaf, AAF_EXTENSION_CHUNK
 */
import type { BirthMomentInput } from '../time/types.js';

/** The `#:` chunk that carries what AAF has no field for. Readers ignore it, per AAF'97 section 2.5. */
export const AAF_EXTENSION_CHUNK = 'astraya';

export interface AafRecord {
  /** Last name, or the title of an event or institution. */
  readonly name: string;
  /** First name; empty for an event or institution. */
  readonly firstName: string;
  /** The date and civil time, exactly as the chart is cast (see `timeAccuracy` for how exact it is). */
  readonly birth: BirthMomentInput;
  /** The place name as typed. */
  readonly place: string;
  /** Source of the data, e.g. "Birth certificate" (#SRC). */
  readonly source?: string;
  /** Who researched the data, or the publication (#VIA). */
  readonly via?: string;
  /** Additional notes (#COM). */
  readonly comment?: string;
  /** Astraya's own fields that AAF has no place for, carried in the extension chunk. */
  readonly extension?: Readonly<Record<string, string>>;
}

export interface AafParseError {
  readonly line: number;
  readonly message: string;
}

const FIELD_SEPARATOR = ',';
/** Astraya writes the full UTC offset, daylight saving included, so its own records always say standard time. */
const DEFAULT_TIME_TYPE = '0';

/**
 * Minutes a time type adds to the standard Greenwich offset (AAF'97 section 2.2): the offset field is "without (!)
 * daylight time", and the time type says which daylight rule was in force. `undefined` for local mean time (`L`),
 * where the offset comes from the longitude instead.
 */
const TIME_TYPE_EXTRA_MINUTES: Readonly<Record<string, number | undefined>> = {
  '0': 0, // standard time
  m: 0, // a capital's local time; the offset field already holds its difference from Greenwich
  '1': 60, // daylight saving time
  w: 60, // war time, "technically same as daylight saving"
  '2': 120, // double daylight saving
  h: 30, // half-hour daylight time
};

/** Field text must not contain a comma (AAF'97 section 2). */
function field(value: string | undefined): string {
  return value === undefined || value.trim() === '' ? '*' : value.replace(/,/g, ' ').trim();
}

/** Degrees, minutes and optional seconds in AAF's "dd" + letter + "mm" [":ss"] form. */
function angle(degrees: number, positive: string, negative: string, minutesOnly: boolean): string {
  const abs = Math.abs(degrees);
  const d = Math.floor(abs);
  const minutesTotal = Math.round((abs - d) * 60 * 60) / 60;
  let m = Math.floor(minutesTotal);
  let s = Math.round((minutesTotal - m) * 60);
  if (s === 60) {
    s = 0;
    m += 1;
  }
  const letter = degrees < 0 ? negative : positive;
  const mm = String(m).padStart(2, '0');
  const ss = s === 0 && minutesOnly ? '' : `:${String(s).padStart(2, '0')}`;
  return `${String(d)}${letter}${mm}${ss}`;
}

/** The date field in day.month.year order, with a `g` or `j` suffix when the calendar is stated. */
function dateField(civil: BirthMomentInput['civil'], calendar: BirthMomentInput['calendar']): string {
  const suffix = calendar === 'gregorian' ? 'g' : calendar === 'julian' ? 'j' : '';
  return `${String(civil.day)}.${String(civil.month)}.${String(civil.year)}${suffix}`;
}

/** The civil time as h:m:s (AAF'97 section 2.1). */
function timeField(civil: BirthMomentInput['civil']): string {
  const hh = String(civil.hour).padStart(2, '0');
  const mm = String(civil.minute).padStart(2, '0');
  return civil.second === 0 ? `${hh}:${mm}` : `${hh}:${mm}:${String(civil.second).padStart(2, '0')}`;
}

/**
 * The Greenwich offset as "hhhe"/"hhhw" with optional minutes (AAF'97 section 2.2). Astraya stores the offset
 * east of UTC in minutes; `undefined` (no stated offset) becomes "*".
 */
function offsetField(minutesEastOfUtc: number | undefined): string {
  if (minutesEastOfUtc === undefined) return '*';
  const sign = minutesEastOfUtc < 0 ? 'hw' : 'he';
  const abs = Math.abs(minutesEastOfUtc);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `${String(h)}${sign}` : `${String(h)}${sign}${String(m).padStart(2, '0')}`;
}

/** Encodes one person's birth record as AAF'97 text, with the extension in a `#:` chunk at the end. */
export function encodeAafRecord(record: AafRecord): string {
  const { birth } = record;
  const lines: string[] = [];
  const sex = '*';
  lines.push(
    `#A93:${[field(record.name), field(record.firstName), sex, dateField(birth.civil, birth.calendar), timeField(birth.civil), field(record.place), '*'].join(FIELD_SEPARATOR)}`,
  );
  const latitude = angle(birth.coordinates.latitude, 'n', 's', true);
  const longitude = angle(birth.coordinates.longitude, 'e', 'w', true);
  lines.push(`#B93:*,${latitude},${longitude},${offsetField(birth.offsetOverrideMinutes)},${DEFAULT_TIME_TYPE}`);
  if (record.source !== undefined) lines.push(`#SRC:${record.source.replace(/\n/g, ' ')}`);
  if (record.via !== undefined) lines.push(`#VIA:${record.via.replace(/\n/g, ' ')}`);
  if (record.comment !== undefined) lines.push(`#COM:${record.comment.replace(/\n/g, ' ')}`);
  const extension = record.extension ?? {};
  const keys = Object.keys(extension).sort();
  if (keys.length > 0) {
    const body = keys.map((key) => `${key}=${encodeURIComponent(extension[key] ?? '')}`).join(FIELD_SEPARATOR);
    lines.push(`#:${AAF_EXTENSION_CHUNK} ${body}`);
  }
  return `${lines.join('\n')}\n`;
}

/** Splits an AAF file into its chunks: a leading "#ID:" starts one, and everything up to the next one is its data. */
function chunksOf(text: string): { readonly id: string; readonly data: string; readonly line: number }[] {
  const chunks: { id: string; data: string; line: number }[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const match = /^#([A-Za-z0-9_]*):(.*)$/.exec(raw);
    if (match !== null) {
      chunks.push({ id: match[1] ?? '', data: match[2] ?? '', line: index + 1 });
    } else if (chunks.length > 0 && raw.trim() !== '') {
      // A continuation line, as in the spec's own multi-line #LPOS examples: it belongs to the chunk above.
      const last = chunks[chunks.length - 1];
      if (last !== undefined) last.data += raw.trim();
    }
  });
  return chunks;
}

/** Parses "dd" + letter + "mm" [":ss"], e.g. 49n05 or 15s53:03, into signed decimal degrees. */
function parseAngle(text: string, positive: string, negative: string): number | undefined {
  const match = new RegExp(`^(\\d{1,3})([${positive}${negative}])(\\d{1,2})(?::(\\d{1,2}))?$`, 'i').exec(text.trim());
  if (match === null) return undefined;
  const degrees = Number(match[1]);
  const minutes = Number(match[3]);
  const seconds = match[4] === undefined ? 0 : Number(match[4]);
  if (minutes >= 60 || seconds >= 60) return undefined;
  const value = degrees + minutes / 60 + seconds / 3600;
  return match[2]?.toLowerCase() === negative ? -value : value;
}

/** Parses the Greenwich offset "hhhe"/"hhhw", with optional minutes, into minutes east of UTC. */
function parseOffset(text: string): number | undefined {
  if (text.trim() === '*') return undefined;
  const match = /^(\d{1,2})h([ew])(\d{2})?$/i.exec(text.trim());
  if (match === null) return undefined;
  const minutes = Number(match[1]) * 60 + Number(match[3] ?? 0);
  return match[2]?.toLowerCase() === 'w' ? -minutes : minutes;
}

/** Parses "day.month.year" with an optional g or j, into a civil date and calendar. */
function parseDate(
  text: string,
): { civil: { year: number; month: number; day: number }; calendar: BirthMomentInput['calendar'] } | undefined {
  const match = /^(\d{1,2})\.(\d{1,2})\.(-?\d+)([gj])?$/i.exec(text.trim());
  if (match === null) return undefined;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const calendar =
    match[4]?.toLowerCase() === 'g' ? 'gregorian' : match[4]?.toLowerCase() === 'j' ? 'julian' : undefined;
  return { civil: { year, month, day }, calendar };
}

/** Parses "hh:mm", "hh:mm:ss" or "hhhmm", with h as the separator, into a clock time. */
function parseTime(text: string): { hour: number; minute: number; second: number } | undefined {
  const match = /^(\d{1,2})(?::|h)(\d{1,2})(?:(?::)(\d{1,2}))?$/i.exec(text.trim());
  if (match === null) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  if (hour > 23 || minute > 59 || second > 59) return undefined;
  return { hour, minute, second };
}

/**
 * Reads one or more AAF records from text. A record is an #A93 chunk and the chunks after it, up to the next #A93.
 * Records that cannot be read exactly are reported with their line, and skipped; nothing is guessed.
 */
export function parseAaf(text: string): {
  readonly records: readonly AafRecord[];
  readonly errors: readonly AafParseError[];
} {
  const records: AafRecord[] = [];
  const errors: AafParseError[] = [];
  const chunks = chunksOf(text);
  let index = 0;
  while (index < chunks.length) {
    const head = chunks[index];
    index += 1;
    if (head?.id !== 'A93') continue;
    const group: { id: string; data: string; line: number }[] = [];
    while (index < chunks.length && chunks[index]?.id !== 'A93') {
      const next = chunks[index];
      if (next !== undefined) group.push(next);
      index += 1;
    }
    const parsed = parseRecord(head, group);
    if ('error' in parsed) errors.push(parsed.error);
    else records.push(parsed.record);
  }
  return { records, errors };
}

function parseRecord(
  head: { data: string; line: number },
  group: readonly { id: string; data: string; line: number }[],
): { record: AafRecord } | { error: AafParseError } {
  const fail = (line: number, message: string): { error: AafParseError } => ({ error: { line, message } });
  const a93 = head.data.split(FIELD_SEPARATOR).map((value) => value.trim());
  if (a93.length !== 7) return fail(head.line, `#A93 has ${String(a93.length)} fields, the specification requires 7`);
  const [name = '', firstName = '', sex = '', dateText = '', timeText = '', place = ''] = a93;
  if (sex !== '*' && !['m', 'f', 'w', 'e', 'l', 'o'].includes(sex.toLowerCase())) {
    return fail(head.line, `#A93 sex field "${sex}" is not one of m f w e l o`);
  }
  const date = parseDate(dateText);
  if (date === undefined) return fail(head.line, `#A93 date "${dateText}" is not day.month.year`);
  const time = parseTime(timeText);
  if (time === undefined) return fail(head.line, `#A93 civil time "${timeText}" is not a clock time`);

  const b93 = group.find((chunk) => chunk.id === 'B93');
  let coordinates: { latitude: number; longitude: number } | undefined;
  let offsetOverrideMinutes: number | undefined;
  if (b93 !== undefined) {
    const parts = b93.data.split(FIELD_SEPARATOR).map((value) => value.trim());
    const [, latitudeText = '', longitudeText = '', offsetText = '*', timeType = '0'] = parts;
    const latitude = latitudeText === '*' ? undefined : parseAngle(latitudeText, 'n', 's');
    const longitude = longitudeText === '*' ? undefined : parseAngle(longitudeText, 'e', 'w');
    if (latitude !== undefined && longitude !== undefined) coordinates = { latitude, longitude };
    if (latitude === undefined && latitudeText !== '*')
      return fail(b93.line, `#B93 latitude "${latitudeText}" is not readable`);
    if (longitude === undefined && longitudeText !== '*')
      return fail(b93.line, `#B93 longitude "${longitudeText}" is not readable`);
    const standardOffset = parseOffset(offsetText);
    if (standardOffset === undefined && offsetText !== '*') {
      return fail(b93.line, `#B93 Greenwich offset "${offsetText}" is not readable`);
    }
    if (timeType === 'L') {
      // Local mean time: no offset is stated, and Astraya derives it from the longitude for a date that early.
      offsetOverrideMinutes = undefined;
    } else if (standardOffset !== undefined) {
      const extra = TIME_TYPE_EXTRA_MINUTES[timeType];
      if (extra === undefined)
        return fail(b93.line, `#B93 time type "${timeType}" is not one the specification defines`);
      offsetOverrideMinutes = standardOffset + extra;
    }
  }
  if (coordinates === undefined)
    return fail(head.line, 'the record has no usable #B93 coordinates, so it cannot be cast');

  const civil = { ...date.civil, ...time };
  const birth: BirthMomentInput = {
    civil,
    coordinates,
    ...(offsetOverrideMinutes === undefined ? {} : { offsetOverrideMinutes }),
    ...(date.calendar === undefined ? {} : { calendar: date.calendar }),
  };
  const pick = (id: string): string | undefined => group.find((chunk) => chunk.id === id)?.data.trim();
  const source = pick('SRC');
  const via = pick('VIA');
  const comment = pick('COM');
  const extensionText = group.find((chunk) => chunk.id === '' && chunk.data.startsWith(`${AAF_EXTENSION_CHUNK} `));
  const extension = extensionText === undefined ? undefined : parseExtension(extensionText.data);
  return {
    record: {
      name,
      firstName: firstName === '*' ? '' : firstName,
      birth,
      place: place === '*' ? '' : place,
      ...(source === undefined ? {} : { source }),
      ...(via === undefined ? {} : { via }),
      ...(comment === undefined ? {} : { comment }),
      ...(extension === undefined ? {} : { extension }),
    },
  };
}

function parseExtension(data: string): Readonly<Record<string, string>> {
  const body = data.slice(AAF_EXTENSION_CHUNK.length + 1);
  const entries: [string, string][] = [];
  for (const part of body.split(FIELD_SEPARATOR)) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    entries.push([part.slice(0, eq), decodeURIComponent(part.slice(eq + 1))]);
  }
  return Object.fromEntries(entries);
}
