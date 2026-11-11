/**
 * Saved chart searches, folded from the operation log (#1405, modelled on saved queries, ADR 0005).
 *
 * A saved chart search is account data: a new entity kind, `chartSearch`, in the existing log, with no change to the
 * envelope, the spine, `OP_VERSION` or the relay. One entity per search; its `entityId` is the search's own `s-` id,
 * so purging a search erases exactly that search.
 *
 * **Conditions only.** The definition holds the AND/OR operator and the condition list, never the as-of date a timing
 * condition is checked against (owner decision 9): a reopened search is checked against the date the reader sets then.
 *
 * **Timing is a scope, not a kind.** Each condition carries a `scope`: `natal`, `transit`, `progression`,
 * `solarReturn` or `lunarReturn` (owner decision 1). One scope field on the three existing kinds keeps a single reader
 * per kind, where four new kinds would repeat the body, aspect and target checks. `transit` and `progression` hold
 * only `aspect` conditions: the stored `body` is the transiting or progressed body, the target a natal body or the
 * natal `asc`/`mc` (decisions 2 and 11; any body key may transit an angle). `solarReturn` and `lunarReturn` hold
 * `sign`, `house` or `aspect` conditions evaluated in the return chart in force at the as-of date (decisions 3 and 7),
 * so their aspect target is in that return chart too.
 *
 * **Versions.** Version 1 (written before timing existed) has no `scope` field and only natal conditions; it stays
 * readable and is read as natal, because version 1 had no other scope, so this is the stored meaning, not a default.
 * A version-1 condition that carries a `scope` key is `invalid`. Version 2 is what this build writes: every condition
 * must carry `scope`, and one without it is `invalid`, never defaulted to natal. An unknown scope string is
 * `unknown-condition`. A version above 2 is `future-version`, listed and kept. The guard refuses writing version 1.
 *
 * **The definition is one register.** Operator and conditions are saved together, so a search edited on two devices
 * folds to one coherent saved state, never a mix nobody saved. The `name` is a separate register, so a rename never
 * overwrites a definition change.
 *
 * **Reopen is exact or it says so.** A definition this build cannot read exactly (a newer `version`, an unknown
 * condition kind, an unknown body, sign, house, aspect or angle, too many or no conditions, a wrong-typed value) folds
 * to an `unreadable` entry that is listed and kept. It is never replaced by defaults, because that would reopen a
 * different search than the one the reader saved. An entity holding only one of its two registers is `incomplete`.
 *
 * **Reads are total, writes are guarded.** `foldChartSearch` never throws, because records also arrive from peers,
 * which only the envelope validates. `assertChartSearchMutation` refuses a bad local write before the log is touched.
 *
 * Pure: no IndexedDB and no clock. `materialise` in fold.ts calls `foldChartSearch`; `store.ts` calls the guard.
 *
 * @module store/chart-searches
 * @purpose Folds saved chart searches (name and one atomic register of operator and conditions) into readable, unreadable or incomplete entries, and builds and refuses the mutations written to the op-log.
 * @conventions The definition is one last-write-wins register carrying its own schema `version` (this build writes 2, reads 1 and 2, keeps a higher one as `future-version`), never merged field by field, and never holding an as-of date; every version-2 condition carries a required `scope` (natal, transit, progression, solarReturn, lunarReturn; a missing scope is `invalid`, never defaulted), version-1 conditions have no scope and read as natal; transit and progression scopes hold aspect conditions only; bodies are stored by key, not by numeric id; an unreadable or incomplete search is listed and kept, never defaulted or hidden; fold functions never throw; refusals carry a code rather than prose, so the UI owns the wording; the name shares the saved-query cap; a search holds 1 to `CHART_SEARCH_MAX_CONDITIONS` conditions (owner decision 10); the list sorts by name then by a plain code-unit id comparison.
 * @exports CHART_SEARCH_ENTITY, CHART_SEARCH_NAME_FIELD, CHART_SEARCH_DEFINITION_FIELD, CHART_SEARCH_MAX_CONDITIONS, CHART_SEARCH_ANGLES, CHART_SEARCH_OPERATORS, CHART_SEARCH_SCOPES, CHART_SEARCH_DEFINITION_VERSION, StoredSearchScope, StoredSearchCondition, StoredSearchTarget, ChartSearchDefinition, ChartSearchUnreadable, SavedChartSearch, ChartSearchRefusal, ChartSearchRefusedError, readChartSearchDefinition, foldChartSearch, chartSearchCreate, chartSearchRename, assertChartSearchMutation, sortedChartSearches
 */
