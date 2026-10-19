/**
 * Unit tests for horary judgment (#552) — pure fixtures for `judgePerfection`/`significatorOf`,
 * plus one real-engine integration test for `judgeHorary` end to end.
 */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import type { Aspect } from '../src/astrology/aspects.js';
import {
  judgeHorary,
  judgePerfection,
  receptionAidsPerfection,
  significatorOf,
} from '../src/domain/horary-judgment.js';
import { computeChartData, type ChartData } from '../src/domain/chart-compute.js';
import { getEngine } from './engine-harness.js';

const SUN = bodyByKey('sun')?.id;
const MOON = bodyByKey('moon')?.id;
const MARS = bodyByKey('mars')?.id;
const VENUS = bodyByKey('venus')?.id;
const JUPITER = bodyByKey('jupiter')?.id;
const SATURN = bodyByKey('saturn')?.id;
if (
  SUN === undefined ||
  MOON === undefined ||
  MARS === undefined ||
  VENUS === undefined ||
  JUPITER === undefined ||
  SATURN === undefined
) {
  throw new Error('fixture bug: a classical planet is missing from BODIES');
}

function aspect(bodyA: number, bodyB: number, applying: boolean, orb = 1): Aspect {
  return {
    bodyA,
    bodyB,
    aspect: { key: 'trine', name: 'Trine', angle: 120, family: 'major' },
    separation: 120 + orb,
    orb,
    allowedOrb: 8,
    applying,
  };
}

describe('significatorOf (#552)', () => {
  it('is the ruler of the house cusp sign', () => {
    const cusps = [0, 10, 40, 70, 100, 130, 160, 190, 220, 250, 280, 310, 340];
    // House 1 cusp at 10° (Aries) — ruled by Mars.
    expect(significatorOf(1, cusps).ruler).toBe(MARS);
  });
});

describe('judgePerfection (#552)', () => {
  it('finds direct applying-aspect perfection first, outranking everything else', () => {
    const aspects = [aspect(SUN, MOON, true)];
    expect(judgePerfection(aspects, SUN, MOON)).toEqual({ kind: 'directAspect', aspect: aspects[0] });
  });

  it('does not perfect by a separating direct aspect', () => {
    const aspects = [aspect(SUN, MOON, false)];
    expect(judgePerfection(aspects, SUN, MOON).kind).not.toBe('directAspect');
  });

  it('finds translation of light: a third body separating from one significator, applying to the other', () => {
    const aspects = [
      aspect(MARS, SUN, false), // Mars separating from the querent (Sun)
      aspect(MARS, MOON, true), // Mars applying to the quesited (Moon) — carries the light
    ];
    const result = judgePerfection(aspects, SUN, MOON);
    expect(result.kind).toBe('translation');
    expect(result.thirdBody).toBe(MARS);
  });

  it('finds collection of light: a third body applying from both significators at once', () => {
    const aspects = [aspect(SATURN, SUN, true), aspect(SATURN, MOON, true)];
    const result = judgePerfection(aspects, SUN, MOON);
    expect(result.kind).toBe('collection');
    expect(result.thirdBody).toBe(SATURN);
  });

  it('finds prohibition: a third body applying to a significator with a tighter orb than the significators’ own aspect', () => {
    const aspects = [
      aspect(SUN, MOON, true, 5), // the "real" direction, 5° to go
      aspect(VENUS, SUN, true, 1), // Venus intervenes first — tighter orb
    ];
    const result = judgePerfection(aspects, SUN, MOON);
    expect(result.kind).toBe('prohibition');
    expect(result.thirdBody).toBe(VENUS);
  });

  it('is none when no classical planet connects the significators at all', () => {
    expect(judgePerfection([], SUN, MOON)).toEqual({ kind: 'none' });
  });

  it('prefers direct aspect over prohibition when the direct aspect itself has the tightest orb', () => {
    const aspects = [aspect(SUN, MOON, true, 1), aspect(VENUS, SUN, true, 5)];
    expect(judgePerfection(aspects, SUN, MOON).kind).toBe('directAspect');
  });

  it('uses relative motion, rather than orb alone, to identify the first perfection', () => {
    const aspects = [aspect(SUN, MOON, true, 5), aspect(VENUS, SUN, true, 1)];
    const positions = [
      {
        body: SUN,
        longitude: 0,
        latitude: 0,
        distance: 1,
        longitudeSpeed: 1,
        latitudeSpeed: 0,
        distanceSpeed: 0,
        retrograde: false,
      },
      {
        body: MOON,
        longitude: 125,
        latitude: 0,
        distance: 1,
        longitudeSpeed: 0.9,
        latitudeSpeed: 0,
        distanceSpeed: 0,
        retrograde: false,
      },
      {
        body: VENUS,
        longitude: 120,
        latitude: 0,
        distance: 1,
        longitudeSpeed: 0.99,
        latitudeSpeed: 0,
        distanceSpeed: 0,
        retrograde: false,
      },
    ];
    const result = judgePerfection(aspects, SUN, MOON, positions);
    expect(result.kind).toBe('directAspect');
    expect(result.timeToPerfectDays).toBeCloseTo(50);
  });

  it('reports frustration when a significator changes sign before perfection', () => {
    const aspects = [aspect(SUN, MOON, true, 5)];
    const result = judgePerfection(aspects, SUN, MOON, undefined, {
      signChangeDays: new Map([[SUN, 2]]),
    });
    expect(result.kind).toBe('frustration');
    expect(result.impedimentBody).toBe(SUN);
  });

  it('reports refranation when a significator stations before perfection', () => {
    const aspects = [aspect(SUN, MOON, true, 5)];
    const result = judgePerfection(aspects, SUN, MOON, undefined, {
      stationDays: new Map([[MOON, 2]]),
    });
    expect(result.kind).toBe('refranation');
    expect(result.impedimentBody).toBe(MOON);
  });
});

