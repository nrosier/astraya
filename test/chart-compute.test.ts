/**
 * Integration tests for computeChartData (#44).
 *
 * Runs against the real Swiss Ephemeris engine, never a mock: the whole point of this
 * function is to wire together time resolution, the ephemeris and the astrology layer
 * correctly, and a mocked provider would only prove the wiring around a fake.
 */
import { describe, expect, it } from 'vitest';
import { angularSeparation, DEFAULT_ORB_CONFIG } from '../src/astrology/aspects.js';
import { bodyById, bodyByKey } from '../src/astrology/bodies.js';
import {
  computeChartData,
  computeChartDataAtJd,
  housesAreDefined,
  NATAL_FIXED_STARS,
} from '../src/domain/chart-compute.js';
import { finiteDifferenceRate } from '../src/ephemeris/finite-difference.js';
import type { HousePositions } from '../src/ephemeris/types.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const MOMENT: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

describe('computeChartData (#44)', () => {
  it('computes a full chart from a birth moment', async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine);

    expect(data.positions.length).toBeGreaterThan(0);
    expect(data.houses.cusps).toHaveLength(13);
    expect(data.houses.ascendant).toBeGreaterThanOrEqual(0);
    expect(data.houses.ascendant).toBeLessThan(360);
    expect(data.dignities.size).toBe(data.positions.length);
    expect(data.partOfFortune).toBeGreaterThanOrEqual(0);
    expect(data.partOfFortune).toBeLessThan(360);
    expect(data.partOfSpirit).toBeGreaterThanOrEqual(0);
    expect(data.partOfSpirit).toBeLessThan(360);
  });

  it('includes every body chart-tables.ts knows how to look up', async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine);
    const sun = bodyByKey('sun');
    const moon = bodyByKey('moon');
    expect(sun).toBeDefined();
    expect(moon).toBeDefined();
    expect(data.positions.some((position) => position.body === sun?.id)).toBe(true);
    expect(data.positions.some((position) => position.body === moon?.id)).toBe(true);
  });

  it('computes a plausible obliquity and declination per body (#398)', async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine);
    // True obliquity of the ecliptic is ~23.4° and barely drifts over human timescales.
    expect(data.obliquity).toBeGreaterThan(23);
    expect(data.obliquity).toBeLessThan(24);
    expect(data.declinations?.size).toBe(data.positions.length);
    // No body's declination can exceed the obliquity by more than a body's own ecliptic
    // latitude could plausibly push it (a few degrees for the Moon/inner planets) — this is a
    // sanity bound, not a precise astronomical claim.
    for (const declination of data.declinations?.values() ?? []) {
      expect(Math.abs(declination)).toBeLessThan((data.obliquity ?? 0) + 10);
    }
  });

  it('resolves a longitude for every NATAL_FIXED_STARS name (#398)', async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine);
    expect(data.fixedStars?.size).toBe(NATAL_FIXED_STARS.length);
    for (const name of NATAL_FIXED_STARS) {
      const longitude = data.fixedStars?.get(name);
      expect(longitude).toBeGreaterThanOrEqual(0);
      expect(longitude).toBeLessThan(360);
    }
  });

  it('reports day sect for a Sun above the horizon', async () => {
    // Noon local time puts the Sun well above the horizon at this latitude.
    const engine = await getEngine();
    const data = await computeChartData({ ...MOMENT, civil: { ...MOMENT.civil, hour: 12, minute: 0 } }, engine);
    expect(data.sect).toBe('day');
  });

  it('reports night sect for a Sun well below the horizon', async () => {
    const engine = await getEngine();
    const data = await computeChartData({ ...MOMENT, civil: { ...MOMENT.civil, hour: 23, minute: 0 } }, engine);
    expect(data.sect).toBe('night');
  });

  it('respects an explicit house system', async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine, { houseSystem: 'K' });
    expect(data.houses.system).toBe('K');
  });

  it('carries exactly one Lilith and one Node model, defaulting to the mean ones (#52)', async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine);
    const keys = data.positions.map((position) => bodyById(position.body)?.key);

    expect(keys).toContain('meanLilith');
    expect(keys).not.toContain('osculatingLilith');
    expect(keys).not.toContain('interpolatedLilith');
    expect(keys).toContain('meanNode');
    expect(keys).not.toContain('trueNode');
  });

  it('switches to the osculating Lilith and the true Node when asked (#52)', async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine, { lilithVariant: 'true', nodeVariant: 'true' });
    const keys = data.positions.map((position) => bodyById(position.body)?.key);

    expect(keys).toContain('osculatingLilith');
    expect(keys).not.toContain('meanLilith');
    expect(keys).not.toContain('interpolatedLilith');
    expect(keys).toContain('trueNode');
    expect(keys).not.toContain('meanNode');
  });

  it('switches to interpolated Lilith when asked (#380)', async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine, { lilithVariant: 'interpolated' });
    const keys = data.positions.map((position) => bodyById(position.body)?.key);

    expect(keys).toContain('interpolatedLilith');
    expect(keys).not.toContain('meanLilith');
    expect(keys).not.toContain('osculatingLilith');
  });

  it('excludes Chiron, Lilith and the Nodes from aspects by default, though they are still positioned (#52)', async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine);
    const chiron = bodyByKey('chiron');
    const lilith = bodyByKey('meanLilith');
    const node = bodyByKey('meanNode');
    expect(chiron).toBeDefined();
    expect(lilith).toBeDefined();
    expect(node).toBeDefined();

    expect(data.positions.some((position) => position.body === chiron?.id)).toBe(true);
    expect(data.positions.some((position) => position.body === lilith?.id)).toBe(true);
    expect(data.positions.some((position) => position.body === node?.id)).toBe(true);

    const excludedIds = new Set([chiron?.id, lilith?.id, node?.id]);
    expect(data.aspects.some((aspect) => excludedIds.has(aspect.bodyA) || excludedIds.has(aspect.bodyB))).toBe(false);
  });

  it('includes Chiron, Lilith and the Nodes in aspects once asked for (#52)', async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine, {
      aspectsTo: { chiron: true, lilith: true, lunarNodes: true },
    });
    const chiron = bodyByKey('chiron');
    const lilith = bodyByKey('meanLilith');
    const node = bodyByKey('meanNode');
    const includedIds = new Set([chiron?.id, lilith?.id, node?.id]);
    expect(data.aspects.some((aspect) => includedIds.has(aspect.bodyA) || includedIds.has(aspect.bodyB))).toBe(true);
  });

  it('passes orbConfig through to aspect-finding (#52)', async () => {
    const engine = await getEngine();
    const wide = await computeChartData(MOMENT, engine);
    const tight = await computeChartData(MOMENT, engine, {
      orbConfig: {
        majorOrb: { base: -1, luminaryBonus: 0 },
        sextileOrb: { base: -1, luminaryBonus: 0 },
        minorOrb: -1,
        scalePercent: 0,
        enabledMinorAspects: [],
      },
    });
    expect(tight.aspects).toHaveLength(0);
    expect(wide.aspects.length).toBeGreaterThan(0);
  });

  it('computeChartDataAtJd produces the same chart as computeChartData given the same jd and place (#172)', async () => {
    const engine = await getEngine();
    const resolved = resolveMoment(MOMENT);
    const jd = await julianDayFor(engine, resolved);
    const place = { ...MOMENT.coordinates, altitude: 0 };

    const viaMoment = await computeChartData(MOMENT, engine);
    const viaJd = await computeChartDataAtJd(jd, place, engine);

    expect(viaJd.houses.ascendant).toBeCloseTo(viaMoment.houses.ascendant, 9);
    expect(viaJd.positions).toEqual(viaMoment.positions);
    expect(viaJd.sect).toBe(viaMoment.sect);
  });
});

