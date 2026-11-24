/**
 * Saved horary judgments, folded from the operation log (#1960, modelled on saved chart searches, #1405, ADR 0005).
 *
 * A saved judgment is account data: a new entity kind, `horaryJudgment`, in the existing log, with no change to the
 * envelope, the spine, `OP_VERSION` or the relay. The store has no op kinds: every op is `{entity, entityId, field,
 * value}`. Saving is a batch of two field writes in one `Store.mutate` call (`question`, `record`); delete is a write
 * of `deleted: true`, which `Store.remove` and `Store.restore` already make. One entity per judgment; its `entityId`
 * is the judgment's own `h-` id, so purging a judgment erases exactly that judgment.
 *
 * **The record stores the summary and never recomputes it.** Reopening shows what was judged when it was saved, so a
 * later change to the doctrine cannot rewrite a judgment the reader already saw. The record holds the moment as typed
 * (civil time and coordinates, never a resolved instant), the offset witness, the house system, the rulership scheme
 * and the summary: significator houses and rulers, the perfection kind, reception, the considerations and radicality.
 * It leaves out the full aspect, the reception lists and the void-of-course sentence, which belong to the chart.
 *
 * **Versions.** The record is version 1. Part 3 of #1960 adds a practitioner-input marking as version 2, with
 * version 1 still readable. A version above 1 folds to `future-version`, listed and kept, never read with defaults.
 * This build writes only version 1.
 *
 * **The record is one register.** Moment, place, house system and summary are saved together, so a judgment edited on
 * two devices folds to one coherent saved state, never a mix nobody saved. The `question` is a separate register, so
 * editing it never overwrites the record. A write to `question` after a delete does not undelete: it is a different
 * register from `deleted`.
 *
 * **Reopen is exact or it says so.** A record this build cannot read exactly (a newer `version`, an unknown house
 * system, perfection kind, reception kind, consideration key or body, a wrong-typed or out-of-range value) folds to an
 * `unreadable` entry that is listed and kept, never replaced by defaults. An entity holding only one of its two
 * registers is `incomplete`.
 *
 * **Reads are total, writes are guarded.** `foldHoraryJudgment` never throws, because records also arrive from peers,
 * which only the envelope validates. A non-empty house-system code this build does not offer (`HORARY_HOUSE_SYSTEMS`)
 * folds to `unknown-value`, like any other newer build's word (owner decision on PR #1970): the judgment is listed and
 * kept, but never shown as if complete, and no house system is guessed or defaulted. `assertHoraryJudgmentMutation`
 * refuses a local write of such a system, and refuses a bad write before the log is touched.
 *
 * Pure: no IndexedDB and no clock. `materialise` in fold.ts calls `foldHoraryJudgment`; `store.ts` calls the guard.
 *
 * @module store/horary-judgments
 * @purpose Folds saved horary judgments (a question and one atomic record of moment, place, house system and judgment summary) into readable, unreadable or incomplete entries, and builds and refuses the mutations written to the op-log.
 * @conventions The record is one last-write-wins register carrying its own schema `version` (this build writes and reads 1, keeps a higher one as `future-version`), never merged field by field; it stores the summary and never recomputes it; the moment is stored as typed with an offset witness, never a resolved instant; bodies are stored by key; the question shares the saved-query cap (500 code points, owner decision D1) and the place label the person-text cap; an unreadable or incomplete judgment is listed and kept, never defaulted or hidden; fold functions never throw; refusals carry a code rather than prose, so the UI owns the wording; the list sorts newest save first, then by a plain code-unit id comparison; no permanent-erase control is offered by the UI (owner decision D2), though `Store.purge` stays available as a developer operation.
 * @exports HORARY_JUDGMENT_ENTITY, HORARY_QUESTION_FIELD, HORARY_RECORD_FIELD, HORARY_RECORD_VERSION, HORARY_QUESTION_MAX_CHARACTERS, HoraryJudgmentRecord, HoraryJudgmentSummary, HoraryJudgmentUnreadable, SavedHoraryJudgment, HoraryJudgmentRefusal, HoraryJudgmentRefusedError, readHoraryJudgmentRecord, foldHoraryJudgment, horaryJudgmentCreate, horaryQuestionEdit, assertHoraryJudgmentMutation, sortedHoraryJudgments
 */
