/**
 * The placement search's warm-match budget (owner decision, 2026-11-12, #1405): a warm match over 50 stored people with
 * 10 conditions finishes within 100 ms. The charts are computed once (the cache); the match itself is timed.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import {
  evaluateSearch,
  type ChartSearch,
  type SearchCondition,
  type SearchSubject,
} from '../src/domain/chart-search.js';
import { buildSearchSubject } from '../src/domain/chart-search-timing.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
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

/** Nine sign conditions and one solar-arc aspect: the largest search the cap allows, with a solar-arc condition in it (#1486). */
const CONDITIONS: readonly SearchCondition[] = [
  ...BODIES.slice(0, 9).map((key, index): SearchCondition => ({
    kind: 'sign',
    body: bodyId(key),
    sign: SIGNS[index] ?? 0,
  })),
  {
    kind: 'aspect',
    scope: 'solarArc',
    body: bodyId('sun'),
    aspectKey: 'conjunction',
    target: { kind: 'body', body: bodyId('moon') },
  },
];

const SEARCH: ChartSearch = { operator: 'and', conditions: CONDITIONS };

let subjects: readonly SearchSubject[] = [];

beforeAll(async () => {
  const engine = await getEngine();
  const built: SearchSubject[] = [];
  for (let i = 0; i < PEOPLE; i += 1) {
    const moment: BirthMomentInput = {
      civil: { year: 1950 + i, month: 1 + (i % 12), day: 1 + (i % 27), hour: 6 + (i % 12), minute: 0, second: 0 },
      coordinates: { latitude: 38.7478, longitude: -85.0672 },
      offsetOverrideMinutes: -300,
    };
    // The solar-arc reference is computed here, once, like the natal chart; the timed match only reads it.
    const asOfJd = (await julianDayFor(engine, resolveMoment(moment))) + 12000;
    built.push(
      await buildSearchSubject(
        { natalMoment: moment, birthTimeKnown: true, settings: {}, asOfJd, scopes: ['solarArc'] },
        engine,
      ),
    );
  }
  subjects = built;
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