describe('housesAreDefined (#378)', () => {
  const VALID: HousePositions = {
    cusps: [Number.NaN, 10, 40, 70, 100, 130, 160, 190, 220, 250, 280, 310, 340],
    ascendant: 10,
    midheaven: 280,
    armc: 278,
    vertex: 55,
    equatorialAscendant: 12,
    coAscendantKoch: 15,
    coAscendantMunkasey: 16,
    polarAscendant: 17,
    system: 'P',
  };

  it('is true for a normal chart, ignoring cusps[0] (always NaN by design)', () => {
    expect(housesAreDefined(VALID)).toBe(true);
  });

  it('is false when a house system has no solution at this latitude (NaN cusps, engine.ts’s own shape)', () => {
    const degenerate: HousePositions = { ...VALID, cusps: VALID.cusps.map(() => Number.NaN) };
    expect(housesAreDefined(degenerate)).toBe(false);
  });

  it('is false when only the ascendant or midheaven is NaN, even if every cusp is finite', () => {
    expect(housesAreDefined({ ...VALID, ascendant: Number.NaN })).toBe(false);
    expect(housesAreDefined({ ...VALID, midheaven: Number.NaN })).toBe(false);
  });

  it('is false when just one real cusp (not index 0) is NaN', () => {
    const oneBadCusp = [...VALID.cusps];
    oneBadCusp[7] = Number.NaN;
    expect(housesAreDefined({ ...VALID, cusps: oneBadCusp })).toBe(false);
  });
});

