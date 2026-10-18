/**
 * @module domain/person-file
 * @purpose One person to and from a file on the birth-record page (#699): reads an AAF'97 or Astraya JSON file into people, and stages replacing this person's birth data with one of them.
 * @conventions Pure. Reading reuses `aaf-people.ts` and `full-export-importer.ts`'s validation; staging reuses `stageFullExportRestore`, so the mutations are exactly what a restore would write. A replace keeps this person's id, name, notes, relocation places and custom points, and replaces the birth record, place label and time accuracy.
 * @exports PersonFileRead, readPersonFile, PersonChange, stagePersonReplace
 */
import type { Mutation } from '../store/oplog.js';
import type { AafParseError } from './aaf.js';
import { aafToExportedPeople, isAafText } from './aaf-people.js';
import type { ExportedPerson } from './full-export.js';
import { stageFullExportRestore, validateFullExport, type ImportError } from './full-export-importer.js';
import type { Person } from './person.js';
import type { Coordinates } from '../time/types.js';

export type PersonFileRead =
  | { readonly ok: true; readonly people: readonly ExportedPerson[]; readonly aafErrors: readonly AafParseError[] }
  | {
      readonly ok: false;
      readonly error:
        | { readonly kind: 'not-json' }
        | { readonly kind: 'invalid-export'; readonly error: ImportError }
        | { readonly kind: 'no-people'; readonly aafErrors: readonly AafParseError[] };
    };

/** The people in an AAF'97 or Astraya JSON file, or why it cannot be read. */
export function readPersonFile(text: string): PersonFileRead {
  if (isAafText(text)) {
    const { people, errors } = aafToExportedPeople(text);
    return people.length === 0
      ? { ok: false, error: { kind: 'no-people', aafErrors: errors } }
      : { ok: true, people, aafErrors: errors };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: { kind: 'not-json' } };
  }
  const result = validateFullExport(parsed);
  if (!result.ok) return { ok: false, error: { kind: 'invalid-export', error: result.error } };
  return result.value.people.length === 0
    ? { ok: false, error: { kind: 'no-people', aafErrors: [] } }
    : { ok: true, people: result.value.people, aafErrors: [] };
}

/** One field the replace changes, as plain values for the preview to word. */
export type PersonChange =
  | {
      readonly field: 'date' | 'time' | 'placeLabel' | 'calendar' | 'zone';
      readonly before: string;
      readonly after: string;
    }
  | { readonly field: 'coordinates'; readonly before: Coordinates | undefined; readonly after: Coordinates | undefined }
  | { readonly field: 'timeAccuracy'; readonly before: Person['timeAccuracy']; readonly after: Person['timeAccuracy'] };

const pad = (n: number): string => String(n).padStart(2, '0');

function facts(record: {
  readonly moment?: Person['moment'];
  readonly placeLabel: string;
}): Readonly<Record<string, string>> {
  const moment = record.moment;
  const civil = moment?.civil;
  return {
    date: civil === undefined ? '' : `${String(civil.year).padStart(4, '0')}-${pad(civil.month)}-${pad(civil.day)}`,
    time: civil === undefined ? '' : `${pad(civil.hour)}:${pad(civil.minute)}:${pad(civil.second)}`,
    placeLabel: record.placeLabel,
    calendar: moment?.calendar ?? '',
    zone:
      moment?.zoneOverride ??
      (moment?.offsetOverrideMinutes === undefined
        ? ''
        : `UTC${moment.offsetOverrideMinutes >= 0 ? '+' : ''}${String(moment.offsetOverrideMinutes)}m`),
  };
}

/**
 * The mutations that replace `existing`'s birth data with `incoming`'s, and the fields that change, for a preview
 * the reader confirms before anything is written (#699).
 */
export function stagePersonReplace(
  existing: Person,
  incoming: ExportedPerson,
): { readonly mutations: readonly Mutation[]; readonly changes: readonly PersonChange[] } {
  const replacement: ExportedPerson = {
    id: existing.id,
    displayName: existing.displayName,
    notes: existing.notes,
    placeLabel: incoming.placeLabel,
    timeAccuracy: incoming.timeAccuracy,
    missing: incoming.missing,
    ...(incoming.birth === undefined ? {} : { birth: incoming.birth }),
  };
  const [item] = stageFullExportRestore({ people: [replacement] }, new Map([[existing.id, existing]])).items;
  const before = facts(existing);
  const after = facts({ moment: incoming.birth, placeLabel: incoming.placeLabel });
  const changes: PersonChange[] = (['date', 'time', 'placeLabel', 'calendar', 'zone'] as const).flatMap(
    (field): PersonChange[] =>
      before[field] === after[field] ? [] : [{ field, before: before[field] ?? '', after: after[field] ?? '' }],
  );
  const [from, to] = [existing.moment?.coordinates, incoming.birth?.coordinates];
  if (from?.latitude !== to?.latitude || from?.longitude !== to?.longitude) {
    changes.splice(3, 0, { field: 'coordinates', before: from, after: to });
  }
  if (existing.timeAccuracy !== incoming.timeAccuracy) {
    changes.push({ field: 'timeAccuracy', before: existing.timeAccuracy, after: incoming.timeAccuracy });
  }
  return { mutations: item?.mutations ?? [], changes };
}