import type { HoraryConsiderationKey } from '../astrology/horary.js';
import type { ReceptionKind } from '../astrology/reception.js';
import { HORARY_HOUSE_SYSTEMS } from '../domain/horary.js';
import type { PerfectionKind } from '../domain/horary-judgment.js';
import { isId } from '../domain/id.js';
import {
  PERSON_TEXT_MAX_CHARACTERS,
  readCivil,
  readCoordinates,
  readWitness,
  type OffsetWitness,
} from '../domain/person.js';
import { MAX_CUSTOM_PROMPT_LENGTH } from '../interpretation/prompt-guardrail.js';
import type { CivilDateTime, Coordinates } from '../time/types.js';
import type { Hlc } from './hlc.js';
import type { NoteFieldRegister } from './notes.js';
import type { Mutation } from './oplog.js';
import type { JsonValue } from './ops.js';

/** Entity kind of a saved horary judgment. Its entity id is the judgment's own `h-` id. */
export const HORARY_JUDGMENT_ENTITY = 'horaryJudgment';
export const HORARY_QUESTION_FIELD = 'question';
export const HORARY_RECORD_FIELD = 'record';

/** The record schema version this build writes and reads. Independent of the envelope's `opVersion`. */
export const HORARY_RECORD_VERSION = 1;

/** The longest a saved question may be, in code points: the saved-query name cap (owner decision D1, #1960). */
export const HORARY_QUESTION_MAX_CHARACTERS = MAX_CUSTOM_PROMPT_LENGTH;

/** The `deleted` tombstone field, spelled here so the guard does not import the fold it is called from. */
const TOMBSTONE_FIELD = 'deleted';

/**
 * The closed lists the summary reads against. Each is a `Record` over the type's own union, so adding a member to
 * that union without adding it here is a compile error rather than a silent `unknown-value` on a valid judgment.
 */
const PERFECTION_KINDS: Readonly<Record<PerfectionKind, true>> = {
  directAspect: true,
  translation: true,
  collection: true,
  prohibition: true,
  frustration: true,
  signChange: true,
  refranation: true,
  none: true,
};
const RECEPTION_KINDS: Readonly<Record<ReceptionKind, true>> = { none: true, oneWay: true, mutual: true };
const CONSIDERATION_KEYS: Readonly<Record<HoraryConsiderationKey, true>> = {
  'ascendant-too-early': true,
  'ascendant-too-late': true,
  'moon-void-of-course': true,
  'moon-via-combusta': true,
  'saturn-in-seventh': true,
};
/** The seven classical planets, the only bodies a horary significator or third body can be (`domain/horary-judgment`). */
const PLANET_KEYS: readonly string[] = ['saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon'];

/** The rulership scheme this build records. `HoraryView` passes none, so the default applies. */
const RULERSHIP_SCHEME = 'traditional';

export interface HoraryJudgmentSummary {
  readonly querent: { readonly house: number; readonly rulerKey: string };
  readonly quesited: { readonly house: number; readonly rulerKey: string };
  readonly perfection: {
    readonly kind: PerfectionKind;
    readonly thirdBodyKey?: string;
    readonly impedimentBodyKey?: string;
    readonly timeToPerfectDays?: number;
  };
  readonly reception: { readonly kind: ReceptionKind; readonly sameDignityType: boolean };
  readonly receptionAidsPerfection: boolean;
  readonly considerations: readonly {
    readonly key: HoraryConsiderationKey;
    readonly applies: boolean;
    readonly softened: boolean;
  }[];
  readonly radical: boolean;
}

