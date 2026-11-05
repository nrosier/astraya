/**
 * Saved event-search queries, folded from the operation log (#1061, ADR 0005).
 *
 * A saved query is account data: a new entity kind, `savedQuery`, in the existing log, with no change to the
 * envelope, the spine, `OP_VERSION` or the relay. One entity per query; its `entityId` is the query's own id, so
 * purging a query erases exactly that query.
 *
 * **The definition is one register.** If each parameter were its own register, a query edited on two devices could
 * fold to a combination that nobody ever saved. One atomic value means a query is always one coherent saved state.
 * The `name` is a separate register, so a rename never overwrites a parameter change.
 *
 * **Reopen is exact or it says so.** A definition this build cannot read exactly (a newer `version`, an unknown
 * `tool`, a body or aspect key it does not know, a date that does not parse, a wrong-typed value) folds to an
 * `unreadable` entry that is listed and kept. It is never replaced by defaults, because that would reopen a
 * different search than the one the reader saved. An entity holding only one of its two registers is `incomplete`:
 * usually a partial sync, but permanent when the relay skipped an op, so it is listed and deletable rather than hidden.
 *
 * **Reads are total, writes are guarded.** `foldSavedQuery` never throws, because records also arrive from peers,
 * which only the envelope validates. `assertSavedQueryMutation` refuses a bad local write before the log is touched.
 *
 * Pure: no IndexedDB and no clock. `materialise` in fold.ts calls `foldSavedQuery`; `store.ts` calls the guard.
 *
 * @module store/saved-queries
 * @purpose Folds saved event-search queries (name and one atomic definition register) into readable, unreadable or incomplete entries, and builds and refuses the mutations written to the op-log.
 * @conventions The definition is one last-write-wins register carrying its own schema `version`, never merged field by field; an unreadable or incomplete query is listed and kept, never defaulted or hidden; fold functions never throw; refusals carry a code rather than prose, so the UI owns the wording; the name is capped at `MAX_CUSTOM_PROMPT_LENGTH` code points (owner decision D4); the list sorts by name then by a plain code-unit id comparison so the order is the same on every device.
 * @exports readSavedQueryDefinition, SAVED_QUERY_ENTITY, SAVED_QUERY_NAME_FIELD, SAVED_QUERY_DEFINITION_FIELD, SAVED_QUERY_NAME_MAX_CHARACTERS, SAVED_QUERY_BODY_KEYS, EVENT_SEARCH_KINDS, parseSearchDate, isSavedQueryNameTooLong, EventSearchQueryParameters, SavedQueryDefinition, SavedQueryUnreadable, SavedQuery, SavedQueryRefusal, SavedQueryRefusedError, foldSavedQuery, savedQueryCreate, savedQueryRename, assertSavedQueryMutation, sortedSavedQueries
 */
import { ASPECTS } from '../astrology/aspects.js';
import { BODIES } from '../astrology/bodies.js';
import { isId } from '../domain/id.js';
import { MAX_CUSTOM_PROMPT_LENGTH } from '../interpretation/prompt-guardrail.js';
import type { NoteFieldRegister } from './notes.js';
import type { Mutation } from './oplog.js';

/** Entity kind of a saved query. Its entity id is the query's own `q-` id. */
export const SAVED_QUERY_ENTITY = 'savedQuery';
export const SAVED_QUERY_NAME_FIELD = 'name';
export const SAVED_QUERY_DEFINITION_FIELD = 'definition';

/** The `deleted` tombstone field, spelled here so the guard does not import the fold it is called from. */
const TOMBSTONE_FIELD = 'deleted';

/** The longest a query name may be, in code points: the existing cap on a custom instruction (owner decision D4). */
export const SAVED_QUERY_NAME_MAX_CHARACTERS = MAX_CUSTOM_PROMPT_LENGTH;

/** The event kinds Event search offers. */
export const EVENT_SEARCH_KINDS = ['station', 'ingress', 'lunation', 'aspect'] as const;
type SearchKind = (typeof EVENT_SEARCH_KINDS)[number];

/** The bodies the Event search selectors offer: everything except the nodes and the Lilith points. */
export const SAVED_QUERY_BODY_KEYS: readonly string[] = BODIES.filter(
  (body) => body.category !== 'node' && body.category !== 'lilith',
).map((body) => body.key);

const ASPECT_KEYS: readonly string[] = ASPECTS.map((aspect) => aspect.key);

/** The definition schema version this build writes and reads. Independent of the envelope's `opVersion`. */
const DEFINITION_VERSION = 1;