describe('reception-aided perfection (#552)', () => {
  const mutualReception = { kind: 'mutual' as const, aFromB: [], bFromA: [], sameDignityType: false };

  it('counts reception as testimony only when an applying perfection is already present', () => {
    expect(receptionAidsPerfection({ kind: 'directAspect' }, mutualReception)).toBe(true);
    expect(receptionAidsPerfection({ kind: 'translation', thirdBody: VENUS }, mutualReception)).toBe(true);
    expect(receptionAidsPerfection({ kind: 'prohibition', thirdBody: MARS }, mutualReception)).toBe(false);
    expect(
      receptionAidsPerfection(
        { kind: 'directAspect' },
        { kind: 'none', aFromB: [], bFromA: [], sameDignityType: false },
      ),
    ).toBe(false);
  });
});

describe('Lilly merchant-ship worked judgment (#552)', () => {
  it('models Lilly’s Cancer ascendant, applying Moon–Jupiter trine, and stated two-day timing', () => {
    // Lilly, *Christian Astrology* II (1647), pp. 162–64: the merchant’s ship is signified by
    // Cancer/Moon, and Lilly judges the Moon’s imminent trine to Jupiter to perfect that night or
    // in two days. His prose gives the conclusion rather than a modern speed table, so the
    // normalized relative-motion fixture below encodes only its published two-day interval.
    const cusps = [0, 101.55, 130, 160, 190, 220, 250, 280, 310, 340, 10, 40, 70];
    expect(significatorOf(1, cusps).ruler).toBe(MOON);
    const perfection = judgePerfection([aspect(MOON, JUPITER, true, 0.5)], MOON, JUPITER, [
      {
        body: MOON,
        longitude: 0,
        latitude: 0,
        distance: 1,
        longitudeSpeed: 0.5,
        latitudeSpeed: 0,
        distanceSpeed: 0,
        retrograde: false,
      },
      {
        body: JUPITER,
        longitude: 120.5,
        latitude: 0,
        distance: 1,
        longitudeSpeed: 0.25,
        latitudeSpeed: 0,
        distanceSpeed: 0,
        retrograde: false,
      },
    ]);
    expect(perfection.kind).toBe('directAspect');
    expect(perfection.timeToPerfectDays).toBeCloseTo(2);
  });
});

describe('judgeHorary end to end (#552)', () => {
  it('against the real engine: reports significators, perfection, reception, and radicality together', async () => {
    const engine = await getEngine();
    const data: ChartData = await computeChartData(
      {
        civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
        coordinates: { latitude: 38.7478, longitude: -85.0672 },
        offsetOverrideMinutes: -300,
      },
      engine,
    );
    const judgment = judgeHorary(data, 7, { isVoidOfCourse: false });
    expect(judgment.querent.house).toBe(1);
    expect(judgment.quesited.house).toBe(7);
    expect(judgment.querent.ruler).toBeTypeOf('number');
    expect(judgment.quesited.ruler).toBeTypeOf('number');
    expect(['none', 'directAspect', 'translation', 'collection', 'prohibition']).toContain(judgment.perfection.kind);
    expect(['none', 'oneWay', 'mutual']).toContain(judgment.reception.kind);
    expect(typeof judgment.radical).toBe('boolean');
    expect(judgment.considerations).toHaveLength(5);
  });

  it('threads the caller-supplied void-of-course flag through to radicality, since this module cannot compute it itself', async () => {
    const engine = await getEngine();
    const data: ChartData = await computeChartData(
      {
        civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
        coordinates: { latitude: 38.7478, longitude: -85.0672 },
        offsetOverrideMinutes: -300,
      },
      engine,
    );
    const notVoid = judgeHorary(data, 7, { isVoidOfCourse: false });
    const isVoid = judgeHorary(data, 7, { isVoidOfCourse: true });
    expect(notVoid.considerations.find((c) => c.key === 'moon-void-of-course')?.applies).toBe(false);
    expect(isVoid.considerations.find((c) => c.key === 'moon-void-of-course')?.applies).toBe(true);
  });
});
