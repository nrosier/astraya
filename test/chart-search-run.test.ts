/**
 * Tests for the chart-search run core (#1405): every live person comes back, in people-list order, each either
 * evaluated or not evaluable with a stated reason; a second run that changes only the conditions reuses every
 * computed subject. Real Swiss Ephemeris through the shared harness; the provider is only wrapped to count calls.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RULERSHIP_CHOICE } from '../src/astrology/rulership.js';
import { bodyByKey } from '../src/astrology/bodies.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import type { ChartSearch } from '../src/domain/chart-search.js';
import { buildPerson, serializeCalculationSettings, type Person } from '../src/domain/person.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { createSubjectCache, runChartSearch, type ChartSearchRunInput } from '../src/ui/chart-search-run.js';
import { ordered } from '../src/ui/people-list.js';
import { getEngine } from './engine-harness.js';

const CIVIL = { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 };
const COORDINATES = { latitude: 38.7478, longitude: -85.0672 };

function bodyId(key: string): number {
  const definition = bodyByKey(key);
  if (definition === undefined) throw new Error(`no body ${key}`);
  return definition.id;
}

const SUN = bodyId('sun');
const MOON = bodyId('moon');

/** A person built through the same reader the fold uses, so registers are read exactly as in the app. */
function person(id: string, name: string, fields: Record<string, unknown> = {}): Person {
  return buildPerson(
    id,
    new Map<string, unknown>(
      Object.entries({
        displayName: name,
        civil: CIVIL,
        coordinates: COORDINATES,
        offsetOverrideMinutes: -300,
        timeAccuracy: 'recorded',
        ...fields,
      }),
    ),
  );
}

/** Counts every provider call while passing it to the real engine. */
function counting(engine: EphemerisProvider): { provider: EphemerisProvider; calls: () => number } {
  let count = 0;
  const provider = new Proxy(engine, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]): unknown => {
        count += 1;
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { provider, calls: () => count };
}

const SUN_IN_HOUSE: ChartSearch = {
  operator: 'and',
  conditions: [{ kind: 'house', body: SUN, house: 9 }],
};

const DEFAULTS = { settings: DEFAULT_EXTENDED_SETTINGS, rulership: DEFAULT_RULERSHIP_CHOICE };

let engine: EphemerisProvider;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

describe('runChartSearch', () => {
  const people = new Map<string, Person>(
    [
      person('p-grace', 'Grace'),
      person('p-unknown', 'Ada', { timeAccuracy: 'unknown' }),
      person('p-unreadable', 'Barbara', {
        calculationSettings: { version: 999, settings: { houseSystem: 'nope' } },
      }),
      person('p-incomplete', 'Dorothy', { coordinates: undefined }),
      person('p-own', 'Edith', {
        calculationSettings: serializeCalculationSettings({ ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'W' }),
      }),
      person('p-unnamed', ''),
    ].map((p) => [p.id, p]),
  );

  function input(search: ChartSearch): ChartSearchRunInput {
    return { search, people, asOf: '2026-11-12', defaults: DEFAULTS };
  }

  it('returns every person in people-list order', async () => {
    const results = await runChartSearch(input(SUN_IN_HOUSE), engine, createSubjectCache());
    expect(results.map((r) => r.personId)).toEqual(ordered(people).map((p) => p.id));
    expect(results).toHaveLength(people.size);
    // A person with readable settings of their own is evaluated with them.
    expect(results.find((r) => r.personId === 'p-own')?.kind).toBe('evaluated');
  }, 60_000);

  it('reports an unknown birth time as not evaluable with its reason, not as a non-match', async () => {
    const results = await runChartSearch(input(SUN_IN_HOUSE), engine, createSubjectCache());
    const ada = results.find((r) => r.personId === 'p-unknown');
    expect(ada?.kind).toBe('evaluated');
    if (ada?.kind !== 'evaluated') throw new Error('Ada was not evaluated');
    expect(ada.result.outcome).toBe('not-evaluable');
    expect(ada.result.notEvaluableReasons).toEqual(['birth-time-unknown']);
  }, 60_000);

  it('keeps an unreadable-settings person and an incomplete record, each with a reason', async () => {
    const results = await runChartSearch(input(SUN_IN_HOUSE), engine, createSubjectCache());
    expect(results.find((r) => r.personId === 'p-unreadable')).toEqual({
      kind: 'not-evaluable',
      personId: 'p-unreadable',
      displayName: 'Barbara',
      reason: 'settings-unreadable',
    });
    expect(results.find((r) => r.personId === 'p-incomplete')).toEqual({
      kind: 'not-evaluable',
      personId: 'p-incomplete',
      displayName: 'Dorothy',
      reason: 'birth-data-incomplete',
    });
  }, 60_000);

  it('makes no provider call on a second run that changes only the conditions', async () => {
    const { provider, calls } = counting(engine);
    const cache = createSubjectCache();
    await runChartSearch(input(SUN_IN_HOUSE), provider, cache);
    const afterFirst = calls();
    expect(afterFirst).toBeGreaterThan(0);

    const changed: ChartSearch = {
      operator: 'or',
      conditions: [
        { kind: 'sign', body: MOON, sign: 3 },
        { kind: 'aspect', body: SUN, aspectKey: 'trine', target: { kind: 'angle', angle: 'mc' } },
      ],
    };
    const second = await runChartSearch(input(changed), provider, cache);
    expect(calls()).toBe(afterFirst);
    expect(second).toHaveLength(people.size);
  }, 60_000);

  it('recomputes when the scope set changes', async () => {
    const { provider, calls } = counting(engine);
    const cache = createSubjectCache();
    await runChartSearch(input(SUN_IN_HOUSE), provider, cache);
    const afterFirst = calls();
    const transit: ChartSearch = {
      operator: 'and',
      conditions: [{ kind: 'sign', body: SUN, sign: 7, scope: 'transit' }],
    };
    await runChartSearch(input(transit), provider, cache);
    expect(calls()).toBeGreaterThan(afterFirst);
  }, 60_000);
});