/** The tool a definition belongs to. A discriminator, so later tools can reuse the entity. */
const EVENT_SEARCH_TOOL = 'event-search';

/** Exactly the parameters Event search holds. Dates are civil `YYYY-MM-DD` as typed, never a Julian day. */
export interface EventSearchQueryParameters {
  readonly from: string;
  readonly to: string;
  readonly kinds: readonly SearchKind[];
  readonly stationBody: string;
  readonly ingressBody: string;
  readonly aspectBodyA: string;
  readonly aspectBodyB: string;
  readonly aspectKey: string;
}

export interface SavedQueryDefinition {
  readonly tool: 'event-search';
  readonly version: 1;
  readonly parameters: EventSearchQueryParameters;
}

export type SavedQueryUnreadable = 'future-version' | 'unknown-tool' | 'invalid' | 'incomplete';

export type SavedQuery =
  | { readonly status: 'ready'; readonly id: string; readonly name: string; readonly definition: SavedQueryDefinition }
  | {
      readonly status: 'unreadable';
      readonly id: string;
      readonly name: string;
      readonly reason: SavedQueryUnreadable;
    };

/** Why a saved-query mutation was refused. A code, not prose, so the UI owns the wording. */
export type SavedQueryRefusal = 'invalid' | 'name-too-long';

export class SavedQueryRefusedError extends Error {
  readonly refusal: SavedQueryRefusal;

  constructor(refusal: SavedQueryRefusal) {
    super(`Saved query mutation refused: ${refusal}`);
    this.name = 'SavedQueryRefusedError';
    this.refusal = refusal;
  }
}

/**
 * Parse a `YYYY-MM-DD` date as the date inputs hold it. The one rule shared by Event search and by the saved-query
 * validation, so a saved date is accepted exactly when the form would accept it.
 */
export function parseSearchDate(value: string): readonly [number, number, number] | undefined {
  const match = /^(\d{4,6})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return [year, month, day];
}

/** Whether `name` is longer than a query name may be, counted in code points like the note limit. */
export function isSavedQueryNameTooLong(name: string): boolean {
  return Array.from(name).length > SAVED_QUERY_NAME_MAX_CHARACTERS;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKind(value: unknown): value is SearchKind {
  return EVENT_SEARCH_KINDS.some((kind) => kind === value);
}

function isBodyKey(value: unknown): value is string {
  return typeof value === 'string' && SAVED_QUERY_BODY_KEYS.includes(value);
}

/** Read the parameters, or undefined when any value is missing, wrong-typed or outside this build's vocabulary. */
function readParameters(value: unknown): EventSearchQueryParameters | undefined {
  if (!isRecord(value)) return undefined;
  const { from, to, kinds, stationBody, ingressBody, aspectBodyA, aspectBodyB, aspectKey } = value;
  if (typeof from !== 'string' || parseSearchDate(from) === undefined) return undefined;
  if (typeof to !== 'string' || parseSearchDate(to) === undefined) return undefined;
  if (!Array.isArray(kinds)) return undefined;
  const kindList: unknown[] = kinds;
  const knownKinds = kindList.filter(isKind);
  if (knownKinds.length !== kindList.length || new Set(knownKinds).size !== knownKinds.length) return undefined;
  if (!isBodyKey(stationBody) || !isBodyKey(ingressBody) || !isBodyKey(aspectBodyA) || !isBodyKey(aspectBodyB)) {
    return undefined;
  }
  if (typeof aspectKey !== 'string' || !ASPECT_KEYS.includes(aspectKey)) return undefined;
  return { from, to, kinds: knownKinds, stationBody, ingressBody, aspectBodyA, aspectBodyB, aspectKey };
}

type DefinitionVerdict =
  | { readonly ok: true; readonly definition: SavedQueryDefinition }
  | { readonly ok: false; readonly reason: Exclude<SavedQueryUnreadable, 'incomplete'> };

/** Judge a stored definition value. Total: any input yields a verdict. */
function readDefinition(value: unknown): DefinitionVerdict {
  if (!isRecord(value)) return { ok: false, reason: 'invalid' };
  const { tool, version, parameters } = value;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, reason: 'invalid' };
  // The version is checked before the tool: a newer definition may have changed anything else.
  if (version > DEFINITION_VERSION) return { ok: false, reason: 'future-version' };
  if (tool !== EVENT_SEARCH_TOOL) {
    return { ok: false, reason: typeof tool === 'string' && tool !== '' ? 'unknown-tool' : 'invalid' };
  }
  const read = readParameters(parameters);
  if (read === undefined) return { ok: false, reason: 'invalid' };
  return { ok: true, definition: { tool: EVENT_SEARCH_TOOL, version: DEFINITION_VERSION, parameters: read } };
}

