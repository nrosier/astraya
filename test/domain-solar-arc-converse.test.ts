/**
 * Converse solar arc directions (#1407 Step 5), Solar Fire Deluxe guide §12.4 (PDF p. 80): "the calculation of the
 * progressed or directed chart will be done backwards in time from the time of the base chart instead of forwards",
 * a separate option from the x-1 ("Negative Arc") multiplier (owner decision on #1407, Q1). Real engine.
 */
import { describe, expect, it } from 'vitest';
import { TROPICAL_YEAR_DAYS, progressedJulianDay } from '../src/astrology/progressions.js';
import { computeSolarArcDirections } from '../src/domain/solar-arc-directions.js';
import type { JulianDayUT } from '../src/ephemeris/types.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

// Born in early January, near perihelion, where the Sun moves fastest: its motion in the days before birth differs
// from its motion in the days after, so converse is measurably not x-1.
const JANUARY: BirthMomentInput = {
  civil: { year: 1982, month: 1, day: 4, hour: 8, minute: 0, second: 0 },
  coordinates: { latitude: 52.37, longitude: 4.9 },
  offsetOverrideMinutes: 60,
};

function signed(degrees: number): number {
  const value = ((degrees % 360) + 360) % 360;
  return value > 180 ? value - 360 : value;
}

async function natalJdOf(moment: BirthMomentInput): Promise<JulianDayUT> {
  return julianDayFor(await getEngine(), resolveMoment(moment));
}

