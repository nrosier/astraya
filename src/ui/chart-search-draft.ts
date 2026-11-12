/**
 * @module ui/chart-search-draft
 * @purpose Pure draft model for building a chart search (#1405): the operator, the condition list and the as-of date being edited, with conversion both ways between the stored definition (bodies by key) and the domain `ChartSearch` (bodies by id).
 * @conventions No React, store writes or sweph-wasm access. Every function returns a new draft and never mutates its input. The draft holds domain conditions; the as-of date is draft-only state (default `todayInputValue()`, the local calendar day) and never appears in a built definition (owner decision 9). Adding is refused at the domain's `MAX_SEARCH_CONDITIONS`. A body key or id with no body definition, and a malformed as-of date, give a typed error and never a silent default. Scopes and kinds are not filtered here: every one the store accepts (including sign and house conditions in the transit and progression scopes, and the Ascendant and Midheaven as aspect targets) passes through, so the only refusals are the store's own (no conditions, too many).
 * @exports ChartSearchDraft, DraftError, DraftResult, AsOfDate, newDraft, setOperator, addDraftCondition, removeDraftCondition, editDraftCondition, setAsOf, parseAsOf, draftFromDefinition, definitionFromDraft
 */
import { bodyById, bodyByKey } from '../astrology/bodies.js';
import {
  addCondition,
  validateSearch,
  type AspectTarget,
  type ChartSearch,
  type SearchCondition,
  type SearchOperator,
} from '../domain/chart-search.js';
import type { BodyId } from '../ephemeris/types.js';
import type { ChartSearchDefinition, StoredSearchCondition, StoredSearchTarget } from '../store/chart-searches.js';
import { CHART_SEARCH_DEFINITION_VERSION } from '../store/chart-searches.js';
import { todayInputValue } from './format.js';

/** The search being built. `asOf` is a `yyyy-mm-dd` string and is never saved. */
export interface ChartSearchDraft {
  readonly operator: SearchOperator;
  readonly conditions: readonly SearchCondition[];
  readonly asOf: string;
}

/** Why a draft step failed. A code (plus the offending value), so the UI owns the wording. */
export type DraftError =
  | { readonly code: 'too-many-conditions' }
  | { readonly code: 'no-conditions' }
  | { readonly code: 'index-out-of-range'; readonly index: number }
  | { readonly code: 'unknown-body-key'; readonly key: string }
  | { readonly code: 'unknown-body-id'; readonly id: BodyId }
  | { readonly code: 'invalid-as-of-date'; readonly value: string };

export type DraftResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: DraftError };

/** The as-of date as the numbers `asOfJulianDay` takes. */
export interface AsOfDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function ok<T>(value: T): DraftResult<T> {
  return { ok: true, value };
}

function fail<T>(error: DraftError): DraftResult<T> {
  return { ok: false, error };
}

/** An empty draft: AND, no conditions, as of `asOf` (default today in the local timezone). */
export function newDraft(asOf: string = todayInputValue()): ChartSearchDraft {
  return { operator: 'and', conditions: [], asOf };
}

export function setOperator(draft: ChartSearchDraft, operator: SearchOperator): ChartSearchDraft {
  return { ...draft, operator };
}

/** Appends a condition, refusing the one past `MAX_SEARCH_CONDITIONS`. */
export function addDraftCondition(draft: ChartSearchDraft, condition: SearchCondition): DraftResult<ChartSearchDraft> {
  const added = addCondition({ operator: draft.operator, conditions: draft.conditions }, condition);
  if (!added.ok) return fail({ code: added.reason });
  return ok({ ...draft, conditions: added.search.conditions });
}

export function removeDraftCondition(draft: ChartSearchDraft, index: number): DraftResult<ChartSearchDraft> {
  if (!Number.isInteger(index) || index < 0 || index >= draft.conditions.length) {
    return fail({ code: 'index-out-of-range', index });
  }
  return ok({ ...draft, conditions: draft.conditions.filter((_, position) => position !== index) });
}

/** Replaces the condition at `index`. */
export function editDraftCondition(
  draft: ChartSearchDraft,
  index: number,
  condition: SearchCondition,
): DraftResult<ChartSearchDraft> {
  if (!Number.isInteger(index) || index < 0 || index >= draft.conditions.length) {
    return fail({ code: 'index-out-of-range', index });
  }
  return ok({
    ...draft,
    conditions: draft.conditions.map((existing, position) => (position === index ? condition : existing)),
  });
}