import { ASPECTS } from '../astrology/aspects.js';
import { BODIES } from '../astrology/bodies.js';
import { MAX_SEARCH_CONDITIONS } from '../domain/chart-search.js';
import { isId } from '../domain/id.js';
import type { NoteFieldRegister } from './notes.js';
import type { Mutation } from './oplog.js';
import { isSavedQueryNameTooLong } from './saved-queries.js';

/** Entity kind of a saved chart search. Its entity id is the search's own `s-` id. */
export const CHART_SEARCH_ENTITY = 'chartSearch';
export const CHART_SEARCH_NAME_FIELD = 'name';
export const CHART_SEARCH_DEFINITION_FIELD = 'definition';

/** The `deleted` tombstone field, spelled here so the guard does not import the fold it is called from. */
const TOMBSTONE_FIELD = 'deleted';

/** The most conditions one saved search may hold: the domain's cap (owner decision 10, #1405), re-exported under the store's name. */
export { MAX_SEARCH_CONDITIONS as CHART_SEARCH_MAX_CONDITIONS } from '../domain/chart-search.js';

/** The natal angles an aspect condition may target. */
export const CHART_SEARCH_ANGLES = ['asc', 'mc'] as const;
type StoredAngle = (typeof CHART_SEARCH_ANGLES)[number];

export const CHART_SEARCH_OPERATORS = ['and', 'or'] as const;
type StoredOperator = (typeof CHART_SEARCH_OPERATORS)[number];

/**
 * Where a condition is checked: the natal chart, a transit or progression against the natal chart, or the solar or
 * lunar return in force at the as-of date. The as-of date itself is never stored (owner decision 9).
 */
export const CHART_SEARCH_SCOPES = ['natal', 'transit', 'progression', 'solarReturn', 'lunarReturn'] as const;
export type StoredSearchScope = (typeof CHART_SEARCH_SCOPES)[number];
/** The scopes a sign or house condition may use: a transit or progression is stored as an aspect only. */
type ChartScope = Exclude<StoredSearchScope, 'transit' | 'progression'>;

/** The definition schema version this build writes. It reads 1 and 2. Independent of the envelope's `opVersion`. */
export const CHART_SEARCH_DEFINITION_VERSION = 2;
/** The version written before timing scopes existed: natal conditions with no `scope` field. */
const NATAL_ONLY_VERSION = 1;

const BODY_KEYS: readonly string[] = BODIES.map((body) => body.key);
const ASPECT_KEYS: readonly string[] = ASPECTS.map((aspect) => aspect.key);

export type StoredSearchTarget =
  { readonly kind: 'body'; readonly body: string } | { readonly kind: 'angle'; readonly angle: StoredAngle };

/**
 * A condition as read: bodies by key, sign 0..11 (0 = Aries), house 1..12. For a `transit` or `progression` aspect,
 * `body` is the moving body and `target` is natal; for a return scope, everything is in the return chart.
 */
export type StoredSearchCondition =
  | { readonly kind: 'sign'; readonly scope: ChartScope; readonly body: string; readonly sign: number }
  | { readonly kind: 'house'; readonly scope: ChartScope; readonly body: string; readonly house: number }
  | {
      readonly kind: 'aspect';
      readonly scope: StoredSearchScope;
      readonly body: string;
      readonly aspectKey: string;
      readonly target: StoredSearchTarget;
    };

/** A definition as read. A version-1 value is read into this version-2 shape, its conditions all natal. */
export interface ChartSearchDefinition {
  readonly version: 2;
  readonly operator: StoredOperator;
  readonly conditions: readonly StoredSearchCondition[];
}

export type ChartSearchUnreadable = 'future-version' | 'unknown-condition' | 'invalid' | 'incomplete';

export type SavedChartSearch =
  | {
      readonly status: 'ready';
      readonly id: string;
      readonly name: string;
      readonly definition: ChartSearchDefinition;
    }
  | {
      readonly status: 'unreadable';
      readonly id: string;
      readonly name: string;
      readonly reason: ChartSearchUnreadable;
    };

/** Why a chart-search mutation was refused. A code, not prose, so the UI owns the wording. */
export type ChartSearchRefusal = 'invalid' | 'name-too-long';

export class ChartSearchRefusedError extends Error {
  readonly refusal: ChartSearchRefusal;

