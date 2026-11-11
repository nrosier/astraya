/**
 * @module chart-search
 * @purpose Pure model and evaluator for searching stored charts by placement (#1405): a flat list of conditions (sign, house, aspect of a named body) combined with one AND or OR operator, evaluated against an already computed chart.
 * @conventions No ephemeris, store or UI access: callers compute the `ChartData` and pass it in. Aspects are read from what the chart already computed (`aspects` for body-to-body, `angleAspects` for the natal Ascendant and Midheaven), never recomputed, so a search cannot disagree with the chart screen. Logic is three-valued: a house or angle condition for a person with no known birth time (or with undefined houses) is "not-evaluable" with a reason, never a silent non-match. AND is not-matched as soon as one condition is not-matched, else not-evaluable if any is; OR is matched as soon as one is matched, else not-evaluable if any is. A search holds 1 to `MAX_SEARCH_CONDITIONS` conditions.
 * @exports MAX_SEARCH_CONDITIONS, SEARCH_ANGLES, SearchOperator, SearchAngle, SearchCondition, SignCondition, HouseCondition, AspectCondition, AspectTarget, ChartSearch, SearchSubject, NotEvaluableReason, ConditionOutcome, ConditionResult, PersonSearchOutcome, PersonSearchResult, AddConditionResult, addCondition, validateSearch, evaluateCondition, evaluateSearch
 */
import { houseOf } from '../astrology/emphasis.js';
import { signIndex } from '../astrology/signs.js';
import type { BodyId } from '../ephemeris/types.js';
import { housesAreDefined, type ChartData } from './chart-compute.js';

/** The most conditions one search may hold (owner decision, #1405 answer 10). Change it here only. */
export const MAX_SEARCH_CONDITIONS = 10;

/** The natal angles an aspect condition may target (Vertex and the lots are out of scope). */
export const SEARCH_ANGLES = ['asc', 'mc'] as const;

export type SearchAngle = (typeof SEARCH_ANGLES)[number];

/** One operator for the whole list. */
export type SearchOperator = 'and' | 'or';

/** A body is in a sign (`sign` is 0..11, 0 = Aries). */
export interface SignCondition {
  readonly kind: 'sign';
  readonly body: BodyId;
  readonly sign: number;
}

/** A body is in a natal house (`house` is 1..12). */
export interface HouseCondition {
  readonly kind: 'house';
  readonly body: BodyId;
  readonly house: number;
}

/** What an aspect condition aspects: another body, or the natal Ascendant or Midheaven. */
export type AspectTarget =
  { readonly kind: 'body'; readonly body: BodyId } | { readonly kind: 'angle'; readonly angle: SearchAngle };

/** A body makes the aspect named by `aspectKey` (an `AspectDefinition.key`) to the target. */
export interface AspectCondition {
  readonly kind: 'aspect';
  readonly body: BodyId;
  readonly aspectKey: string;
  readonly target: AspectTarget;
}

export type SearchCondition = SignCondition | HouseCondition | AspectCondition;

export interface ChartSearch {
  readonly operator: SearchOperator;
  readonly conditions: readonly SearchCondition[];
}

/** One stored person, as the evaluator needs them. */
export interface SearchSubject {
  readonly chart: ChartData;
  /** False when the person's `timeAccuracy` is `'unknown'`: houses and angles are then not usable. */
  readonly birthTimeKnown: boolean;
}

export type NotEvaluableReason =
  /** The person's birth time is unknown, so houses and angles are not defined. */
  | 'birth-time-unknown'
  /** The time is known but the house system has no solution at this place. */
  | 'houses-undefined'
  /** The named body is not in this chart. */
  | 'body-missing';

export type ConditionOutcome = 'matched' | 'not-matched' | 'not-evaluable';

export interface ConditionResult {
  readonly condition: SearchCondition;
  readonly outcome: ConditionOutcome;
  /** Set exactly when `outcome` is `'not-evaluable'`. */
  readonly reason?: NotEvaluableReason;
}

export type PersonSearchOutcome = ConditionOutcome;

export interface PersonSearchResult {
  readonly outcome: PersonSearchOutcome;
  /** Every condition that matched for this person (all of them for a matched AND). */
  readonly matchedConditions: readonly SearchCondition[];
  /** One entry per condition, in search order. */
  readonly results: readonly ConditionResult[];
  /** The distinct reasons behind any not-evaluable conditions. */
  readonly notEvaluableReasons: readonly NotEvaluableReason[];
}

export type AddConditionResult =
  { readonly ok: true; readonly search: ChartSearch } | { readonly ok: false; readonly reason: 'too-many-conditions' };

