/**
 * `src/interpretation/tier2-contract.ts` (#588): the shared Tier 2 wire shapes and validators.
 * Includes the round trip that is the actual point of the issue — what the client builds
 * (`toTier2ChartPayload`/`toTier2RelationshipPayload`) must pass what the server validates —
 * so the two sides can no longer drift apart without a test failing.
 */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import type { ChartData } from '../src/domain/chart-compute.js';
import type { SynastryData } from '../src/domain/synastry.js';
import type { BodyId, HousePositions } from '../src/ephemeris/types.js';
import { toTier2ChartPayload, toTier2RelationshipPayload } from '../src/interpretation/tier2-client.js';
import {
  isTier2Section,
  validateAspectList,
  validateChartData,
  validateHouseOverlays,
  validatePositionsAndHouses,
  validateRelationshipData,
} from '../src/interpretation/tier2-contract.js';

function idOf(key: string): BodyId {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`test fixture bug: no body keyed "${key}"`);
  return body.id;
}

const SUN = idOf('sun');
const MOON = idOf('moon');

const HOUSES: HousePositions = {
  cusps: [0, 10, 40, 70, 100, 130, 160, 190, 220, 250, 280, 310, 340],
  ascendant: 10,
  midheaven: 280,
  armc: 278,
  vertex: 200,
  equatorialAscendant: 12,
  coAscendantKoch: 14,
  coAscendantMunkasey: 16,
  polarAscendant: 18,
  system: 'P',
};

const CHART: ChartData = {
  positions: [
    {
      body: SUN,
      longitude: 14,
      latitude: 0,
      distance: 1,
      longitudeSpeed: 1,
      latitudeSpeed: 0,
      distanceSpeed: 0,
      retrograde: false,
    },
    {
      body: MOON,
      longitude: 100,
      latitude: 0,
      distance: 1,
      longitudeSpeed: -0.5,
      latitudeSpeed: 0,
      distanceSpeed: 0,
      retrograde: true,
    },
  ],
  houses: HOUSES,
  aspects: [
    {
      bodyA: SUN,
      bodyB: MOON,
      aspect: { key: 'trine', name: 'Trine', angle: 120, family: 'major' },
      separation: 119,
      orb: 1,
      applying: false,
    },
  ],
  dignities: new Map(),
  sect: 'day',
  partOfFortune: 0,
  partOfSpirit: 0,
};

const SYNASTRY = {
  chartA: CHART,
  chartB: CHART,
  aspects: CHART.aspects,
} as unknown as SynastryData;

describe('what the client builds passes what the server validates (#588)', () => {
  it('toTier2ChartPayload output is accepted by validateChartData, unchanged', () => {
    const payload = toTier2ChartPayload(CHART);
    const result = validateChartData(payload);
    expect(result).toEqual({ chartData: payload });
  });

  it('toTier2RelationshipPayload output is accepted by validateRelationshipData, unchanged', () => {
    const payload = toTier2RelationshipPayload(SYNASTRY, [{ bodyKey: 'sun', house: 3, direction: 'a-in-b' }]);
    const result = validateRelationshipData(payload);
    expect(result).toEqual({ relationshipData: payload });
  });

  it('a house overlay for a body the client cannot resolve is caught by the validator, not passed through', () => {
    const payload = toTier2RelationshipPayload(SYNASTRY, [{ bodyKey: 'not-a-body', house: 3, direction: 'a-in-b' }]);
    expect('errors' in validateRelationshipData(payload)).toBe(true);
  });
});

describe('validatePositionsAndHouses', () => {
  const good = {
    positions: [{ body: SUN, longitude: 14 }],
    houses: { cusps: HOUSES.cusps, ascendant: 10, midheaven: 280 },
  };

  it('accepts a well-formed payload', () => {
    expect(validatePositionsAndHouses(good, 'x')).toEqual({ value: good });
  });

  it('does not hold the unused cusps[0] placeholder to the [0, 360) rule', () => {
    const cusps = [-1, ...HOUSES.cusps.slice(1)];
    expect('errors' in validatePositionsAndHouses({ ...good, houses: { ...good.houses, cusps } }, 'x')).toBe(false);
  });

  it('rejects an unknown body id, an out-of-range longitude, a short cusp list and a non-object, naming the label', () => {
    const result = validatePositionsAndHouses(
      { positions: [{ body: 99999, longitude: 360 }], houses: { cusps: [1, 2], ascendant: 10, midheaven: 280 } },
      'chartData',
    );
    expect('errors' in result && result.errors).toEqual([
      'chartData.positions[0].body must be a known body id',
      'chartData.positions[0].longitude must be a number in [0, 360)',
      'chartData.houses.cusps must be an array of exactly 13 entries',
    ]);
    expect(validatePositionsAndHouses(null, 'chartData')).toEqual({ errors: ['chartData must be an object'] });
  });

  it('rejects an empty or oversized positions list', () => {
    expect('errors' in validatePositionsAndHouses({ ...good, positions: [] }, 'x')).toBe(true);
    const many = Array.from({ length: 41 }, () => ({ body: SUN, longitude: 1 }));
    expect('errors' in validatePositionsAndHouses({ ...good, positions: many }, 'x')).toBe(true);
  });
});

describe('validateAspectList', () => {
  const aspect = { bodyA: SUN, bodyB: MOON, aspectKey: 'trine', separation: 119, orb: 1 };

  it('accepts a well-formed list, including a separation of exactly 180', () => {
    expect(validateAspectList([aspect, { ...aspect, separation: 180 }], 'a')).toEqual({
      value: [aspect, { ...aspect, separation: 180 }],
    });
  });

  it('rejects an unknown aspect key, a separation above 180 and a negative orb', () => {
    expect('errors' in validateAspectList([{ ...aspect, aspectKey: 'nonsense' }], 'a')).toBe(true);
    expect('errors' in validateAspectList([{ ...aspect, separation: 181 }], 'a')).toBe(true);
    expect('errors' in validateAspectList([{ ...aspect, orb: -1 }], 'a')).toBe(true);
  });

  it('rejects a non-array and an oversized list', () => {
    expect(validateAspectList({}, 'a')).toEqual({ errors: ['a must be an array'] });
    expect(
      'errors' in
        validateAspectList(
          Array.from({ length: 201 }, () => aspect),
          'a',
        ),
    ).toBe(true);
  });
});

describe('validateHouseOverlays', () => {
  it('accepts both directions and rejects a bad house, direction or body', () => {
    const overlay = { body: SUN, house: 12, direction: 'b-in-a' };
    expect(validateHouseOverlays([overlay])).toEqual({ value: [overlay] });
    expect('errors' in validateHouseOverlays([{ ...overlay, house: 13 }])).toBe(true);
    expect('errors' in validateHouseOverlays([{ ...overlay, house: 1.5 }])).toBe(true);
    expect('errors' in validateHouseOverlays([{ ...overlay, direction: 'sideways' }])).toBe(true);
    expect('errors' in validateHouseOverlays([{ ...overlay, body: 99999 }])).toBe(true);
  });
});

describe('isTier2Section', () => {
  it('accepts exactly a heading and a body, both strings', () => {
    expect(isTier2Section({ heading: 'H', body: 'B' })).toBe(true);
    expect(isTier2Section({ heading: 'H' })).toBe(false);
    expect(isTier2Section({ heading: 1, body: 'B' })).toBe(false);
    expect(isTier2Section(null)).toBe(false);
    expect(isTier2Section('H')).toBe(false);
  });
});
