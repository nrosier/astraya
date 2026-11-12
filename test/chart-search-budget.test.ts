/**
 * The placement search's warm-match budget (owner decision, 2026-11-12, #1405): a warm match over 50 stored people with
 * 10 conditions finishes within 100 ms. The charts are computed once (the cache); the match itself is timed.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { computeChartData, type ChartData } from '../src/domain/chart-compute.js';
import {
  evaluateSearch,
  type ChartSearch,
  type SearchCondition,
  type SearchSubject,
} from '../src/domain/chart-search.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

/** The warm-match ceiling for 50 people, in milliseconds (owner decision, 2026-11-12). */
const WARM_MATCH_BUDGET_MS = 100;
const PEOPLE = 50;

function bodyId(key: string): number {
  const definition = bodyByKey(key);
  if (definition === undefined) throw new Error(`no body ${key}`);
  return definition.id;
}

const BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'] as const;
const SIGNS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Ten sign conditions, one per body: the largest search the cap allows. */
const CONDITIONS: readonly SearchCondition[] = BODIES.map((key, index) => ({
  kind: 'sign',
  body: bodyId(key),
  sign: SIGNS[index] ?? 0,
}));

const SEARCH: ChartSearch = { operator: 'and', conditions: CONDITIONS };

let subjects: readonly SearchSubject[] = [];

beforeAll(async () => {
  const engine = await getEngine();
  const charts: ChartData[] = [];
  for (let i = 0; i < PEOPLE; i += 1) {
    const moment: BirthMomentInput = {
      civil: { year: 1950 + i, month: 1 + (i % 12), day: 1 + (i % 27), hour: 6 + (i % 12), minute: 0, second: 0 },
      coordinates: { latitude: 38.7478, longitude: -85.0672 },
      offsetOverrideMinutes: -300,
    };
    charts.push(await computeChartData(moment, engine));
  }
  subjects = charts.map((chart) => ({ chart, birthTimeKnown: true }));
});

describe('placement search warm-match budget (#1405)', () => {
  it(`matches ${String(PEOPLE)} stored people with 10 conditions within ${String(WARM_MATCH_BUDGET_MS)} ms (median of 5)`, () => {
    // One warm-up, so the timing does not include first-call costs.
    for (const subject of subjects) evaluateSearch(SEARCH, subject);
    const runs: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const started = performance.now();
      for (const subject of subjects) evaluateSearch(SEARCH, subject);
      runs.push(performance.now() - started);
    }
    runs.sort((a, b) => a - b);
    const median = runs[2] ?? Number.POSITIVE_INFINITY;
    expect(median).toBeLessThan(WARM_MATCH_BUDGET_MS);
  });
});