/** A record as read: version 1, the moment as typed, the witness, the system and scheme, and the stored summary. */
export interface HoraryJudgmentRecord {
  readonly version: 1;
  readonly civil: CivilDateTime;
  readonly coordinates: Coordinates;
  readonly witness: OffsetWitness;
  readonly placeLabel?: string;
  readonly houseSystem: string;
  readonly rulershipScheme: typeof RULERSHIP_SCHEME;
  readonly summary: HoraryJudgmentSummary;
}

export type HoraryJudgmentUnreadable = 'future-version' | 'unknown-value' | 'invalid' | 'incomplete';

/** `savedAt` is the HLC of the `record` register (of the `question` register when only that is held), for list order. */
export type SavedHoraryJudgment =
  | {
      readonly status: 'ready';
      readonly id: string;
      readonly question: string;
      readonly record: HoraryJudgmentRecord;
      readonly savedAt: Hlc;
    }
  | {
      readonly status: 'unreadable';
      readonly id: string;
      readonly question: string;
      readonly reason: HoraryJudgmentUnreadable;
      readonly savedAt: Hlc;
    };

/** Why a horary-judgment mutation was refused. A code, not prose, so the UI owns the wording. */
export type HoraryJudgmentRefusal = 'invalid' | 'question-too-long';

export class HoraryJudgmentRefusedError extends Error {
  readonly refusal: HoraryJudgmentRefusal;

