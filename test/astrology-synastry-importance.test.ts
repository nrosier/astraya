/**
 * Which synastry contacts matter most (#422, Phase 2a). Scores are worked out by hand from the stated
 * weights; the real-chart checks assert that ranking only reorders (it never adds or drops a contact).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { ASPECTS, DEFAULT_ORB_CONFIG, type Aspect } from '../src/astrology/aspects.js';
import { bodyByKey } from '../src/astrology/bodies.js';
import {
  bodyWeight,
  rankSynastryAspects,
  synastryAspectWeight,
  synastryImportance,
} from '../src/astrology/synastry-importance.js';
import { computeSynastry, rankedSynastryAspects, type SynastryData } from '../src/domain/synastry.js';
import { getEngine } from './engine-harness.js';

function contact(bodyA: string, bodyB: string, aspectKey: string, orb: number): Aspect {
  const aspect = ASPECTS.find((candidate) => candidate.key === aspectKey);
  const a = bodyByKey(bodyA);
  const b = bodyByKey(bodyB);
  if (aspect === undefined || a === undefined || b === undefined) throw new Error('fixture bug');
  return { bodyA: a.id, bodyB: b.id, aspect, separation: aspect.angle + orb, orb, applying: true };
}

const weightOf = (key: string): number => {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`fixture bug: ${key}`);
  return bodyWeight(key, body.category);
};

describe('the weights (#422)', () => {
  it('counts the luminaries most, then the personal, social and outer planets, then the minor points', () => {
    expect([weightOf('sun'), weightOf('moon')]).toEqual([1, 1]);
    expect(['mercury', 'venus', 'mars'].map(weightOf)).toEqual([0.8, 0.8, 0.8]);
    expect(['jupiter', 'saturn'].map(weightOf)).toEqual([0.6, 0.6]);
    expect(['uranus', 'neptune', 'pluto'].map(weightOf)).toEqual([0.45, 0.45, 0.45]);
    for (const key of ['chiron', 'meanNode', 'trueNode', 'meanLilith', 'ceres', 'pallas', 'juno', 'vesta']) {
      expect(weightOf(key), key).toBe(0.3);
    }
  });

  it('counts hard aspects most, easy ones less and the minor aspects least', () => {
    for (const key of ['conjunction', 'square', 'opposition']) expect(synastryAspectWeight(key)).toBe(1);
    for (const key of ['sextile', 'trine']) expect(synastryAspectWeight(key)).toBe(0.7);
    for (const key of ['semisquare', 'sesquiquadrate', 'quincunx', 'quintile', 'biquintile', 'semisextile']) {
      expect(synastryAspectWeight(key), key).toBe(0.4);
    }
  });
});

describe('synastryImportance (#422)', () => {
  it('is 1 for an exact hard aspect between the luminaries', () => {
    expect(synastryImportance(contact('sun', 'moon', 'conjunction', 0))).toBeCloseTo(1, 10);
    expect(synastryImportance(contact('moon', 'sun', 'opposition', 0))).toBeCloseTo(1, 10);
  });

  it('multiplies the two bodies’ weights and the aspect’s: an exact Venus trine Mars is 0.8 × 0.8 × 0.7', () => {
    expect(synastryImportance(contact('venus', 'mars', 'trine', 0))).toBeCloseTo(0.448, 10);
    // An exact Pluto square Ceres is 0.45 × 0.3.
    expect(synastryImportance(contact('pluto', 'ceres', 'square', 0))).toBeCloseTo(0.135, 10);
  });

  it('shrinks with the orb against the limit for that pair: half the limit halves it, the limit is nothing', () => {
    // A major aspect with a luminary may be 10° wide (7° base plus a 3° bonus).
    expect(synastryImportance(contact('sun', 'moon', 'conjunction', 5))).toBeCloseTo(0.5, 10);
    expect(synastryImportance(contact('sun', 'moon', 'conjunction', 10))).toBe(0);
    // Without a luminary the limit is 7°.
    expect(synastryImportance(contact('venus', 'mars', 'square', 3.5))).toBeCloseTo(0.8 * 0.8 * 0.5, 10);
    expect(synastryImportance(contact('venus', 'mars', 'square', 7))).toBe(0);
  });

  it('measures the orb against the configuration the contact was found with', () => {
    const tight = { ...DEFAULT_ORB_CONFIG, scalePercent: -50 };
    // The luminary limit halves to 5°, so 2.5° is half of it.
    expect(synastryImportance(contact('sun', 'moon', 'conjunction', 2.5), tight)).toBeCloseTo(0.5, 10);
    expect(synastryImportance(contact('sun', 'moon', 'conjunction', 2.5))).toBeCloseTo(0.75, 10);
  });

  it('can rank a tight contact between personal planets above a wide one between the luminaries', () => {
    const wideLuminaries = synastryImportance(contact('sun', 'moon', 'conjunction', 5));
    const tightPersonal = synastryImportance(contact('venus', 'mars', 'conjunction', 0));
    expect(tightPersonal).toBeGreaterThan(wideLuminaries);
  });

  it('is never outside 0 to 1', () => {
    for (const aspect of ASPECTS) {
      for (const [a, b] of [
        ['sun', 'moon'],
        ['venus', 'mars'],
        ['pluto', 'ceres'],
        ['saturn', 'jupiter'],
      ] as const) {
        for (const orb of [0, 0.5, 2, 6, 9.9]) {
          const score = synastryImportance(contact(a, b, aspect.key, orb));
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('is 0 for a body it does not know', () => {
    expect(synastryImportance({ ...contact('sun', 'moon', 'conjunction', 0), bodyA: -999 })).toBe(0);
  });
});

describe('rankSynastryAspects (#422)', () => {
  it('orders the contacts most important first and keeps input order among equals', () => {
    const first = contact('pluto', 'ceres', 'square', 1);
    const second = contact('sun', 'moon', 'conjunction', 1);
    const third = contact('venus', 'mars', 'trine', 2);
    const tieA = contact('chiron', 'vesta', 'trine', 99); // outside any orb: 0
    const tieB = contact('juno', 'pallas', 'trine', 99);
    const ranked = rankSynastryAspects([tieA, first, third, tieB, second]).map((r) => r.aspect);
    expect(ranked).toEqual([second, third, first, tieA, tieB]);
  });

  it('adds and drops nothing, and gives each contact its own score', () => {
    const aspects = [contact('sun', 'moon', 'square', 0), contact('mars', 'saturn', 'sextile', 3)];
    const ranked = rankSynastryAspects(aspects);
    expect(ranked.map((r) => r.aspect).sort()).toEqual([...aspects].sort());
    for (const { aspect, importance } of ranked) expect(importance).toBe(synastryImportance(aspect));
  });
});

describe('a real synastry (#422)', () => {
  let data: SynastryData;

  beforeAll(async () => {
    const engine = await getEngine();
    data = await computeSynastry(
      {
        civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
        coordinates: { latitude: 41.1833, longitude: -84.7333 },
        zoneOverride: 'America/New_York',
      },
      {
        civil: { year: 1985, month: 7, day: 23, hour: 12, minute: 0, second: 0 },
        coordinates: { latitude: 51.5072, longitude: -0.1276 },
        zoneOverride: 'Europe/London',
      },
      engine,
    );
  }, 60_000);

  it('keeps the orbs it was found with, defaulting to the standard ones', () => {
    expect(data.orbConfig).toEqual(DEFAULT_ORB_CONFIG);
  });

  it('ranks exactly the contacts found, best first, each score in range and in order', () => {
    const ranked = rankedSynastryAspects(data);
    expect(data.aspects.length).toBeGreaterThan(10);
    expect(ranked).toHaveLength(data.aspects.length);
    expect(new Set(ranked.map((r) => r.aspect))).toEqual(new Set(data.aspects));
    const scores = ranked.map((r) => r.importance);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores.every((score) => score >= 0 && score <= 1)).toBe(true);
    // Not vacuous: the scores really differ across the list.
    expect(scores[0]).toBeGreaterThan(scores.at(-1) ?? 0);
  });

  it('puts a tighter orb first when two contacts are otherwise the same kind', () => {
    const ranked = rankedSynastryAspects(data);
    for (let index = 0; index + 1 < ranked.length; index++) {
      const a = ranked[index];
      const b = ranked[index + 1];
      if (a === undefined || b === undefined) continue;
      const sameKind =
        a.aspect.bodyA === b.aspect.bodyA &&
        a.aspect.bodyB === b.aspect.bodyB &&
        a.aspect.aspect.key === b.aspect.aspect.key;
      if (sameKind) expect(a.aspect.orb).toBeLessThanOrEqual(b.aspect.orb);
    }
  });
});
