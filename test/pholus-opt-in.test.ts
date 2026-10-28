/**
 * Pholus is an opt-in body (#804): absent from every default computation, present only when requested.
 * Real Swiss Ephemeris throughout (test/engine-harness.ts), never a mock.
 */
import { describe, expect, it } from 'vitest';
import { BODIES, OPT_IN_BODIES, bodiesFor, bodyById, bodyByKey, bodyIdsFor } from '../src/astrology/bodies.js';
import { DEFAULT_EXTENDED_SETTINGS, toChartCalculationOptions } from '../src/chart/extended-settings.js';
import { withInterpreted } from '../src/chart/object-policy.js';
import { computeChartData, type ChartCalculationOptions } from '../src/domain/chart-compute.js';
import { computeLunarReturns } from '../src/domain/lunar-returns.js';
import { computeSecondaryProgression } from '../src/domain/secondary-progression.js';
import { computeSolarReturn } from '../src/domain/solar-return.js';
import { computeSynastry } from '../src/domain/synastry.js';
import { computeTransit } from '../src/domain/transit.js';
import { SE } from '../src/ephemeris/generated-constants.js';
import { assembleReport } from '../src/interpretation/report.js';
import { bodyNamesMessages } from '../src/ui/astro-names.messages.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const A: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};
const B: BirthMomentInput = {
  civil: { year: 1988, month: 11, day: 2, hour: 3, minute: 15, second: 0 },
  coordinates: { latitude: 51.5072, longitude: -0.1276 },
  offsetOverrideMinutes: 0,
};

/** The 20 bodies of `BODIES` before #804, as SE ids in chart-listing order. */
const PRE_804_IDS = [
  SE.SE_SUN,
  SE.SE_MOON,
  SE.SE_MERCURY,
  SE.SE_VENUS,
  SE.SE_MARS,
  SE.SE_JUPITER,
  SE.SE_SATURN,
  SE.SE_URANUS,
  SE.SE_NEPTUNE,
  SE.SE_PLUTO,
  SE.SE_MEAN_NODE,
  SE.SE_TRUE_NODE,
  SE.SE_MEAN_APOG,
  SE.SE_OSCU_APOG,
  SE.SE_INTP_APOG,
  SE.SE_CHIRON,
  SE.SE_CERES,
  SE.SE_PALLAS,
  SE.SE_JUNO,
  SE.SE_VESTA,
];
const WIDE: ChartCalculationOptions = { aspectsTo: { pholus: true } };

describe('the Pholus body set (#804)', () => {
  it('leaves BODIES and the default body list exactly as they were', () => {
    expect(BODIES.map((body) => body.id)).toEqual(PRE_804_IDS);
    expect(bodyIdsFor()).toEqual(PRE_804_IDS);
    expect(bodyIdsFor({})).toEqual(PRE_804_IDS);
    expect(bodyIdsFor({ includePholus: false })).toEqual(PRE_804_IDS);
    expect(bodiesFor()).toBe(BODIES);
    expect(BODIES.some((body) => body.key === 'pholus')).toBe(false);
  });

  it('adds Pholus after Chiron only when requested', () => {
    const ids = bodyIdsFor({ includePholus: true });
    expect(ids).toHaveLength(PRE_804_IDS.length + 1);
    expect(ids.indexOf(SE.SE_PHOLUS)).toBe(ids.indexOf(SE.SE_CHIRON) + 1);
    expect(ids.filter((id) => id !== SE.SE_PHOLUS)).toEqual(PRE_804_IDS);
    expect(OPT_IN_BODIES.map((body) => body.key)).toEqual(['pholus']);
    expect(bodyByKey('pholus')?.id).toBe(SE.SE_PHOLUS);
    expect(bodyById(SE.SE_PHOLUS)?.category).toBe('centaur');
  });

  it('turns on only when the settings give Pholus visibility or aspect participation', () => {
    expect(toChartCalculationOptions(DEFAULT_EXTENDED_SETTINGS).includePholus).toBeUndefined();
    const policies = DEFAULT_EXTENDED_SETTINGS.objectPolicies;
    const visible = {
      ...DEFAULT_EXTENDED_SETTINGS,
      objectPolicies: { ...policies, pholus: { visible: true, aspectParticipant: false } },
    };
    const participant = {
      ...DEFAULT_EXTENDED_SETTINGS,
      objectPolicies: { ...policies, pholus: { visible: false, aspectParticipant: true } },
    };
    expect(toChartCalculationOptions(visible).includePholus).toBe(true);
    expect(toChartCalculationOptions(participant).includePholus).toBe(true);
    expect(withInterpreted(policies.pholus, true)).toEqual({ visible: false, aspectParticipant: false });
  });

  it('names Pholus in both locales', () => {
    expect(bodyNamesMessages.en.pholus).toBe('Pholus');
    expect(bodyNamesMessages.nl.pholus).toBe('Pholus');
    expect(Object.keys(bodyNamesMessages.nl).sort()).toEqual(Object.keys(bodyNamesMessages.en).sort());
  });
});