  constructor(refusal: HoraryJudgmentRefusal) {
    super(`Horary judgment mutation refused: ${refusal}`);
    this.name = 'HoraryJudgmentRefusedError';
    this.refusal = refusal;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isKeyOf(list: Readonly<Record<string, true>>, value: unknown): value is string {
  return typeof value === 'string' && Object.hasOwn(list, value);
}

/** Tracks the two ways a value can be unreadable: broken (`invalid`) or a newer build's word (`unknown`). */
interface Verdict {
  invalid: boolean;
  unknown: boolean;
}

/** An unrecognised non-empty string is a newer build's word; anything else is a broken value. */
function markUnknownOrInvalid(verdict: Verdict, value: unknown): void {
  if (typeof value === 'string' && value !== '') verdict.unknown = true;
  else verdict.invalid = true;
}

function readPlanetKey(verdict: Verdict, value: unknown): string | undefined {
  if (typeof value === 'string' && PLANET_KEYS.includes(value)) return value;
  markUnknownOrInvalid(verdict, value);
  return undefined;
}

function readSignificator(
  verdict: Verdict,
  value: unknown,
): { readonly house: number; readonly rulerKey: string } | undefined {
  if (!isRecord(value) || !isIntegerIn(value.house, 1, 12)) {
    verdict.invalid = true;
    return undefined;
  }
  const rulerKey = readPlanetKey(verdict, value.rulerKey);
  return rulerKey === undefined ? undefined : { house: value.house, rulerKey };
}

function readPerfection(verdict: Verdict, value: unknown): HoraryJudgmentSummary['perfection'] | undefined {
  if (!isRecord(value)) {
    verdict.invalid = true;
    return undefined;
  }
  const { kind, thirdBodyKey, impedimentBodyKey, timeToPerfectDays } = value;
  const known = isKeyOf(PERFECTION_KINDS, kind) ? (kind as PerfectionKind) : undefined;
  if (known === undefined) markUnknownOrInvalid(verdict, kind);
  let third: string | undefined;
  if (thirdBodyKey !== undefined) third = readPlanetKey(verdict, thirdBodyKey);
  let impediment: string | undefined;
  if (impedimentBodyKey !== undefined) impediment = readPlanetKey(verdict, impedimentBodyKey);
  let days: number | undefined;
  if (timeToPerfectDays !== undefined) {
    if (typeof timeToPerfectDays === 'number' && Number.isFinite(timeToPerfectDays) && timeToPerfectDays >= 0) {
      days = timeToPerfectDays;
    } else verdict.invalid = true;
  }
  if (known === undefined) return undefined;
  return {
    kind: known,
    ...(third === undefined ? {} : { thirdBodyKey: third }),
    ...(impediment === undefined ? {} : { impedimentBodyKey: impediment }),
    ...(days === undefined ? {} : { timeToPerfectDays: days }),
  };
}

function readConsiderations(verdict: Verdict, value: unknown): HoraryJudgmentSummary['considerations'] | undefined {
  if (!Array.isArray(value)) {
    verdict.invalid = true;
    return undefined;
  }
  const list: unknown[] = value;
  const read: { key: HoraryConsiderationKey; applies: boolean; softened: boolean }[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (!isRecord(entry) || typeof entry.applies !== 'boolean' || typeof entry.softened !== 'boolean') {
      verdict.invalid = true;
      continue;
    }
    if (!isKeyOf(CONSIDERATION_KEYS, entry.key)) {
      markUnknownOrInvalid(verdict, entry.key);
      continue;
    }
    // A key listed twice would make "which one counts" depend on array order.
    if (seen.has(entry.key)) {
      verdict.invalid = true;
      continue;
    }
    seen.add(entry.key);
    read.push({ key: entry.key as HoraryConsiderationKey, applies: entry.applies, softened: entry.softened });
  }
  return read;
}

function readSummary(verdict: Verdict, value: unknown): HoraryJudgmentSummary | undefined {
  if (!isRecord(value)) {
    verdict.invalid = true;
    return undefined;
  }
  const querent = readSignificator(verdict, value.querent);
  const quesited = readSignificator(verdict, value.quesited);
  const perfection = readPerfection(verdict, value.perfection);
  const considerations = readConsiderations(verdict, value.considerations);
  let reception: HoraryJudgmentSummary['reception'] | undefined;
  if (isRecord(value.reception) && typeof value.reception.sameDignityType === 'boolean') {
    const kind = value.reception.kind;
    if (isKeyOf(RECEPTION_KINDS, kind)) {
      reception = { kind: kind as ReceptionKind, sameDignityType: value.reception.sameDignityType };
    } else markUnknownOrInvalid(verdict, kind);
  } else verdict.invalid = true;
  if (typeof value.receptionAidsPerfection !== 'boolean' || typeof value.radical !== 'boolean') {
    verdict.invalid = true;
  }
  if (
    querent === undefined ||
    quesited === undefined ||
    perfection === undefined ||
    considerations === undefined ||
    reception === undefined ||
    typeof value.receptionAidsPerfection !== 'boolean' ||
    typeof value.radical !== 'boolean'
  ) {
    return undefined;
  }
  return {
    querent,
    quesited,
    perfection,
    reception,
    receptionAidsPerfection: value.receptionAidsPerfection,
    considerations,
    radical: value.radical,
  };
}

type RecordVerdict =
  | { readonly ok: true; readonly record: HoraryJudgmentRecord }
  | { readonly ok: false; readonly reason: Exclude<HoraryJudgmentUnreadable, 'incomplete'> };

/** Judge a stored record value. Total: any input yields a verdict. Invalid outranks unknown. */
function readRecord(value: unknown): RecordVerdict {
  if (!isRecord(value)) return { ok: false, reason: 'invalid' };
  const { version } = value;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, reason: 'invalid' };
  // The version is checked before everything else: a newer record may have changed anything.
  if (version > HORARY_RECORD_VERSION) return { ok: false, reason: 'future-version' };

  const verdict: Verdict = { invalid: false, unknown: false };
  // Rebuilt from only the keys this build knows: `readCivil` hands back the stored object itself, extra keys and all.
  const civilRead = readCivil(value.civil);
  const civil =
    civilRead === undefined
      ? undefined
      : {
          year: civilRead.year,
          month: civilRead.month,
          day: civilRead.day,
          hour: civilRead.hour,
          minute: civilRead.minute,
          second: civilRead.second,
        };
  const coordinates = readCoordinates(value.coordinates);
  const witness = readWitness(value.witness);
  if (civil === undefined || coordinates === undefined || witness === undefined) verdict.invalid = true;
  const { placeLabel, houseSystem, rulershipScheme } = value;
  if (placeLabel !== undefined && typeof placeLabel !== 'string') verdict.invalid = true;
  // A code this build does not offer is a newer build's word, not a house to read with a default (#1960).
  if (typeof houseSystem !== 'string' || !HORARY_HOUSE_SYSTEMS.includes(houseSystem)) {
    markUnknownOrInvalid(verdict, houseSystem);
  }
  if (rulershipScheme !== RULERSHIP_SCHEME) markUnknownOrInvalid(verdict, rulershipScheme);
  const summary = readSummary(verdict, value.summary);

  if (verdict.invalid) return { ok: false, reason: 'invalid' };
  if (verdict.unknown) return { ok: false, reason: 'unknown-value' };
  if (
    civil === undefined ||
    coordinates === undefined ||
    witness === undefined ||
    summary === undefined ||
    typeof houseSystem !== 'string'
  ) {
    return { ok: false, reason: 'invalid' };
  }
  return {
    ok: true,
    record: {
      version: 1,
      civil,
      coordinates,
      witness: { offsetMinutes: witness.offsetMinutes, zone: witness.zone, tzdbFingerprint: witness.tzdbFingerprint },
      ...(typeof placeLabel === 'string' ? { placeLabel } : {}),
      houseSystem,
      rulershipScheme: RULERSHIP_SCHEME,
      summary,
    },
  };
}

/** A stored record as this build reads it, rebuilt from only the keys it knows, or undefined when unreadable. */
export function readHoraryJudgmentRecord(value: unknown): HoraryJudgmentRecord | undefined {
  const verdict = readRecord(value);
  return verdict.ok ? verdict.record : undefined;
}

/**
 * Fold one judgment's registers. Pure, total (never throws), deterministic.
 *
 * Returns `undefined` only when the entity holds neither a `question` nor a `record` register. A missing or
 * non-string `question` folds to the empty string; the UI shows a localised "no question" for it. The caller tests
 * for a purge marker first, since a purged entity holds only that marker and would otherwise look incomplete.
 */
export function foldHoraryJudgment(
  id: string,
  fields: Readonly<Record<string, NoteFieldRegister>>,
): SavedHoraryJudgment | undefined {
  const questionRegister = fields[HORARY_QUESTION_FIELD];
  const recordRegister = fields[HORARY_RECORD_FIELD];
  if (questionRegister === undefined && recordRegister === undefined) return undefined;
  const question = typeof questionRegister?.value === 'string' ? questionRegister.value : '';
  const savedAt = (recordRegister ?? questionRegister)?.hlc ?? '';
  if (questionRegister === undefined || recordRegister === undefined) {
    return { status: 'unreadable', id, question, reason: 'incomplete', savedAt };
  }
  const verdict = readRecord(recordRegister.value);
  if (!verdict.ok) return { status: 'unreadable', id, question, reason: verdict.reason, savedAt };
  return { status: 'ready', id, question, record: verdict.record, savedAt };
}

/** The record as a plain JSON value, copied, so a later edit of the caller's object cannot change the queued write. */
function recordValue(record: HoraryJudgmentRecord): JsonValue {
  const { summary } = record;
  const { perfection } = summary;
  return {
    version: record.version,
    civil: {
      year: record.civil.year,
      month: record.civil.month,
      day: record.civil.day,
      hour: record.civil.hour,
      minute: record.civil.minute,
      second: record.civil.second,
    },
    coordinates: { latitude: record.coordinates.latitude, longitude: record.coordinates.longitude },
    witness: {
      offsetMinutes: record.witness.offsetMinutes,
      zone: record.witness.zone,
      tzdbFingerprint: record.witness.tzdbFingerprint,
    },
    ...(record.placeLabel === undefined ? {} : { placeLabel: record.placeLabel }),
    houseSystem: record.houseSystem,
    rulershipScheme: record.rulershipScheme,
    summary: {
      querent: { house: summary.querent.house, rulerKey: summary.querent.rulerKey },
      quesited: { house: summary.quesited.house, rulerKey: summary.quesited.rulerKey },
      perfection: {
        kind: perfection.kind,
        ...(perfection.thirdBodyKey === undefined ? {} : { thirdBodyKey: perfection.thirdBodyKey }),
        ...(perfection.impedimentBodyKey === undefined ? {} : { impedimentBodyKey: perfection.impedimentBodyKey }),
        ...(perfection.timeToPerfectDays === undefined ? {} : { timeToPerfectDays: perfection.timeToPerfectDays }),
      },
      reception: { kind: summary.reception.kind, sameDignityType: summary.reception.sameDignityType },
      receptionAidsPerfection: summary.receptionAidsPerfection,
      considerations: summary.considerations.map((consideration) => ({
        key: consideration.key,
        applies: consideration.applies,
        softened: consideration.softened,
      })),
      radical: summary.radical,
    },
  };
}

/** The writes for a new judgment, to be committed in one `Store.mutate` batch so it never exists half-written. */
export function horaryJudgmentCreate(id: string, question: string, record: HoraryJudgmentRecord): readonly Mutation[] {
  return [
    { entity: HORARY_JUDGMENT_ENTITY, entityId: id, field: HORARY_QUESTION_FIELD, value: question },
    { entity: HORARY_JUDGMENT_ENTITY, entityId: id, field: HORARY_RECORD_FIELD, value: recordValue(record) },
  ];
}

export function horaryQuestionEdit(id: string, question: string): Mutation {
  return { entity: HORARY_JUDGMENT_ENTITY, entityId: id, field: HORARY_QUESTION_FIELD, value: question };
}

/**
 * Refuse a horary-judgment mutation the store must not write. Other entities pass through untouched.
 *
 * Allows only `question` (a string within the cap), `record` (version 1, readable, in a house system this build offers
 * and with a place label within the person-text cap) and `deleted` (a boolean). Every other field, `purged` included,
 * is refused: a purge goes through `Store.purge`, which appends directly.
 */
export function assertHoraryJudgmentMutation(mutation: Mutation): void {
  if (mutation.entity !== HORARY_JUDGMENT_ENTITY) return;
  if (!isId(mutation.entityId) || !mutation.entityId.startsWith('h-')) throw new HoraryJudgmentRefusedError('invalid');
  switch (mutation.field) {
    case HORARY_QUESTION_FIELD:
      if (typeof mutation.value !== 'string') throw new HoraryJudgmentRefusedError('invalid');
      if (Array.from(mutation.value).length > HORARY_QUESTION_MAX_CHARACTERS) {
        throw new HoraryJudgmentRefusedError('question-too-long');
      }
      return;
    case HORARY_RECORD_FIELD: {
      // This build writes only the current version; a higher version is read, never written.
      if (!isRecord(mutation.value) || mutation.value.version !== HORARY_RECORD_VERSION) {
        throw new HoraryJudgmentRefusedError('invalid');
      }
      const record = readHoraryJudgmentRecord(mutation.value);
      if (record === undefined || !HORARY_HOUSE_SYSTEMS.includes(record.houseSystem)) {
        throw new HoraryJudgmentRefusedError('invalid');
      }
      if (record.placeLabel !== undefined && Array.from(record.placeLabel).length > PERSON_TEXT_MAX_CHARACTERS) {
        throw new HoraryJudgmentRefusedError('invalid');
      }
      return;
    }
    case TOMBSTONE_FIELD:
      if (typeof mutation.value !== 'boolean') throw new HoraryJudgmentRefusedError('invalid');
      return;
    default:
      throw new HoraryJudgmentRefusedError('invalid');
  }
}

/** Plain code-unit comparison, so the tiebreak cannot differ between devices with different ICU data. */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The list order: newest save first (by the record's HLC, which is totally ordered across devices), then id by code
 * unit. Map iteration order is not part of the contract.
 */
export function sortedHoraryJudgments(
  judgments: ReadonlyMap<string, SavedHoraryJudgment>,
): readonly SavedHoraryJudgment[] {
  return [...judgments.values()].sort((a, b) => compareCodeUnits(b.savedAt, a.savedAt) || compareCodeUnits(a.id, b.id));
}