/**
 * The chart in the Astro-Seek reference sheet (#413): 1 Jan 1970 00:00, Antwerp OH. Its grid
 * prints these ASC/MC aspects, which are what the expected values below are taken from.
 */
describe('angle aspects (#413)', () => {
  const REFERENCE: BirthMomentInput = {
    civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    coordinates: { latitude: 41.1833, longitude: -84.7333 },
    zoneOverride: 'America/New_York',
  };

  async function referenceAngleAspects(): Promise<
    NonNullable<Awaited<ReturnType<typeof computeChartData>>['angleAspects']>
  > {
    const data = await computeChartData(REFERENCE, await getEngine());
    return data.angleAspects ?? [];
  }

  it('finds the Ascendant square the Sun, applying, about 10° wide', async () => {
    const sun = bodyByKey('sun');
    const found = (await referenceAngleAspects()).find((a) => a.angle === 'asc' && a.body === sun?.id);
    expect(found?.aspect.key).toBe('square');
    expect(found?.applying).toBe(true);
    expect(found?.separation).toBeGreaterThan(99);
    expect(found?.separation).toBeLessThan(100.5);
  });

  it('finds the Midheaven opposite the Sun, applying, about 10° out on the short side', async () => {
    const sun = bodyByKey('sun');
    const found = (await referenceAngleAspects()).find((a) => a.angle === 'mc' && a.body === sun?.id);
    expect(found?.aspect.key).toBe('opposition');
    expect(found?.applying).toBe(true);
    expect(found?.orb).toBeGreaterThan(9.4);
    expect(found?.orb).toBeLessThan(10);
    // Short of exact: the separation is under 180°.
    expect(found?.separation).toBeLessThan(180);
  });

  it('gives only aspects within the configured orb, so a wider orb scale finds at least as many', async () => {
    const engine = await getEngine();
    const base = await computeChartData(REFERENCE, engine);
    const wide = await computeChartData(REFERENCE, engine, {
      orbConfig: { ...DEFAULT_ORB_CONFIG, scalePercent: 50 },
    });
    expect((wide.angleAspects ?? []).length).toBeGreaterThanOrEqual((base.angleAspects ?? []).length);
  });

  it('leaves out Chiron, Lilith and the Nodes unless asked, exactly as for body-to-body aspects', async () => {
    const engine = await getEngine();
    const without = await computeChartData(REFERENCE, engine);
    const centaur = bodyByKey('chiron');
    expect((without.angleAspects ?? []).some((a) => a.body === centaur?.id)).toBe(false);
  });
});

/**
 * Backs `FINITE_DIFFERENCE_DT_DAYS`'s own doc comment with the actual numbers: the one-minute
 * step it pins sits in the sweet spot between truncation error (too large a step) and
 * floating-point noise amplification (too small a step), for the Ascendant/Midheaven — the
 * fastest-moving pair this module samples, so the hardest case for both failure modes.
 */