describe('converse solar arcs (#1407)', () => {
  it('directs the chart back by the Sun’s real motion over the same number of days before birth', async () => {
    const engine = await getEngine();
    const natalJd = await natalJdOf(JANUARY);
    const target = natalJd + 40 * TROPICAL_YEAR_DAYS;
    const data = await computeSolarArcDirections(JANUARY, target, engine, { converse: true });
    const days = progressedJulianDay(natalJd, target) - natalJd;
    const natalSun = await engine.position(natalJd, 0);
    const before = await engine.position(natalJd - days, 0);
    const motion = signed(natalSun.longitude - before.longitude);
    expect(data.converse).toBe(true);
    expect(data.progressedJd).toBeCloseTo(natalJd - days, 9);
    expect(data.arc).toBeCloseTo(-motion, 9);
    const directedSun = data.directedPositions.find((position) => position.body === 0)?.longitude ?? Number.NaN;
    expect(signed(directedSun - (natalSun.longitude - motion))).toBeCloseTo(0, 9);
  });

  it('is not the x-1 multiplier: near perihelion the arcs differ by more than 0.001°', async () => {
    const engine = await getEngine();
    const target = (await natalJdOf(JANUARY)) + 40 * TROPICAL_YEAR_DAYS;
    const converse = await computeSolarArcDirections(JANUARY, target, engine, { converse: true });
    const negative = await computeSolarArcDirections(JANUARY, target, engine, { arcMultiplier: -1 });
    expect(Math.abs(converse.arc - negative.arc)).toBeGreaterThan(0.001);
  });

  it('composes with x-1: converse x-1 directs forward by the converse arc', async () => {
    const engine = await getEngine();
    const target = (await natalJdOf(JANUARY)) + 40 * TROPICAL_YEAR_DAYS;
    const converse = await computeSolarArcDirections(JANUARY, target, engine, { converse: true });
    const both = await computeSolarArcDirections(JANUARY, target, engine, { converse: true, arcMultiplier: -1 });
    expect(both.arc).toBeCloseTo(-converse.arc, 9);
    expect(both.arc).toBeGreaterThan(0);
  });

  it('dates converse contacts: a contact is exact at its own exact date', async () => {
    const engine = await getEngine();
    const target = (await natalJdOf(JANUARY)) + 40 * TROPICAL_YEAR_DAYS;
    const data = await computeSolarArcDirections(JANUARY, target, engine, { converse: true });
    const dated = data.contacts.find((contact) => contact.exactJd !== undefined);
    expect(dated).toBeDefined();
    if (dated?.exactJd === undefined) return;
    const atExact = await computeSolarArcDirections(JANUARY, dated.exactJd, engine, { converse: true });
    const contact = atExact.contacts.find(
      (other) =>
        other.bodyA === dated.bodyA && other.bodyB === dated.bodyB && other.aspect.angle === dated.aspect.angle,
    );
    expect(contact?.orb ?? Number.NaN).toBeLessThan(0.01);
  });

  it('leaves the default forward, and converse Ascendant arcs run backwards from birth', async () => {
    const engine = await getEngine();
    const natalJd = await natalJdOf(JANUARY);
    const target = natalJd + 40 * TROPICAL_YEAR_DAYS;
    const plain = await computeSolarArcDirections(JANUARY, target, engine);
    expect(plain.converse).toBe(false);
    expect(plain.arc).toBeGreaterThan(0);
    const ascendant = await computeSolarArcDirections(JANUARY, target, engine, {
      arcKind: 'ascendant',
      converse: true,
    });
    expect(ascendant.arc).toBeLessThan(0);
  });

  it('marks converse contacts applying before their exact date and separating after it, with the active window around it', async () => {
    const engine = await getEngine();
    const target = (await natalJdOf(JANUARY)) + 40 * TROPICAL_YEAR_DAYS;
    const data = await computeSolarArcDirections(JANUARY, target, engine, { converse: true });
    const dated = data.contacts.filter((contact) => contact.exactJd !== undefined);
    expect(dated.length).toBeGreaterThan(0);
    for (const contact of dated) {
      const exact = contact.exactJd ?? Number.NaN;
      // Exactness lies ahead while the orb is closing, behind once it is widening.
      expect(contact.applying, `${String(contact.bodyA)}-${String(contact.bodyB)}`).toBe(exact > target);
      if (contact.activeFromJd !== undefined) expect(contact.activeFromJd).toBeLessThanOrEqual(exact);
      if (contact.activeUntilJd !== undefined) expect(contact.activeUntilJd).toBeGreaterThan(exact);
    }
  });

  it('dates a converse x0.5 contact exactly, where the candidate fold could go wrong', async () => {
    const engine = await getEngine();
    const target = (await natalJdOf(JANUARY)) + 40 * TROPICAL_YEAR_DAYS;
    const options = { converse: true, arcMultiplier: 0.5 } as const;
    const data = await computeSolarArcDirections(JANUARY, target, engine, options);
    const dated = data.contacts.find((contact) => contact.exactJd !== undefined);
    expect(dated).toBeDefined();
    if (dated?.exactJd === undefined) return;
    const atExact = await computeSolarArcDirections(JANUARY, dated.exactJd, engine, options);
    const contact = atExact.contacts.find(
      (other) =>
        other.bodyA === dated.bodyA && other.bodyB === dated.bodyB && other.aspect.angle === dated.aspect.angle,
    );
    expect(contact?.orb ?? Number.NaN).toBeLessThan(0.01);
  });

  it('takes the converse Ascendant and Vertex arcs from the progressed MC on the day before birth', async () => {
    const engine = await getEngine();
    const natalJd = await natalJdOf(JANUARY);
    const target = natalJd + 40 * TROPICAL_YEAR_DAYS;
    const days = progressedJulianDay(natalJd, target) - natalJd;
    const place = { ...JANUARY.coordinates, altitude: 0 };
    const natalHouses = await engine.houses(natalJd, place, 'P');
    const natalSun = await engine.position(natalJd, 0);
    const earlierJd = natalJd - days;
    const earlierSun = await engine.position(earlierJd, 0);
    const obliquity = await engine.obliquity(earlierJd);
    const mc = (natalHouses.midheaven + signed(earlierSun.longitude - natalSun.longitude) + 360) % 360;
    const lambda = (mc * Math.PI) / 180;
    const epsilon = (obliquity * Math.PI) / 180;
    const armc = ((Math.atan2(Math.sin(lambda) * Math.cos(epsilon), Math.cos(lambda)) * 180) / Math.PI + 360) % 360;
    const cast = await engine.housesFromArmc(armc, place.latitude, obliquity, 'P');
    const ascendant = await computeSolarArcDirections(JANUARY, target, engine, {
      arcKind: 'ascendant',
      converse: true,
    });
    const vertex = await computeSolarArcDirections(JANUARY, target, engine, { arcKind: 'vertex', converse: true });
    expect(signed(ascendant.arc - (cast.ascendant - natalHouses.ascendant))).toBeCloseTo(0, 6);
    expect(signed(vertex.arc - (cast.vertex - natalHouses.vertex))).toBeCloseTo(0, 6);
  });

  it('works in a sidereal zodiac: the converse arc is the sidereal Sun’s motion before birth', async () => {
    const engine = await getEngine();
    const natalJd = await natalJdOf(JANUARY);
    const target = natalJd + 40 * TROPICAL_YEAR_DAYS;
    const zodiac = { kind: 'sidereal', ayanamsa: 1 } as const;
    const data = await computeSolarArcDirections(JANUARY, target, engine, { converse: true, zodiac });
    const days = progressedJulianDay(natalJd, target) - natalJd;
    const natalSun = await engine.position(natalJd, 0, { zodiac });
    const before = await engine.position(natalJd - days, 0, { zodiac });
    expect(data.arc).toBeCloseTo(-signed(natalSun.longitude - before.longitude), 9);
  });
});
