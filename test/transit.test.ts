/**
 * Integration tests for computeTransit (#172).
 *
 * Runs against the real Swiss Ephemeris engine: the point of this module is that two real
 * ephemeris passes (natal, transiting) combine correctly through `findCrossAspects`, which a
 * mocked provider couldn't demonstrate.
 */
import { describe, expect, it } from 'vitest';
import {
  angularSeparation,
  DEFAULT_ORB_CONFIG,
  findCrossAspects,
  fixedSubjects,
  orbForPoint,
  subjectsFrom,
} from '../src/astrology/aspects.js';
import { bodyByKey, bodyById } from '../src/astrology/bodies.js';
import { orbConfigForContext } from '../src/astrology/orb-profiles.js';
import { findExactTransitAspects } from '../src/astrology/transit-events.js';
import { contactsToNatalAngles, computeTransit } from '../src/domain/transit.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

describe('computeTransit (#172)', () => {
  it('computes full ChartData for both the natal and transiting rings', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const data = await computeTransit(NATAL, natalJd + 100, engine);

    expect(data.natal.positions.length).toBeGreaterThan(0);
    expect(data.natal.houses.cusps).toHaveLength(13);
    expect(data.transit.positions.length).toBeGreaterThan(0);
    expect(data.transit.houses.cusps).toHaveLength(13);
  });

  it('casts the transiting houses for the natal place', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const data = await computeTransit(NATAL, natalJd + 100, engine);
    const directHouses = await engine.houses(natalJd + 100, { ...NATAL.coordinates, altitude: 0 }, 'P');
    expect(data.transit.houses.ascendant).toBeCloseTo(directHouses.ascendant, 6);
  });

  it('returns the same chart for both rings when transiting to the natal moment itself', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const data = await computeTransit(NATAL, natalJd, engine);
    expect(data.transit.houses.ascendant).toBeCloseTo(data.natal.houses.ascendant, 6);
    expect(data.transit.positions).toHaveLength(data.natal.positions.length);
  });

  it('finds contacts from the transiting (moving) positions to the fixed natal chart (#51)', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const data = await computeTransit(NATAL, natalJd + 365.2425 * 5, engine);
    expect(data.contacts.length).toBeGreaterThan(0);

    for (const contact of data.contacts) {
      const transitPosition = data.transit.positions.find((p) => p.body === contact.bodyA);
      const natalPosition = data.natal.positions.find((p) => p.body === contact.bodyB);
      expect(transitPosition).toBeDefined();
      expect(natalPosition).toBeDefined();
      const separation = angularSeparation(transitPosition?.longitude ?? 0, natalPosition?.longitude ?? 0);
      expect(Math.abs(separation - contact.aspect.angle)).toBeCloseTo(contact.orb, 6);
    }
  });

  it('narrows to fewer contacts with a tighter orb config', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const targetJd = natalJd + 365.2425 * 5;

    const wide = await computeTransit(NATAL, targetJd, engine);
    const tight = await computeTransit(NATAL, targetJd, engine, {
      orbConfig: {
        majorOrb: { base: -1, luminaryBonus: 0 },
        sextileOrb: { base: -1, luminaryBonus: 0 },
        minorOrb: -1,
        scalePercent: 0,
        enabledMinorAspects: [],
      },
    });
    expect(tight.contacts).toHaveLength(0);
    expect(wide.contacts.length).toBeGreaterThan(0);
  });

  it('respects an explicit house system for both rings', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const data = await computeTransit(NATAL, natalJd + 100, engine, { houseSystem: 'K' });
    expect(data.natal.houses.system).toBe('K');
    expect(data.transit.houses.system).toBe('K');
  });
});

describe('transit angle contacts (#1508)', () => {
  const ORBS = orbConfigForContext('transit', DEFAULT_ORB_CONFIG);

  it('leaves the body contacts exactly as a direct findCrossAspects call gives them', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    for (const days of [100, 365.2425 * 5, 365.2425 * 31]) {
      const data = await computeTransit(NATAL, natalJd + days, engine);
      const category = (body: number) => bodyById(body)?.category ?? 'planet';
      const direct = findCrossAspects(
        subjectsFrom(data.transit.positions, category),
        fixedSubjects(data.natal.positions, category),
        ORBS,
      );
      expect(data.contacts).toEqual(direct);
    }
  });

  it('lists Saturn on the natal Ascendant once, with the orb rule of orbForPoint', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const natal = await computeTransit(NATAL, natalJd, engine);
    const saturn = bodyByKey('saturn');
    if (saturn === undefined) throw new Error('fixture bug: no Saturn');
    const hits = await findExactTransitAspects(
      engine,
      [saturn.id],
      new Map([['asc', natal.natal.houses.ascendant]]),
      natalJd,
      natalJd + 40 * 365.2425,
      { sampleStepDays: 5 },
    );
    const exact = hits.find((hit) => hit.aspect.key === 'conjunction');
    if (exact === undefined) throw new Error('fixture bug: Saturn never conjoins this Ascendant in 40 years');

    const data = await computeTransit(NATAL, exact.jd + 2, engine);
    const onAsc = data.angleContacts.filter((c) => c.angle === 'asc' && c.body === saturn.id);
    expect(onAsc).toHaveLength(1);
    const contact = onAsc[0];
    const allowed = orbForPoint('conjunction', { key: 'saturn', category: saturn.category }, ORBS);
    expect(contact?.aspect.key).toBe('conjunction');
    expect(contact?.orbRule).toBe(allowed.rule);
    expect(contact?.orb).toBeLessThanOrEqual(allowed.allowedOrb);
  });

  it('has no angle contacts when the natal houses are undefined', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const data = await computeTransit(NATAL, natalJd + 100, engine);
    const undefinedHouses = {
      ...data.natal,
      houses: { ...data.natal.houses, ascendant: Number.NaN, midheaven: Number.NaN },
    };
    expect(contactsToNatalAngles(data.transit.positions, undefinedHouses, true, ORBS)).toEqual([]);
  });
});
