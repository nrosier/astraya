/**
 * @module chart-search
 * @purpose Pure model and evaluator for searching stored charts by placement and timing (#1405): a flat list of scoped conditions (sign, house, aspect of a named body) combined with one AND or OR operator, evaluated against an already computed subject (natal chart plus optional transit, progression and return references).
 * @conventions No ephemeris, store or UI access: callers compute the `ChartData` and pass it in. Aspects are read from what the chart already computed (`aspects` for body-to-body, `angleAspects` for the natal Ascendant and Midheaven), never recomputed, so a search cannot disagree with the chart screen. Logic is three-valued: a house or angle condition for a person with no known birth time (or with undefined houses) is "not-evaluable" with a reason, never a silent non-match. AND is not-matched as soon as one condition is not-matched, else not-evaluable if any is; OR is matched as soon as one is matched, else not-evaluable if any is. A search holds 1 to `MAX_SEARCH_CONDITIONS` conditions. Every condition has a scope (absent means natal). Solar-arc scope (#1486): the directed chart is evaluated exactly like a progression (moving body against the natal chart, direction-aware, houses read from the natal cusps). Transit and progression scopes (answers 13 and 14): the moving body is the transiting or progressed body; a sign condition reads its own sign; a house condition reads the NATAL house the moving body occupies, from the natal cusps via `houseOf`; an aspect condition is direction-aware (`body` is the moving body, the target a natal body or the natal Ascendant or Midheaven), read from the contacts the caller computed, so the (transiting X, natal Y) pair differs from (transiting Y, natal X). Return scopes: the return chart is evaluated as a chart in its own right (a house is read in the return chart, aspects are those of the return chart); a return house or Ascendant/Midheaven condition is not-evaluable for an unknown birth time. A scope whose reference the caller did not supply is "not-evaluable" with reason `timing-unavailable`. The progressed houses carried on a progression reference come from `computeSecondaryProgression` and are kept for display only: no condition reads them.
 * @exports SEARCH_SCOPES, SearchScope, TimingReference, searchScopes, MAX_SEARCH_CONDITIONS, SEARCH_ANGLES, SearchOperator, SearchAngle, SearchCondition, SignCondition, HouseCondition, AspectCondition, AspectTarget, ChartSearch, SearchSubject, NotEvaluableReason, ConditionOutcome, ConditionResult, PersonSearchOutcome, PersonSearchResult, AddConditionResult, addCondition, validateSearch, evaluateCondition, evaluateSearch
 */
import type { Aspect } from '../astrology/aspects.js';
import { houseOf } from '../astrology/emphasis.js';
import { signIndex } from '../astrology/signs.js';
import type { BodyId, BodyPosition, HousePositions } from '../ephemeris/types.js';
import { housesAreDefined, type AngleAspect, type ChartData } from './chart-compute.js';

/** The most conditions one search may hold (owner decision, #1405 answer 10). Change it here only. */
export const MAX_SEARCH_CONDITIONS = 10;

/** The natal angles an aspect condition may target (Vertex and the lots are out of scope). */
export const SEARCH_ANGLES = ['asc', 'mc'] as const;

export type SearchAngle = (typeof SEARCH_ANGLES)[number];

/** One operator for the whole list. */
export type SearchOperator = 'and' | 'or';

/** Which chart a condition reads: the natal chart, the sky at the as-of date, the progressed chart, the return in force, or the solar-arc directed chart (#1486). */
export const SEARCH_SCOPES = ['natal', 'transit', 'progression', 'solarReturn', 'lunarReturn', 'solarArc'] as const;

export type SearchScope = (typeof SEARCH_SCOPES)[number];

/** Fields every condition shares. */
interface ScopedCondition {
  /** Absent means `'natal'`. */
  readonly scope?: SearchScope;
}

/** A body is in a sign (`sign` is 0..11, 0 = Aries). */
export interface SignCondition extends ScopedCondition {
  readonly kind: 'sign';
  readonly body: BodyId;
  readonly sign: number;
}

/** A body is in a house (`house` is 1..12): natal scope and the transit and progression scopes read the natal cusps; a return scope reads the return chart. */
export interface HouseCondition extends ScopedCondition {
  readonly kind: 'house';
  readonly body: BodyId;
  readonly house: number;
}

/** What an aspect condition aspects: another body, or the natal Ascendant or Midheaven. */
export type AspectTarget =
  { readonly kind: 'body'; readonly body: BodyId } | { readonly kind: 'angle'; readonly angle: SearchAngle };