/** Sets the as-of date text as typed; it is checked by `parseAsOf` when the search runs. */
export function setAsOf(draft: ChartSearchDraft, asOf: string): ChartSearchDraft {
  return { ...draft, asOf };
}

/** Parses a `yyyy-mm-dd` as-of date into year, month and day, rejecting dates that are not on the calendar. */
export function parseAsOf(value: string): DraftResult<AsOfDate> {
  const match = /^(-?\d{1,6})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return fail({ code: 'invalid-as-of-date', value });
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return fail({ code: 'invalid-as-of-date', value });
  }
  return ok({ year, month, day });
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function idOfKey(key: string): DraftResult<BodyId> {
  const body = bodyByKey(key);
  return body === undefined ? fail({ code: 'unknown-body-key', key }) : ok(body.id);
}

function keyOfId(id: BodyId): DraftResult<string> {
  const body = bodyById(id);
  return body === undefined ? fail({ code: 'unknown-body-id', id }) : ok(body.key);
}

function targetFromStored(target: StoredSearchTarget): DraftResult<AspectTarget> {
  if (target.kind === 'angle') return ok({ kind: 'angle', angle: target.angle });
  const body = idOfKey(target.body);
  return body.ok ? ok({ kind: 'body', body: body.value }) : fail(body.error);
}

function conditionFromStored(stored: StoredSearchCondition): DraftResult<SearchCondition> {
  const body = idOfKey(stored.body);
  if (!body.ok) return fail(body.error);
  if (stored.kind === 'sign') return ok({ kind: 'sign', scope: stored.scope, body: body.value, sign: stored.sign });
  if (stored.kind === 'house') return ok({ kind: 'house', scope: stored.scope, body: body.value, house: stored.house });
  const target = targetFromStored(stored.target);
  if (!target.ok) return fail(target.error);
  return ok({
    kind: 'aspect',
    scope: stored.scope,
    body: body.value,
    aspectKey: stored.aspectKey,
    target: target.value,
  });
}

function targetToStored(target: AspectTarget): DraftResult<StoredSearchTarget> {
  if (target.kind === 'angle') return ok({ kind: 'angle', angle: target.angle });
  const key = keyOfId(target.body);
  return key.ok ? ok({ kind: 'body', body: key.value }) : fail(key.error);
}

function conditionToStored(condition: SearchCondition): DraftResult<StoredSearchCondition> {
  const key = keyOfId(condition.body);
  if (!key.ok) return fail(key.error);
  const scope = condition.scope ?? 'natal';
  if (condition.kind === 'sign') return ok({ kind: 'sign', scope, body: key.value, sign: condition.sign });
  if (condition.kind === 'house') return ok({ kind: 'house', scope, body: key.value, house: condition.house });
  const target = targetToStored(condition.target);
  if (!target.ok) return fail(target.error);
  return ok({ kind: 'aspect', scope, body: key.value, aspectKey: condition.aspectKey, target: target.value });
}

/** Opens a saved definition as a draft; the as-of date is today (or `asOf`), since a definition never stores one. */
export function draftFromDefinition(
  definition: ChartSearchDefinition,
  asOf: string = todayInputValue(),
): DraftResult<ChartSearchDraft> {
  const conditions: SearchCondition[] = [];
  for (const stored of definition.conditions) {
    const condition = conditionFromStored(stored);
    if (!condition.ok) return fail(condition.error);
    conditions.push(condition.value);
  }
  return ok({ operator: definition.operator, conditions, asOf });
}

/**
 * The definition to save: operator and conditions only, never the as-of date. Refuses only what the store refuses
 * (no conditions, too many), plus a body id with no key.
 */
export function definitionFromDraft(draft: ChartSearchDraft): DraftResult<ChartSearchDefinition> {
  const search: ChartSearch = { operator: draft.operator, conditions: draft.conditions };
  const problem = validateSearch(search);
  if (problem !== undefined) return fail({ code: problem });
  const conditions: StoredSearchCondition[] = [];
  for (const condition of draft.conditions) {
    const stored = conditionToStored(condition);
    if (!stored.ok) return fail(stored.error);
    conditions.push(stored.value);
  }
  return ok({ version: CHART_SEARCH_DEFINITION_VERSION, operator: draft.operator, conditions });
}