describe('finite-difference step is converged at one minute (#546)', () => {
  it('one minute and ten seconds agree far more closely than one hour and one minute do', async () => {
    const engine = await getEngine();
    const resolved = resolveMoment(MOMENT);
    const jd = await julianDayFor(engine, resolved);
    const place = { ...MOMENT.coordinates, altitude: 0 };
    const base = await engine.houses(jd, place, 'P');

    const rateAt = async (dtDays: number): Promise<{ ascendant: number; midheaven: number }> => {
      const sampled: HousePositions = await engine.houses(jd + dtDays, place, 'P');
      return {
        ascendant: finiteDifferenceRate(base.ascendant, sampled.ascendant, dtDays),
        midheaven: finiteDifferenceRate(base.midheaven, sampled.midheaven, dtDays),
      };
    };

    const oneHour = await rateAt(1 / 24);
    const oneMinute = await rateAt(1 / 1440);
    const tenSeconds = await rateAt(10 / 86400);

    // An hour is coarse enough that the Ascendant/Midheaven's own rate visibly changes within it
    // (truncation error); a minute versus ten seconds should agree far more closely than that —
    // within about a hundredth of a degree/day, negligible next to the orb any aspect whose
    // applying/separating direction matters still has left.
    const hourVsMinute = Math.abs(oneHour.ascendant - oneMinute.ascendant);
    const minuteVsTenSec = Math.abs(oneMinute.ascendant - tenSeconds.ascendant);
    expect(minuteVsTenSec).toBeLessThan(0.1);
    expect(minuteVsTenSec).toBeLessThan(hourVsMinute);

    const minuteVsTenSecMc = Math.abs(oneMinute.midheaven - tenSeconds.midheaven);
    expect(minuteVsTenSecMc).toBeLessThan(0.1);
  });

  it('going smaller than one minute does not keep improving — a tenth of a second is measurably noisier, not better', async () => {
    const engine = await getEngine();
    const resolved = resolveMoment(MOMENT);
    const jd = await julianDayFor(engine, resolved);
    const place = { ...MOMENT.coordinates, altitude: 0 };
    const base = await engine.houses(jd, place, 'P');

    const ascRateAt = async (dtDays: number): Promise<number> => {
      const sampled: HousePositions = await engine.houses(jd + dtDays, place, 'P');
      return finiteDifferenceRate(base.ascendant, sampled.ascendant, dtDays);
    };

    const oneMinute = await ascRateAt(1 / 1440);
    const oneSecond = await ascRateAt(1 / 86400);
    const tenthSecond = await ascRateAt(0.1 / 86400);

    // One second is still within the converged region (close to the one-minute estimate); a tenth
    // of a second has drifted further from it, not closer — confirming the one-minute step is
    // past the point of further gain, not merely "small enough for now".
    const minuteVsSecond = Math.abs(oneMinute - oneSecond);
    const minuteVsTenth = Math.abs(oneMinute - tenthSecond);
    expect(minuteVsTenth).toBeGreaterThan(minuteVsSecond);
  });
});

/**
 * The observable acceptance condition for #546, rather than a hardcoded speed value: an angle or
 * lot's own real forward motion must actually carry an "applying" aspect closer to exact and a
 * "separating" one further away. Samples two real moments a few minutes apart with the real
 * engine and checks every angle/lot aspect found at the first moment against its own distance
 * from exact at the second — independent of (larger than) `FINITE_DIFFERENCE_DT_DAYS` itself, so
 * this is a genuine end-to-end check, not a restatement of the internal sampling step.
 */