  constructor(refusal: ChartSearchRefusal) {
    super(`Chart search mutation refused: ${refusal}`);
    this.name = 'ChartSearchRefusedError';
    this.refusal = refusal;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBodyKey(value: unknown): value is string {
  return typeof value === 'string' && BODY_KEYS.includes(value);
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function readTarget(value: unknown): StoredSearchTarget | undefined {
  if (!isRecord(value)) return undefined;
  const { kind, body, angle } = value;
  if (kind === 'body') return isBodyKey(body) ? { kind, body } : undefined;
  if (kind === 'angle') {
    const known = CHART_SEARCH_ANGLES.find((candidate) => candidate === angle);
    return known === undefined ? undefined : { kind, angle: known };
  }
  return undefined;
}

type ConditionVerdict =
  | { readonly ok: true; readonly condition: StoredSearchCondition }
  | { readonly ok: false; readonly reason: 'unknown-condition' | 'invalid' };

const INVALID: ConditionVerdict = { ok: false, reason: 'invalid' };
const UNKNOWN: ConditionVerdict = { ok: false, reason: 'unknown-condition' };

/** An unrecognised non-empty string is a newer build's word; anything else is a broken value. */
function unknownOrInvalid(value: unknown): ConditionVerdict {
  return typeof value === 'string' && value !== '' ? UNKNOWN : INVALID;
}

/**
 * Rebuild one condition from only the keys this build knows. A version-1 condition has no `scope` key and is natal;
 * a version-2 condition must carry one.
 */
function readCondition(value: unknown, version: number): ConditionVerdict {
  if (!isRecord(value)) return INVALID;
  const { kind, body, sign, house, aspectKey, target } = value;
  if (kind !== 'sign' && kind !== 'house' && kind !== 'aspect') return unknownOrInvalid(kind);
  let scope: StoredSearchScope;
  if (version === NATAL_ONLY_VERSION) {
    if ('scope' in value) return INVALID;
    scope = 'natal';
  } else {
    const known = CHART_SEARCH_SCOPES.find((candidate) => candidate === value.scope);
    if (known === undefined) return unknownOrInvalid(value.scope);
    scope = known;
  }
  if (!isBodyKey(body)) return INVALID;
  if (kind === 'aspect') {
    const readTargetValue = readTarget(target);
    if (typeof aspectKey !== 'string' || !ASPECT_KEYS.includes(aspectKey) || readTargetValue === undefined) {
      return INVALID;
    }
    return { ok: true, condition: { kind, scope, body, aspectKey, target: readTargetValue } };
  }
  // A transit or progression is stored as an aspect to the natal chart only.
  if (scope === 'transit' || scope === 'progression') return INVALID;
  if (kind === 'sign') return isIntegerIn(sign, 0, 11) ? { ok: true, condition: { kind, scope, body, sign } } : INVALID;
  return isIntegerIn(house, 1, 12) ? { ok: true, condition: { kind, scope, body, house } } : INVALID;
}

type DefinitionVerdict =
  | { readonly ok: true; readonly definition: ChartSearchDefinition }
  | { readonly ok: false; readonly reason: Exclude<ChartSearchUnreadable, 'incomplete'> };

/** Judge a stored definition value. Total: any input yields a verdict. */
function readDefinition(value: unknown): DefinitionVerdict {
  if (!isRecord(value)) return { ok: false, reason: 'invalid' };
  const { version, operator, conditions } = value;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, reason: 'invalid' };
  // The version is checked before everything else: a newer definition may have changed anything.
  if (version > CHART_SEARCH_DEFINITION_VERSION) return { ok: false, reason: 'future-version' };
  const knownOperator = CHART_SEARCH_OPERATORS.find((candidate) => candidate === operator);
  if (knownOperator === undefined || !Array.isArray(conditions)) return { ok: false, reason: 'invalid' };
  const list: unknown[] = conditions;
  if (list.length < 1 || list.length > MAX_SEARCH_CONDITIONS) return { ok: false, reason: 'invalid' };
  const read: StoredSearchCondition[] = [];
  let unknownKind = false;
  let invalid = false;
  for (const entry of list) {
    const verdict = readCondition(entry, version);
    if (verdict.ok) read.push(verdict.condition);
    else if (verdict.reason === 'unknown-condition') unknownKind = true;
    else invalid = true;
  }
  if (invalid) return { ok: false, reason: 'invalid' };
  if (unknownKind) return { ok: false, reason: 'unknown-condition' };
  return {
    ok: true,
    definition: { version: CHART_SEARCH_DEFINITION_VERSION, operator: knownOperator, conditions: read },
  };
}

/** A stored definition as this build reads it, rebuilt from only the keys it knows, or undefined when unreadable. */
export function readChartSearchDefinition(value: unknown): ChartSearchDefinition | undefined {
  const verdict = readDefinition(value);
  return verdict.ok ? verdict.definition : undefined;
}

/**
 * Fold one search's registers. Pure, total (never throws), deterministic.
 *
 * Returns `undefined` only when the entity holds neither a `name` nor a `definition` register. A missing or
 * non-string `name` folds to the empty string; the UI shows a localised "Unnamed search" for it. The caller tests
 * for a purge marker first, since a purged entity holds only that marker and would otherwise look incomplete.
 */
export function foldChartSearch(
  id: string,
  fields: Readonly<Record<string, NoteFieldRegister>>,
): SavedChartSearch | undefined {
  const nameRegister = fields[CHART_SEARCH_NAME_FIELD];
  const definitionRegister = fields[CHART_SEARCH_DEFINITION_FIELD];
  if (nameRegister === undefined && definitionRegister === undefined) return undefined;
  const name = typeof nameRegister?.value === 'string' ? nameRegister.value : '';
  if (nameRegister === undefined || definitionRegister === undefined) {
    return { status: 'unreadable', id, name, reason: 'incomplete' };
  }
  const verdict = readDefinition(definitionRegister.value);
  if (!verdict.ok) return { status: 'unreadable', id, name, reason: verdict.reason };
  return { status: 'ready', id, name, definition: verdict.definition };
}

/** The writes for a new search, to be committed in one `Store.mutate` batch so it never exists half-written. */
export function chartSearchCreate(id: string, name: string, definition: ChartSearchDefinition): readonly Mutation[] {
  return [
    { entity: CHART_SEARCH_ENTITY, entityId: id, field: CHART_SEARCH_NAME_FIELD, value: name },
    {
      entity: CHART_SEARCH_ENTITY,
      entityId: id,
      field: CHART_SEARCH_DEFINITION_FIELD,
      // Copied, so a later edit of the caller's list cannot change the value already queued for the log.
      value: {
        version: definition.version,
        operator: definition.operator,
        conditions: definition.conditions.map((condition) =>
          condition.kind === 'aspect' ? { ...condition, target: { ...condition.target } } : { ...condition },
        ),
      },
    },
  ];
}

export function chartSearchRename(id: string, name: string): Mutation {
  return { entity: CHART_SEARCH_ENTITY, entityId: id, field: CHART_SEARCH_NAME_FIELD, value: name };
}

/**
 * Refuse a chart-search mutation the store must not write. Other entities pass through untouched.
 *
 * Allows only `name` (a string within the limit), `definition` (a readable shape at the current version) and `deleted` (a boolean). Every
 * other field, `purged` included, is refused: a purge goes through `Store.purge`, which appends directly.
 */
export function assertChartSearchMutation(mutation: Mutation): void {
  if (mutation.entity !== CHART_SEARCH_ENTITY) return;
  if (!isId(mutation.entityId) || !mutation.entityId.startsWith('s-')) throw new ChartSearchRefusedError('invalid');
  switch (mutation.field) {
    case CHART_SEARCH_NAME_FIELD:
      if (typeof mutation.value !== 'string') throw new ChartSearchRefusedError('invalid');
      if (isSavedQueryNameTooLong(mutation.value)) throw new ChartSearchRefusedError('name-too-long');
      return;
    case CHART_SEARCH_DEFINITION_FIELD:
      // This build writes only the current version; a version-1 value is read, never written.
      if (!isRecord(mutation.value) || mutation.value.version !== CHART_SEARCH_DEFINITION_VERSION) {
        throw new ChartSearchRefusedError('invalid');
      }
      if (!readDefinition(mutation.value).ok) throw new ChartSearchRefusedError('invalid');
      return;
    case TOMBSTONE_FIELD:
      if (typeof mutation.value !== 'boolean') throw new ChartSearchRefusedError('invalid');
      return;
    default:
      throw new ChartSearchRefusedError('invalid');
  }
}

/** Plain code-unit comparison, so the tiebreak cannot differ between devices with different ICU data. */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The list order: name (locale-aware), then id by code unit. Map iteration order is not part of the contract. */
export function sortedChartSearches(
  searches: ReadonlyMap<string, SavedChartSearch>,
  locale: string,
): readonly SavedChartSearch[] {
  const collator = new Intl.Collator(locale);
  return [...searches.values()].sort((a, b) => collator.compare(a.name, b.name) || compareCodeUnits(a.id, b.id));
}