/** A body makes the aspect named by `aspectKey` (an `AspectDefinition.key`) to the target. For transit and progression scope `body` is the moving body and the target is natal. */
export interface AspectCondition extends ScopedCondition {
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

/**
 * The moving side of a transit or a progression, read against the fixed natal chart. `contacts` and
 * `angleContacts` are directed: the moving body is `bodyA` of a contact, the natal body is `bodyB`; for an
 * angle contact `body` is the moving body and `angle` the natal Ascendant or Midheaven.
 */
export interface TimingReference {
  readonly positions: readonly BodyPosition[];
  readonly contacts: readonly Aspect[];
  readonly angleContacts: readonly AngleAspect[];
  /** The moving chart's own houses (progressed houses for a progression). Kept for display; no condition reads them. */
  readonly houses?: HousePositions;
}

/** One stored person, as the evaluator needs them. `chart` is the natal chart. */
export interface SearchSubject {
  readonly chart: ChartData;
  /** False when the person's `timeAccuracy` is `'unknown'`: houses and angles are then not usable. */
  readonly birthTimeKnown: boolean;
  readonly transit?: TimingReference;
  readonly progression?: TimingReference;
  /** The solar-arc directed chart at the as-of date (#1486): every natal body carried by the arc, against the natal chart. */
  readonly solarArc?: TimingReference;
  /** The solar return in force at the as-of date, as a chart. */
  readonly solarReturn?: ChartData;
  /** The lunar return in force at the as-of date, as a chart. */
  readonly lunarReturn?: ChartData;
}

export type NotEvaluableReason =
  /** The person's birth time is unknown, so houses and angles are not defined. */
  | 'birth-time-unknown'
  /** The time is known but the house system has no solution at this place. */
  | 'houses-undefined'
  /** The named body is not in this chart. */
  | 'body-missing'
  /** The condition's scope has no reference on the subject (not computed, or none exists for the as-of date). */
  | 'timing-unavailable';

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

function longitudeOf(positions: readonly BodyPosition[], body: BodyId): number | undefined {
  return positions.find((position) => position.body === body)?.longitude;
}

/** Why a chart's houses cannot be used for this person, or `undefined` when they can. */
function housesProblem(birthTimeKnown: boolean, houses: HousePositions): NotEvaluableReason | undefined {
  if (!birthTimeKnown) return 'birth-time-unknown';
  if (!housesAreDefined(houses)) return 'houses-undefined';
  return undefined;
}

/** The scope a condition reads; natal when absent. */
function scopeOf(condition: SearchCondition): SearchScope {
  return condition.scope ?? 'natal';
}

/** The distinct scopes a search reads, in `SEARCH_SCOPES` order: what a caller must compute for a subject. */
export function searchScopes(search: ChartSearch): readonly SearchScope[] {
  const used = new Set(search.conditions.map(scopeOf));
  return SEARCH_SCOPES.filter((scope) => used.has(scope));
}

/** Evaluates a condition against a single chart (the natal chart, or a return chart). */
function evaluateOnChart(condition: SearchCondition, chart: ChartData, birthTimeKnown: boolean): ConditionResult {
  switch (condition.kind) {
    case 'sign': {
      const longitude = longitudeOf(chart.positions, condition.body);
      if (longitude === undefined) return notEvaluable(condition, 'body-missing');
      return result(condition, signIndex(longitude) === condition.sign);
    }
    case 'house': {
      const problem = housesProblem(birthTimeKnown, chart.houses);
      if (problem !== undefined) return notEvaluable(condition, problem);
      const longitude = longitudeOf(chart.positions, condition.body);
      if (longitude === undefined) return notEvaluable(condition, 'body-missing');
      return result(condition, houseOf(longitude, chart.houses.cusps) === condition.house);
    }
    case 'aspect': {
      const { target } = condition;
      if (target.kind === 'angle') {
        const problem = housesProblem(birthTimeKnown, chart.houses);
        if (problem !== undefined) return notEvaluable(condition, problem);
        return result(
          condition,
          (chart.angleAspects ?? []).some(
            (a) => a.angle === target.angle && a.body === condition.body && a.aspect.key === condition.aspectKey,
          ),
        );
      }
      if (
        longitudeOf(chart.positions, condition.body) === undefined ||
        longitudeOf(chart.positions, target.body) === undefined
      ) {
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
  }
}

/** Evaluates a transit or progression condition: the moving body against the fixed natal chart. */
function evaluateMoving(condition: SearchCondition, subject: SearchSubject, moving: TimingReference): ConditionResult {
  const natal = subject.chart;
  const longitude = longitudeOf(moving.positions, condition.body);
  switch (condition.kind) {
    case 'sign': {
      if (longitude === undefined) return notEvaluable(condition, 'body-missing');
      return result(condition, signIndex(longitude) === condition.sign);
    }
    case 'house': {
      // Answer 14: the NATAL house the moving body occupies, read from the natal cusps.
      const problem = housesProblem(subject.birthTimeKnown, natal.houses);
      if (problem !== undefined) return notEvaluable(condition, problem);
      if (longitude === undefined) return notEvaluable(condition, 'body-missing');
      return result(condition, houseOf(longitude, natal.houses.cusps) === condition.house);
    }
    case 'aspect': {
      const { target } = condition;
      if (target.kind === 'angle') {
        const problem = housesProblem(subject.birthTimeKnown, natal.houses);
        if (problem !== undefined) return notEvaluable(condition, problem);
        if (longitude === undefined) return notEvaluable(condition, 'body-missing');
        return result(
          condition,
          moving.angleContacts.some(
            (a) => a.angle === target.angle && a.body === condition.body && a.aspect.key === condition.aspectKey,
          ),
        );
      }
      if (longitude === undefined || longitudeOf(natal.positions, target.body) === undefined) {
        return notEvaluable(condition, 'body-missing');
      }
      return result(
        condition,
        moving.contacts.some(
          (a) => a.aspect.key === condition.aspectKey && a.bodyA === condition.body && a.bodyB === target.body,
        ),
      );
    }
  }
}

/** Evaluates one condition against one person. */
export function evaluateCondition(condition: SearchCondition, subject: SearchSubject): ConditionResult {
  const scope = scopeOf(condition);
  switch (scope) {
    case 'natal':
      return evaluateOnChart(condition, subject.chart, subject.birthTimeKnown);
    case 'transit':
    case 'progression':
    case 'solarArc': {
      const moving = subject[scope];
      return moving === undefined
        ? notEvaluable(condition, 'timing-unavailable')
        : evaluateMoving(condition, subject, moving);
    }
    case 'solarReturn':
    case 'lunarReturn': {
      const chart = subject[scope];
      return chart === undefined
        ? notEvaluable(condition, 'timing-unavailable')
        : evaluateOnChart(condition, chart, subject.birthTimeKnown);
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
