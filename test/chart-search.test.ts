/**
 * Tests for the pure chart-search model and evaluator (#1405).
 *
 * Charts come from the real Swiss Ephemeris engine, never a mock. Conditions are derived from what
 * the computed chart actually contains, so the expectations hold without hard-coding ephemeris values.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { houseOf } from '../src/astrology/emphasis.js';
import { signIndex } from '../src/astrology/signs.js';
import { computeChartData, type ChartData } from '../src/domain/chart-compute.js';
import {
  addCondition,
  evaluateCondition,
  evaluateSearch,
  MAX_SEARCH_CONDITIONS,
  validateSearch,
  type AspectCondition,
  type ChartSearch,
  type HouseCondition,
  type SearchCondition,
  type SearchSubject,
  type SignCondition,
} from '../src/domain/chart-search.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const MOMENT: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

function bodyId(key: string): number {
  const definition = bodyByKey(key);
  if (definition === undefined) throw new Error(`no body ${key}`);
  return definition.id;
}

const SUN = bodyId('sun');
const MOON = bodyId('moon');

let chart: ChartData;
let known: SearchSubject;
let unknownTime: SearchSubject;

function longitude(body: number): number {
  const position = chart.positions.find((p) => p.body === body);
  if (position === undefined) throw new Error(`no position for ${body}`);
  return position.longitude;
}

beforeAll(async () => {
  chart = await computeChartData(MOMENT, await getEngine());
  known = { chart, birthTimeKnown: true };
  unknownTime = { chart, birthTimeKnown: false };
});

function sunSign(offset: number): SignCondition {
  return { kind: 'sign', body: SUN, sign: (signIndex(longitude(SUN)) + offset) % 12 };
}

function sunHouse(offset: number): HouseCondition {
  return { kind: 'house', body: SUN, house: ((houseOf(longitude(SUN), chart.houses.cusps) - 1 + offset) % 12) + 1 };
}

const search = (operator: 'and' | 'or', conditions: readonly SearchCondition[]): ChartSearch => ({
  operator,
  conditions,
});

describe('sign and house conditions', () => {
  it('matches the sign and house the chart places the body in', () => {
    expect(evaluateCondition(sunSign(0), known).outcome).toBe('matched');
    expect(evaluateCondition(sunSign(1), known).outcome).toBe('not-matched');
    expect(evaluateCondition(sunHouse(0), known).outcome).toBe('matched');
    expect(evaluateCondition(sunHouse(1), known).outcome).toBe('not-matched');
  });
});

describe('AND / OR truth table', () => {
  const cases: readonly [boolean, boolean][] = [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ];
  it.each(cases)('AND and OR for (%s, %s)', (a, b) => {
    const conditions = [sunSign(a ? 0 : 1), sunSign(b ? 0 : 1)];
    expect(evaluateSearch(search('and', conditions), known).outcome).toBe(a && b ? 'matched' : 'not-matched');
    expect(evaluateSearch(search('or', conditions), known).outcome).toBe(a || b ? 'matched' : 'not-matched');
  });
});

describe('aspect conditions', () => {
  it('matches a body-to-body aspect in either direction and rejects others', () => {
    const found = chart.aspects[0];
    if (found === undefined) throw new Error('fixture chart has no aspects');
    const forward: AspectCondition = {
      kind: 'aspect',
      body: found.bodyA,
      aspectKey: found.aspect.key,
      target: { kind: 'body', body: found.bodyB },
    };
    const reverse: AspectCondition = {
      ...forward,
      body: found.bodyB,
      target: { kind: 'body', body: found.bodyA },
    };
    expect(evaluateCondition(forward, known).outcome).toBe('matched');
    expect(evaluateCondition(reverse, known).outcome).toBe('matched');
    const wrongKind = found.aspect.key === 'trine' ? 'sextile' : 'trine';
    const other = chart.aspects.some(
      (a) => a.aspect.key === wrongKind && a.bodyA === found.bodyA && a.bodyB === found.bodyB,
    );
    expect(other).toBe(false);
    expect(evaluateCondition({ ...forward, aspectKey: wrongKind }, known).outcome).toBe('not-matched');
  });

  it.each(['asc', 'mc'] as const)('matches an aspect to the natal %s from the chart angleAspects', (angle) => {
    const found = (chart.angleAspects ?? []).find((a) => a.angle === angle);
    if (found === undefined) throw new Error(`fixture chart has no ${angle} aspect`);
    const condition: AspectCondition = {
      kind: 'aspect',
      body: found.body,
      aspectKey: found.aspect.key,
      target: { kind: 'angle', angle },
    };
    expect(evaluateCondition(condition, known).outcome).toBe('matched');
    const otherAngle = angle === 'asc' ? 'mc' : 'asc';
    const onOther = (chart.angleAspects ?? []).some(
      (a) => a.angle === otherAngle && a.body === found.body && a.aspect.key === found.aspect.key,
    );
    expect(evaluateCondition({ ...condition, target: { kind: 'angle', angle: otherAngle } }, known).outcome).toBe(
      onOther ? 'matched' : 'not-matched',
    );
  });
});

describe('unknown birth time', () => {
  let house: HouseCondition;
  beforeAll(() => {
    house = sunHouse(0);
  });
  const angle: AspectCondition = {
    kind: 'aspect',
    body: MOON,
    aspectKey: 'conjunction',
    target: { kind: 'angle', angle: 'asc' },
  };

  it('reports house and angle conditions as not evaluable, never not-matched', () => {
    for (const condition of [house, angle]) {
      const result = evaluateCondition(condition, unknownTime);
      expect(result.outcome).toBe('not-evaluable');
      expect(result.reason).toBe('birth-time-unknown');
    }
  });

  it('still evaluates sign conditions', () => {
    expect(evaluateCondition(sunSign(0), unknownTime).outcome).toBe('matched');
  });

  it('combines three-valued: AND with a not-matched is not-matched, otherwise not evaluable', () => {
    expect(evaluateSearch(search('and', [house, sunSign(1)]), unknownTime).outcome).toBe('not-matched');
    const and = evaluateSearch(search('and', [house, sunSign(0)]), unknownTime);
    expect(and.outcome).toBe('not-evaluable');
    expect(and.notEvaluableReasons).toEqual(['birth-time-unknown']);
    expect(evaluateSearch(search('or', [house, sunSign(0)]), unknownTime).outcome).toBe('matched');
    expect(evaluateSearch(search('or', [house, angle]), unknownTime).outcome).toBe('not-evaluable');
  });

  it('reports houses-undefined when the time is known but the cusps have no solution', () => {
    const broken: SearchSubject = {
      birthTimeKnown: true,
      chart: { ...chart, houses: { ...chart.houses, cusps: chart.houses.cusps.map(() => Number.NaN) } },
    };
    expect(evaluateCondition(house, broken).reason).toBe('houses-undefined');
  });
});

describe('condition cap', () => {
  it('exports the cap as 10', () => {
    expect(MAX_SEARCH_CONDITIONS).toBe(10);
  });

  it('accepts 10 conditions and rejects the 11th', () => {
    let current: ChartSearch = search('and', []);
    for (let i = 0; i < MAX_SEARCH_CONDITIONS; i++) {
      const added = addCondition(current, sunSign(0));
      if (!added.ok) throw new Error(`condition ${i + 1} was rejected`);
      current = added.search;
    }
    expect(current.conditions).toHaveLength(10);
    expect(addCondition(current, sunSign(0))).toEqual({ ok: false, reason: 'too-many-conditions' });
    expect(validateSearch(current)).toBeUndefined();
  });

  it('refuses to evaluate an over-cap or empty search', () => {
    const eleven = search(
      'or',
      Array.from({ length: 11 }, () => sunSign(0)),
    );
    expect(validateSearch(eleven)).toBe('too-many-conditions');
    expect(() => evaluateSearch(eleven, known)).toThrow(RangeError);
    expect(validateSearch(search('and', []))).toBe('no-conditions');
  });
});

describe('matched conditions per person', () => {
  it('reports exactly the conditions that matched for each person', () => {
    const matching = sunSign(0);
    const failing = sunSign(1);
    const list = search('or', [failing, matching]);
    const first = evaluateSearch(list, known);
    expect(first.outcome).toBe('matched');
    expect(first.matchedConditions).toEqual([matching]);

    const other: SearchSubject = {
      birthTimeKnown: true,
      chart: {
        ...chart,
        positions: chart.positions.map((p) => (p.body === SUN ? { ...p, longitude: (p.longitude + 30) % 360 } : p)),
      },
    };
    const second = evaluateSearch(list, other);
    expect(second.outcome).toBe('matched');
    expect(second.matchedConditions).toEqual([failing]);
  });
});
