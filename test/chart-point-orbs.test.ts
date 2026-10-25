/**
 * Point aspects (Ascendant, MC, Vertex, Part of Fortune, Part of Spirit) under a body-moiety orb
 * profile (#796), against the real Swiss Ephemeris engine, never a mock.
 *
 * Lilly, Christian Astrology (1647), Book II p. 208 sources the rule for the Ascendant: a body's
 * contact to the degree ascending is "within the moyity of his owne Orbs". Using it for the MC,
 * Vertex and the two lots is an Astraya extension, which these tests pin as that convention.
 *
 * Chart: 1 Jan 1970 00:00, Antwerp OH (nocturnal, so Fortune skips the Sun and Spirit the Moon).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_ORB_CONFIG, type OrbConfig } from '../src/astrology/aspects.js';
import { bodyByKey } from '../src/astrology/bodies.js';
import { citedPresetSettings } from '../src/astrology/orb-profiles.js';
import { computeChartData, type AngleAspect, type AspectAngle } from '../src/domain/chart-compute.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const MOMENT: BirthMomentInput = {
  civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
  coordinates: { latitude: 41.1833, longitude: -84.7333 },
  zoneOverride: 'America/New_York',
};

const ASPECTS_TO = { vertex: true, partOfFortune: true, partOfSpirit: true } as const;
const LILLY: OrbConfig = { ...DEFAULT_ORB_CONFIG, bodyOrbs: citedPresetSettings('lilly-1647-first-v1').bodyOrbs };

async function pointAspects(orbConfig: OrbConfig): Promise<readonly AngleAspect[]> {
  const data = await computeChartData(MOMENT, await getEngine(), { orbConfig, aspectsTo: ASPECTS_TO });
  return data.angleAspects ?? [];
}

function find(list: readonly AngleAspect[], angle: AspectAngle, bodyKey: string): AngleAspect | undefined {
  const id = bodyByKey(bodyKey)?.id;
  return list.find((a) => a.angle === angle && a.body === id);
}

describe('point aspects under a body-moiety profile (#796)', () => {
  it.each([
    ['asc', 'sun', 'square', 9.813],
    ['mc', 'sun', 'opposition', 9.724],
    ['vertex', 'sun', 'square', 8.85],
  ] as const)(
    '%s-%s %s (orb %s) is admitted by the tier but dropped by the Sun moiety of 8.5',
    async (angle, body, aspect, orb) => {
      const tier = find(await pointAspects(DEFAULT_ORB_CONFIG), angle, body);
      expect(tier?.aspect.key).toBe(aspect);
      expect(tier?.orb).toBeCloseTo(orb, 2);
      expect(tier?.allowedOrb).toBe(10);
      expect(tier?.orbRule).toBe('tier');
      expect(tier?.pointConvention).toBe('tier');
      expect(find(await pointAspects(LILLY), angle, body)).toBeUndefined();
    },
  );

  it('Fortune-Jupiter sextile (orb 4.751) is admitted by Jupiter moiety 6, absent under the tier of 4', async () => {
    expect(find(await pointAspects(DEFAULT_ORB_CONFIG), 'partOfFortune', 'jupiter')).toBeUndefined();
    const found = find(await pointAspects(LILLY), 'partOfFortune', 'jupiter');
    expect(found?.aspect.key).toBe('sextile');
    expect(found?.orb).toBeCloseTo(4.751, 2);
    expect(found?.allowedOrb).toBe(6);
    expect(found?.orbRule).toBe('body-moiety');
    expect(found?.pointConvention).toBe('body-moiety-extended');
  });

  it('Fortune-Pluto square (orb 0.211) has no moiety, so it falls back to the tier of 7 and says so', async () => {
    const found = find(await pointAspects(LILLY), 'partOfFortune', 'pluto');
    expect(found?.aspect.key).toBe('square');
    expect(found?.orb).toBeCloseTo(0.211, 2);
    expect(found?.allowedOrb).toBe(7);
    expect(found?.orbRule).toBe('tier-fallback');
    expect(found?.pointConvention).toBe('body-moiety-extended');
  });

  it('Spirit-Sun opposition (orb 6.861) is admitted by the moiety of 8.5 and by the tier of 10', async () => {
    const moiety = find(await pointAspects(LILLY), 'partOfSpirit', 'sun');
    expect(moiety?.aspect.key).toBe('opposition');
    expect(moiety?.orb).toBeCloseTo(6.861, 2);
    expect(moiety?.allowedOrb).toBe(8.5);
    expect(moiety?.orbRule).toBe('body-moiety');
    const tier = find(await pointAspects(DEFAULT_ORB_CONFIG), 'partOfSpirit', 'sun');
    expect(tier?.allowedOrb).toBe(10);
  });

  it('every point aspect records the rule that admitted it, never an unlabelled fallback', async () => {
    for (const aspect of await pointAspects(LILLY)) {
      expect(['body-moiety', 'tier-fallback']).toContain(aspect.orbRule);
      expect(aspect.pointConvention).toBe('body-moiety-extended');
    }
  });

  it('scales the body moiety with the orb scale', async () => {
    const wide = find(await pointAspects({ ...LILLY, scalePercent: 50 }), 'asc', 'sun');
    expect(wide?.allowedOrb).toBe(12.75);
    expect(wide?.orbRule).toBe('body-moiety');
  });
});