/** Appends a condition, refusing the one past `MAX_SEARCH_CONDITIONS`. */
export function addCondition(search: ChartSearch, condition: SearchCondition): AddConditionResult {
  if (search.conditions.length >= MAX_SEARCH_CONDITIONS) return { ok: false, reason: 'too-many-conditions' };
  return { ok: true, search: { ...search, conditions: [...search.conditions, condition] } };
}

/** Why a search cannot run, or `undefined` when it can. */
export function validateSearch(search: ChartSearch): 'no-conditions' | 'too-many-conditions' | undefined {
  if (search.conditions.length === 0) return 'no-conditions';
  if (search.conditions.length > MAX_SEARCH_CONDITIONS) return 'too-many-conditions';
  return undefined;
}

function notEvaluable(condition: SearchCondition, reason: NotEvaluableReason): ConditionResult {
  return { condition, outcome: 'not-evaluable', reason };
}

function result(condition: SearchCondition, matched: boolean): ConditionResult {
  return { condition, outcome: matched ? 'matched' : 'not-matched' };
}

function longitudeOf(chart: ChartData, body: BodyId): number | undefined {
  return chart.positions.find((position) => position.body === body)?.longitude;
}

/** Why houses cannot be used for this person, or `undefined` when they can. */
function housesProblem(subject: SearchSubject): NotEvaluableReason | undefined {
  if (!subject.birthTimeKnown) return 'birth-time-unknown';
  if (!housesAreDefined(subject.chart.houses)) return 'houses-undefined';
  return undefined;
}

function evaluateAspect(condition: AspectCondition, subject: SearchSubject): ConditionResult {
  const { chart } = subject;
  const { target } = condition;
  if (target.kind === 'angle') {
    const problem = housesProblem(subject);
    if (problem !== undefined) return notEvaluable(condition, problem);
    return result(
      condition,
      (chart.angleAspects ?? []).some(
        (a) => a.angle === target.angle && a.body === condition.body && a.aspect.key === condition.aspectKey,
      ),
    );
  }
  if (longitudeOf(chart, condition.body) === undefined || longitudeOf(chart, target.body) === undefined) {
    return notEvaluable(condition, 'body-missing');
  }
  return result(
    condition,
    chart.aspects.some(
      (a) =>
        a.aspect.key === condition.aspectKey &&
        ((a.bodyA === condition.body && a.bodyB === target.body) ||
          (a.bodyB === condition.body && a.bodyA === target.body)),
    ),
  );
}

/** Evaluates one condition against one person. */
export function evaluateCondition(condition: SearchCondition, subject: SearchSubject): ConditionResult {
  switch (condition.kind) {
    case 'aspect':
      return evaluateAspect(condition, subject);
    case 'sign': {
      const longitude = longitudeOf(subject.chart, condition.body);
      if (longitude === undefined) return notEvaluable(condition, 'body-missing');
      return result(condition, signIndex(longitude) === condition.sign);
    }
    case 'house': {
      const problem = housesProblem(subject);
      if (problem !== undefined) return notEvaluable(condition, problem);
      const longitude = longitudeOf(subject.chart, condition.body);
      if (longitude === undefined) return notEvaluable(condition, 'body-missing');
      return result(condition, houseOf(longitude, subject.chart.houses.cusps) === condition.house);
    }
  }
}

/**
 * Evaluates a search against one person. Throws `RangeError` for a search `validateSearch` rejects:
 * that is a caller bug, not a per-person outcome.
 */
export function evaluateSearch(search: ChartSearch, subject: SearchSubject): PersonSearchResult {
  const invalid = validateSearch(search);
  if (invalid !== undefined) throw new RangeError(`invalid chart search: ${invalid}`);
  const results = search.conditions.map((condition) => evaluateCondition(condition, subject));
  const matchedConditions = results.filter((r) => r.outcome === 'matched').map((r) => r.condition);
  const anyNotMatched = results.some((r) => r.outcome === 'not-matched');
  const anyNotEvaluable = results.some((r) => r.outcome === 'not-evaluable');
  const reasons = new Set<NotEvaluableReason>();
  for (const r of results) if (r.reason !== undefined) reasons.add(r.reason);

  let outcome: PersonSearchOutcome;
  if (search.operator === 'and') {
    outcome = anyNotMatched ? 'not-matched' : anyNotEvaluable ? 'not-evaluable' : 'matched';
  } else {
    outcome = matchedConditions.length > 0 ? 'matched' : anyNotEvaluable ? 'not-evaluable' : 'not-matched';
  }
  return {
    outcome,
    matchedConditions,
    results,
    notEvaluableReasons: outcome === 'not-evaluable' ? [...reasons] : [],
  };
}