/** A stored definition as this build reads it, rebuilt from only the keys it knows, or undefined when unreadable. */
export function readSavedQueryDefinition(value: unknown): SavedQueryDefinition | undefined {
  const verdict = readDefinition(value);
  return verdict.ok ? verdict.definition : undefined;
}

/**
 * Fold one query's registers. Pure, total (never throws), deterministic.
 *
 * Returns `undefined` only when the entity holds neither a `name` nor a `definition` register. A missing or
 * non-string `name` folds to the empty string; the UI shows a localised "Unnamed query" for it. The caller tests
 * for a purge marker first, since a purged entity holds only that marker and would otherwise look incomplete.
 */
export function foldSavedQuery(
  id: string,
  fields: Readonly<Record<string, NoteFieldRegister>>,
): SavedQuery | undefined {
  const nameRegister = fields[SAVED_QUERY_NAME_FIELD];
  const definitionRegister = fields[SAVED_QUERY_DEFINITION_FIELD];
  if (nameRegister === undefined && definitionRegister === undefined) return undefined;
  const name = typeof nameRegister?.value === 'string' ? nameRegister.value : '';
  if (nameRegister === undefined || definitionRegister === undefined) {
    return { status: 'unreadable', id, name, reason: 'incomplete' };
  }
  const verdict = readDefinition(definitionRegister.value);
  if (!verdict.ok) return { status: 'unreadable', id, name, reason: verdict.reason };
  return { status: 'ready', id, name, definition: verdict.definition };
}

/** The writes for a new query, to be committed in one `Store.mutate` batch so it never exists half-written. */
export function savedQueryCreate(id: string, name: string, definition: SavedQueryDefinition): readonly Mutation[] {
  return [
    { entity: SAVED_QUERY_ENTITY, entityId: id, field: SAVED_QUERY_NAME_FIELD, value: name },
    {
      entity: SAVED_QUERY_ENTITY,
      entityId: id,
      field: SAVED_QUERY_DEFINITION_FIELD,
      value: {
        tool: definition.tool,
        version: definition.version,
        parameters: { ...definition.parameters, kinds: [...definition.parameters.kinds] },
      },
    },
  ];
}

export function savedQueryRename(id: string, name: string): Mutation {
  return { entity: SAVED_QUERY_ENTITY, entityId: id, field: SAVED_QUERY_NAME_FIELD, value: name };
}

/**
 * Refuse a saved-query mutation the store must not write. Other entities pass through untouched.
 *
 * Allows only `name` (a string within the limit), `definition` (a readable shape) and `deleted` (a boolean). Every
 * other field, `purged` included, is refused: a purge goes through `Store.purge`, which appends directly. Covers
 * `mutate`, `remove` and `restore` only; an importer must write through `mutate` or it bypasses this check.
 */
export function assertSavedQueryMutation(mutation: Mutation): void {
  if (mutation.entity !== SAVED_QUERY_ENTITY) return;
  if (!isId(mutation.entityId) || !mutation.entityId.startsWith('q-')) throw new SavedQueryRefusedError('invalid');
  switch (mutation.field) {
    case SAVED_QUERY_NAME_FIELD:
      if (typeof mutation.value !== 'string') throw new SavedQueryRefusedError('invalid');
      if (isSavedQueryNameTooLong(mutation.value)) throw new SavedQueryRefusedError('name-too-long');
      return;
    case SAVED_QUERY_DEFINITION_FIELD:
      if (!readDefinition(mutation.value).ok) throw new SavedQueryRefusedError('invalid');
      return;
    case TOMBSTONE_FIELD:
      if (typeof mutation.value !== 'boolean') throw new SavedQueryRefusedError('invalid');
      return;
    default:
      throw new SavedQueryRefusedError('invalid');
  }
}

/** Plain code-unit comparison, so the tiebreak cannot differ between devices with different ICU data. */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The list order: name (locale-aware, for presentation), then id by code unit. Map iteration order is not part of
 * the contract, so the list is always sorted here.
 */
export function sortedSavedQueries(queries: ReadonlyMap<string, SavedQuery>, locale: string): readonly SavedQuery[] {
  const collator = new Intl.Collator(locale);
  return [...queries.values()].sort((a, b) => collator.compare(a.name, b.name) || compareCodeUnits(a.id, b.id));
}
