/**
 * AAF birth-record exchange for people (#591): writes this device's people as AAF'97 records, and turns AAF records
 * back into the same staged, confirm-first restore that a full Astraya export uses. Only birth records travel;
 * charts are recomputed from them.
 *
 * Name: AAF splits a person into last and first name; Astraya keeps one display name. On export the display name is
 * written as the last-name field with an empty first name, so nothing is split by guesswork; on import the two AAF
 * fields are joined back with a space. A file written here round-trips exactly; a file from another program reads
 * its names as "First Last".
 *
 * What AAF cannot hold travels in the `#:astraya` extension chunk: time accuracy, notes, a zone override, saved
 * relocation places and formula points. A file from another program has none of these, so an imported person
 * gets "recorded" time accuracy only when the file says nothing, which the preview states.
 */
/**
 * @module AafPeople
 * @purpose Maps Astraya people to and from AAF'97 birth records (#591), and stages an AAF import as the same reviewed restore a full export uses.
 * @conventions Pure. Export never splits a display name; import joins first and last name. Every imported field is re-validated with person.ts's own readers, and a record whose extension cannot be read keeps only its standard AAF fields rather than failing.
 * @exports peopleToAaf, aafToExportedPeople, isAafText
 */
import { encodeAafRecord, parseAaf, type AafParseError, type AafRecord } from './aaf.js';
import type { ExportedPerson } from './full-export.js';
import {
  readCivil,
  readCoordinates,
  readCustomPoints,
  readRelocationPlaces,
  readTimeAccuracy,
  type Person,
} from './person.js';

/** Whether a file's text is AAF: it has an #A93 chunk at the start of a line, which a JSON export never does. */
export function isAafText(text: string): boolean {
  return /^#A93:/m.test(text);
}

function extensionOf(person: Person): Record<string, string> {
  const extension: Record<string, string> = { id: person.id, timeAccuracy: person.timeAccuracy };
  if (person.notes !== '') extension.notes = person.notes;
  if (person.moment?.zoneOverride !== undefined) extension.zoneOverride = person.moment.zoneOverride;
  if (person.moment?.calendar === 'auto') extension.calendar = 'auto';
  // AAF holds coordinates to the arc-second; the exact stored values travel here so a file written here re-imports unchanged.
  if (person.moment !== undefined) {
    extension.latitude = String(person.moment.coordinates.latitude);
    extension.longitude = String(person.moment.coordinates.longitude);
  }
  if (person.relocationPlaces !== undefined) extension.relocationPlaces = JSON.stringify(person.relocationPlaces);
  if (person.customPoints !== undefined) extension.customPoints = JSON.stringify(person.customPoints);
  return extension;
}

/**
 * Every person with a complete birth record, as AAF'97 text, one record each. A person without a complete record
 * cannot be written, since AAF requires a date and coordinates; they are returned by name so the caller can say so.
 */
export function peopleToAaf(people: readonly Person[]): { readonly text: string; readonly skipped: readonly Person[] } {
  const skipped: Person[] = [];
  const parts: string[] = [];
  for (const person of people) {
    if (person.moment === undefined) {
      skipped.push(person);
      continue;
    }
    const record: AafRecord = {
      name: person.displayName,
      firstName: '',
      birth: person.moment,
      place: person.placeLabel,
      extension: extensionOf(person),
    };
    parts.push(encodeAafRecord(record));
  }
  // A closing #: chunk, as AAF'97 section 2.5 recommends for a file that may be mailed or posted.
  return { text: `${parts.join('')}#:\n`, skipped };
}

function personIdFor(record: AafRecord, index: number): string {
  const id = record.extension?.id;
  return id !== undefined && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : `aaf-${String(index + 1)}`;
}

/** Half an arc-second: the most AAF's own rounding can move a coordinate. */
const HALF_ARC_SECOND = 0.5 / 3600;

/**
 * The exact coordinates from the extension, but only if they agree with the standard AAF fields to within AAF's own
 * rounding. If another program has edited the AAF coordinates, they no longer agree, and the AAF fields win.
 */
function exactCoordinates(
  aaf: { readonly latitude: number; readonly longitude: number },
  extension: Readonly<Record<string, string>>,
): { latitude: number; longitude: number } {
  const latitude = Number(extension.latitude);
  const longitude = Number(extension.longitude);
  const agrees =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude - aaf.latitude) <= HALF_ARC_SECOND &&
    Math.abs(longitude - aaf.longitude) <= HALF_ARC_SECOND;
  return agrees ? { latitude, longitude } : { latitude: aaf.latitude, longitude: aaf.longitude };
}

function parseJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * AAF text as `ExportedPerson`s, ready for `stageFullExportRestore`. A record keeps its Astraya id when the file
 * carries one (so re-importing a file written here updates the same people), otherwise gets a positional id.
 */
export function aafToExportedPeople(text: string): {
  readonly people: readonly ExportedPerson[];
  readonly errors: readonly AafParseError[];
} {
  const { records, errors } = parseAaf(text);
  const people: ExportedPerson[] = [];
  records.forEach((record, index) => {
    const extension = record.extension ?? {};
    const civil = readCivil(record.birth.civil);
    const coordinates = readCoordinates(exactCoordinates(record.birth.coordinates, extension));
    if (civil === undefined || coordinates === undefined) return;
    const calendar = extension.calendar === 'auto' ? 'auto' : record.birth.calendar;
    // Key order matches person.ts's own assembly (calendar, zoneOverride, offsetOverrideMinutes), because the restore
    // staging compares birth records by their JSON text: the same record in another key order would read as changed.
    const birth = {
      civil,
      coordinates,
      ...(calendar === undefined ? {} : { calendar }),
      ...(extension.zoneOverride === undefined ? {} : { zoneOverride: extension.zoneOverride }),
      ...(record.birth.offsetOverrideMinutes === undefined
        ? {}
        : { offsetOverrideMinutes: record.birth.offsetOverrideMinutes }),
    };
    const relocationPlaces = readRelocationPlaces(parseJson(extension.relocationPlaces));
    const customPoints = readCustomPoints(parseJson(extension.customPoints));
    const displayName = [record.firstName, record.name].filter((part) => part !== '').join(' ');
    const notes = [extension.notes, record.comment].filter((part): part is string => part !== undefined && part !== '');
    people.push({
      id: personIdFor(record, index),
      displayName,
      placeLabel: record.place,
      timeAccuracy: readTimeAccuracy(extension.timeAccuracy) ?? 'recorded',
      notes: notes.join('\n'),
      birth,
      missing: [],
      ...(relocationPlaces === undefined ? {} : { relocationPlaces }),
      ...(customPoints === undefined ? {} : { customPoints }),
    });
  });
  return { people, errors };
}