describe('default results are unchanged when Pholus is not requested (#804, real engine)', () => {
  it('natal, transit, synastry, returns, progression and report carry no Pholus and ignore an explicit false', async () => {
    const engine = await getEngine();
    const targetJd = (await julianDayFor(engine, resolveMoment(A))) + 9000;

    const natal = await computeChartData(A, engine);
    const natalOff = await computeChartData(A, engine, { includePholus: false });
    expect(natal.positions.map((p) => p.body).sort()).toEqual(
      [...PRE_804_IDS]
        .filter((id) => id !== SE.SE_TRUE_NODE && id !== SE.SE_OSCU_APOG && id !== SE.SE_INTP_APOG)
        .sort(),
    );
    expect(natalOff).toEqual(natal);

    // Even with Pholus given aspect participation, an un-requested Pholus is never computed, so no contact appears.
    const transit = await computeTransit(A, targetJd, engine, WIDE);
    expect(transit).toEqual(await computeTransit(A, targetJd, engine));
    const contactBodies = (contacts: readonly { bodyA: number; bodyB: number }[]): number[] =>
      contacts.flatMap((c) => [c.bodyA, c.bodyB]);
    expect(contactBodies(transit.contacts)).not.toContain(SE.SE_PHOLUS);

    const synastry = await computeSynastry(A, B, engine, WIDE);
    expect(synastry).toEqual(await computeSynastry(A, B, engine));
    expect(contactBodies(synastry.aspects)).not.toContain(SE.SE_PHOLUS);

    for (const result of [
      await computeSolarReturn(A, 2015, engine, { includePholus: false }),
      await computeSecondaryProgression(A, targetJd, engine, { includePholus: false }),
      await computeLunarReturns(A, targetJd, targetJd + 30, engine, { includePholus: false }),
    ]) {
      expect(JSON.stringify(result)).not.toContain(`"body":${String(SE.SE_PHOLUS)},`);
    }
    expect(await computeSolarReturn(A, 2015, engine)).toEqual(
      await computeSolarReturn(A, 2015, engine, { includePholus: false }),
    );

    expect(assembleReport(natalOff, 'en', [])).toEqual(assembleReport(natal, 'en', []));
    expect(JSON.stringify(assembleReport(natal, 'en', []))).not.toContain('Pholus');
  });
});

describe('Pholus when requested (#804, real engine)', () => {
  it('is computed in the chart, the transit, the synastry and a solar return', async () => {
    const engine = await getEngine();
    const targetJd = (await julianDayFor(engine, resolveMoment(A))) + 9000;
    const chart = await computeChartData(A, engine, { includePholus: true });
    expect(chart.positions.some((p) => p.body === SE.SE_PHOLUS)).toBe(true);
    const transit = await computeTransit(A, targetJd, engine, { includePholus: true, aspectsTo: { pholus: true } });
    expect(transit.transit.positions.some((p) => p.body === SE.SE_PHOLUS)).toBe(true);
    const synastry = await computeSynastry(A, B, engine, { includePholus: true, aspectsTo: { pholus: true } });
    expect(synastry.chartA.positions.some((p) => p.body === SE.SE_PHOLUS)).toBe(true);
    const solar = await computeSolarReturn(A, 2015, engine, { includePholus: true });
    expect(solar.positions.some((p) => p.body === SE.SE_PHOLUS)).toBe(true);
  });

  it('has a finite longitude at both ends of the shipped range and refuses outside it', async () => {
    const engine = await getEngine();
    for (const [y, m, d] of [
      [1800, 1, 2],
      [2399, 12, 30],
    ] as const) {
      const jd = await engine.julianDay(y, m, d, 12);
      const position = await engine.position(jd, SE.SE_PHOLUS);
      expect(Number.isFinite(position.longitude), String(y)).toBe(true);
      expect(position.longitude).toBeGreaterThanOrEqual(0);
      expect(position.longitude).toBeLessThan(360);
    }
    for (const [y, m, d] of [
      [1799, 12, 30],
      [2400, 1, 2],
    ] as const) {
      const jd = await engine.julianDay(y, m, d, 12);
      await expect(engine.position(jd, SE.SE_PHOLUS)).rejects.toThrow(/outside the shipped ephemeris range/);
    }
  });
});