describe('angle/lot applying-separating matches real forward motion (#546)', () => {
  it('distance from exact shrinks when applying and grows when separating', async () => {
    const engine = await getEngine();
    const resolved = resolveMoment(MOMENT);
    const jd = await julianDayFor(engine, resolved);
    const place = { ...MOMENT.coordinates, altitude: 0 };
    const options = { aspectsTo: { vertex: true, partOfFortune: true, partOfSpirit: true } };
    // 10 seconds: an independent check computed by comparing two full, real chart computations
    // (never calling the internal finite-difference helper itself), short enough that a contact
    // already within a few hundredths of a degree of exact — the Vertex alone moves roughly
    // 0.007°/second here — can't cross all the way through exactness and come out "the same
    // distance but separating" within the step, which the stricter orb-skip threshold below
    // backs up for anything closer than that.
    const stepDays = 10 / 86400;
    const [before, after] = await Promise.all([
      computeChartDataAtJd(jd, place, engine, options),
      computeChartDataAtJd(jd + stepDays, place, engine, options),
    ]);

    const angleLongitude = (data: typeof before, angle: string): number => {
      switch (angle) {
        case 'asc':
          return data.houses.ascendant;
        case 'mc':
          return data.houses.midheaven;
        case 'vertex':
          return data.houses.vertex;
        case 'partOfFortune':
          return data.partOfFortune;
        default:
          return data.partOfSpirit;
      }
    };

    const found = before.angleAspects ?? [];
    expect(found.length).toBeGreaterThan(0);
    for (const aspect of found) {
      const bodyBefore = before.positions.find((p) => p.body === aspect.body)?.longitude;
      const bodyAfter = after.positions.find((p) => p.body === aspect.body)?.longitude;
      if (bodyBefore === undefined || bodyAfter === undefined) continue;
      // Skip anything already within a few hundredths of a degree of exact — even a 10-second
      // step could overshoot past exact for a contact this tight, which would make a simple
      // before/after distance comparison flaky without being evidence of anything wrong.
      if (Math.abs(aspect.orb) < 0.03) continue;
      const distanceBefore = Math.abs(
        angularSeparation(angleLongitude(before, aspect.angle), bodyBefore) - aspect.aspect.angle,
      );
      const distanceAfter = Math.abs(
        angularSeparation(angleLongitude(after, aspect.angle), bodyAfter) - aspect.aspect.angle,
      );
      const label = `${aspect.angle}-${String(aspect.body)} (${aspect.aspect.key})`;
      if (aspect.applying) {
        expect(distanceAfter, label).toBeLessThan(distanceBefore);
      } else {
        expect(distanceAfter, label).toBeGreaterThan(distanceBefore);
      }
    }
  });
});

/**
 * Aspects to the Vertex, Part of Fortune and Part of Spirit (#516), on the same reference chart as the angle aspects
 * (a day chart: the Sun is above the horizon).
 */
describe('point aspects (#516)', () => {
  const REFERENCE: BirthMomentInput = {
    civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    coordinates: { latitude: 41.1833, longitude: -84.7333 },
    zoneOverride: 'America/New_York',
  };
  const ALL_ON = { vertex: true, partOfFortune: true, partOfSpirit: true } as const;

  it('draws no aspects to the Vertex or the parts by default, and leaves Asc/MC unchanged by the flags', async () => {
    const engine = await getEngine();
    const off = await computeChartData(REFERENCE, engine);
    const on = await computeChartData(REFERENCE, engine, { aspectsTo: ALL_ON });
    expect((off.angleAspects ?? []).every((a) => a.angle === 'asc' || a.angle === 'mc')).toBe(true);
    const angles = (data: typeof on) => (data.angleAspects ?? []).filter((a) => a.angle === 'asc' || a.angle === 'mc');
    expect(angles(on)).toEqual(angles(off));
  });

  it('adds aspects for each enabled point only, and only to bodies', async () => {
    const engine = await getEngine();
    const only = await computeChartData(REFERENCE, engine, { aspectsTo: { partOfFortune: true } });
    const points = new Set((only.angleAspects ?? []).map((a) => a.angle));
    expect(points.has('partOfFortune')).toBe(true);
    expect(points.has('vertex')).toBe(false);
    expect(points.has('partOfSpirit')).toBe(false);
    for (const aspect of only.angleAspects ?? []) expect(bodyById(aspect.body)).toBeDefined();
  });

  it.each([
    ['day', 12],
    ['night', 0],
  ] as const)('in a %s chart, never aspects a part to the luminary it is built from', async (sect, hour) => {
    const engine = await getEngine();
    const data = await computeChartData({ ...REFERENCE, civil: { ...REFERENCE.civil, hour } }, engine, {
      aspectsTo: ALL_ON,
    });
    expect(data.sect).toBe(sect);
    const sun = bodyByKey('sun');
    const moon = bodyByKey('moon');
    if (!sun || !moon) throw new Error('sun/moon missing');
    // Day: Fortune = Asc + Moon - Sun, Spirit = Asc + Sun - Moon. Night swaps the luminaries.
    const fortunePlus = sect === 'day' ? moon : sun;
    const fortuneMinus = sect === 'day' ? sun : moon;
    const aspects = data.angleAspects ?? [];
    expect(aspects.some((a) => a.angle === 'partOfFortune' && a.body === fortunePlus.id)).toBe(false);
    expect(aspects.some((a) => a.angle === 'partOfSpirit' && a.body === fortuneMinus.id)).toBe(false);

    // The suppressed pairs would repeat the Ascendant's separation from the other luminary.
    const lon = (id: number): number => data.positions.find((p) => p.body === id)?.longitude ?? Number.NaN;
    const separation = (x: number, y: number): number => {
      const diff = Math.abs(x - y) % 360;
      return diff > 180 ? 360 - diff : diff;
    };
    expect(separation(data.partOfFortune, lon(fortunePlus.id))).toBeCloseTo(
      separation(data.houses.ascendant, lon(fortuneMinus.id)),
      9,
    );
    expect(separation(data.partOfSpirit, lon(fortuneMinus.id))).toBeCloseTo(
      separation(data.houses.ascendant, lon(fortunePlus.id)),
      9,
    );
  });

  it('returns no point aspects when the houses have no solution', async () => {
    const engine = await getEngine();
    const polar = await computeChartData({ ...REFERENCE, coordinates: { latitude: 80, longitude: -84.7333 } }, engine, {
      houseSystem: 'P',
      aspectsTo: ALL_ON,
    });
    if (!housesAreDefined(polar.houses)) expect(polar.angleAspects).toEqual([]);
  });
});

describe('chosen fixed stars (#803)', () => {
  const SHA = '18b0dcafbe5b7240773daba2c038a325f5b3fc4163f61e0a7f4e92abd4f517c6';
  const star = (name: string, designation: string) => ({
    id: `,${designation}`,
    name,
    designation,
    equinox: 'ICRS',
    sourceSha256: SHA,
  });

  it('keeps the seven-star preset exactly as before when none, or an empty list, is chosen', async () => {
    const engine = await getEngine();
    const before = await computeChartData(MOMENT, engine);
    const empty = await computeChartData(MOMENT, engine, { fixedStars: [] });
    expect([...(before.fixedStars?.keys() ?? [])]).toEqual(NATAL_FIXED_STARS);
    expect(empty.fixedStars).toEqual(before.fixedStars);
    for (const name of NATAL_FIXED_STARS) {
      expect(before.fixedStars?.get(name)).toBe((await engine.fixedStar(await jdOf(), name)).longitude);
    }
  });

  it('looks up a chosen star by its stored identifier, keyed by its name, against the real engine', async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine, {
      fixedStars: [star('Vega', 'alLyr')],
    });
    expect([...(data.fixedStars?.keys() ?? [])]).toEqual(['Vega']);
    const vega = await engine.fixedStar(await jdOf(), ',alLyr');
    expect(data.fixedStars?.get('Vega')).toBe(vega.longitude);
    // Vega sits near 15° Capricorn in this era (loose published fact, catches a wrong star).
    expect(data.fixedStars?.get('Vega')).toBeGreaterThan(284);
    expect(data.fixedStars?.get('Vega')).toBeLessThan(286);
  });

  it("carries each chosen star's stored designation and source hash into fixedStarSources, and none for the preset", async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine, {
      fixedStars: [star('Vega', 'alLyr'), star('Menkar', 'alCet')],
    });
    expect([...(data.fixedStarSources?.entries() ?? [])]).toEqual([
      ['Vega', { designation: 'alLyr', sourceSha256: SHA }],
      ['Menkar', { designation: 'alCet', sourceSha256: SHA }],
    ]);
    expect((await computeChartData(MOMENT, engine)).fixedStarSources).toBeUndefined();
  });

  it('keeps two chosen records that share a name apart by designation', async () => {
    const engine = await getEngine();
    const data = await computeChartData(MOMENT, engine, {
      fixedStars: [star('Menkar', 'alCet'), star('Menkar', 'laCet')],
    });
    const keys = [...(data.fixedStars?.keys() ?? [])];
    expect(keys).toEqual(['Menkar (alCet)', 'Menkar (laCet)']);
    expect(data.fixedStars?.get('Menkar (alCet)')).not.toBe(data.fixedStars?.get('Menkar (laCet)'));
  });
});

async function jdOf(): Promise<number> {
  return julianDayFor(await getEngine(), resolveMoment(MOMENT));
}
