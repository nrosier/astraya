/**
 * Solar arc directions with an arc kind and a multiplier (#1407 Step 1b), the Solar Fire Deluxe guide §12.4
 * (PDF pp. 78-80): the solar, Ascendant or Vertex arc, scaled by x1, x2, x0.5, x-1, x-2 or x-0.5. The Ascendant and
 * Vertex arcs come from the progressed MC (natal MC plus the solar arc), as the guide's §30.3.2.1 derives every
 * progressed angle. Real engine throughout.
 */
import { describe, expect, it } from 'vitest';
import { TROPICAL_YEAR_DAYS, progressedJulianDay } from '../src/astrology/progressions.js';
import { computeSolarArcDirections, SOLAR_ARC_MULTIPLIERS } from '../src/domain/solar-arc-directions.js';
import type { JulianDayUT } from '../src/ephemeris/types.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const PERSON: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

// A birth near the Arctic circle, where the Ascendant moves very unevenly against the MC.
const TROMSO: BirthMomentInput = {
  civil: { year: 1975, month: 2, day: 3, hour: 9, minute: 10, second: 0 },
  coordinates: { latitude: 69.65, longitude: 18.96 },
  offsetOverrideMinutes: 60,
};

function signed(degrees: number): number {
  const value = ((degrees % 360) + 360) % 360;
  return value > 180 ? value - 360 : value;
}

async function natalJdOf(moment: BirthMomentInput): Promise<JulianDayUT> {
  return julianDayFor(await getEngine(), resolveMoment(moment));
}

describe('solar arc kinds and multipliers (#1407)', () => {
  it('leaves the default (solar, x1) exactly as before', async () => {
    const engine = await getEngine();
    const target = (await natalJdOf(PERSON)) + 34.2 * TROPICAL_YEAR_DAYS;
    const plain = await computeSolarArcDirections(PERSON, target, engine);
    const explicit = await computeSolarArcDirections(PERSON, target, engine, { arcKind: 'solar', arcMultiplier: 1 });
    expect(explicit).toEqual(plain);
    expect(plain.arcKind).toBe('solar');
    expect(plain.arcMultiplier).toBe(1);
  });

  it('x-1 mirrors x1 about the natal longitudes, and x2 and x0.5 scale the arc', async () => {
    const engine = await getEngine();
    const natalJd = await natalJdOf(PERSON);
    const target = natalJd + 34.2 * TROPICAL_YEAR_DAYS;
    const forward = await computeSolarArcDirections(PERSON, target, engine);
    const negative = await computeSolarArcDirections(PERSON, target, engine, { arcMultiplier: -1 });
    const double = await computeSolarArcDirections(PERSON, target, engine, { arcMultiplier: 2 });
    const half = await computeSolarArcDirections(PERSON, target, engine, { arcMultiplier: 0.5 });
    expect(negative.arc).toBeCloseTo(-forward.arc, 9);
    expect(double.arc).toBeCloseTo(2 * forward.arc, 9);
    expect(half.arc).toBeCloseTo(0.5 * forward.arc, 9);
    const natal = await computeSolarArcDirections(PERSON, natalJd, engine);
    for (const [index, position] of forward.directedPositions.entries()) {
      const natalLongitude = natal.directedPositions[index]?.longitude ?? Number.NaN;
      const mirrored = negative.directedPositions[index]?.longitude ?? Number.NaN;
      expect(signed(position.longitude - natalLongitude)).toBeCloseTo(-signed(mirrored - natalLongitude), 9);
    }
  });

  it('accepts exactly the six multipliers the guide lists, and nothing else', async () => {
    const engine = await getEngine();
    expect([...SOLAR_ARC_MULTIPLIERS]).toEqual([1, 2, 0.5, -1, -2, -0.5]);
    const target = (await natalJdOf(PERSON)) + 10 * TROPICAL_YEAR_DAYS;
    await expect(
      computeSolarArcDirections(PERSON, target, engine, { arcMultiplier: 3 as unknown as 1 }),
    ).rejects.toThrow(/arc multiplier/);
  });

  it('dates contacts for a multiplied solar arc: the contact is exact at its exact date', async () => {
    const engine = await getEngine();
    const natalJd = await natalJdOf(PERSON);
    const target = natalJd + 34.2 * TROPICAL_YEAR_DAYS;
    const half = await computeSolarArcDirections(PERSON, target, engine, { arcMultiplier: 0.5 });
    const dated = half.contacts.find((contact) => contact.exactJd !== undefined);
    expect(dated).toBeDefined();
    if (dated?.exactJd === undefined) return;
    const atExact = await computeSolarArcDirections(PERSON, dated.exactJd, engine, { arcMultiplier: 0.5 });
    const contact = atExact.contacts.find(
      (other) =>
        other.bodyA === dated.bodyA && other.bodyB === dated.bodyB && other.aspect.angle === dated.aspect.angle,
    );
    expect(contact?.orb ?? Number.NaN).toBeLessThan(0.01);
  });

  it('the Ascendant and Vertex arcs are 0 at birth', async () => {
    const engine = await getEngine();
    const natalJd = await natalJdOf(PERSON);
    for (const arcKind of ['ascendant', 'vertex'] as const) {
      const atBirth = await computeSolarArcDirections(PERSON, natalJd, engine, { arcKind });
      expect(Math.abs(atBirth.arc), arcKind).toBeLessThan(1e-6);
    }
  });

  it('derives the Ascendant arc from the progressed MC: the cast MC is the MC that went in', async () => {
    const engine = await getEngine();
    const natalJd = await natalJdOf(TROMSO);
    const target = natalJd + 30 * TROPICAL_YEAR_DAYS;
    const place = { ...TROMSO.coordinates, altitude: 0 };
    const progressedJd = progressedJulianDay(natalJd, target);
    const natalHouses = await engine.houses(natalJd, place, 'P');
    const natalSun = await engine.position(natalJd, 0);
    const progressedSun = await engine.position(progressedJd, 0);
    const obliquity = await engine.obliquity(progressedJd);
    const progressedMc = (natalHouses.midheaven + signed(progressedSun.longitude - natalSun.longitude) + 360) % 360;
    const lambda = (progressedMc * Math.PI) / 180;
    const epsilon = (obliquity * Math.PI) / 180;
    const armc = ((Math.atan2(Math.sin(lambda) * Math.cos(epsilon), Math.cos(lambda)) * 180) / Math.PI + 360) % 360;
    const cast = await engine.housesFromArmc(armc, place.latitude, obliquity, 'P');
    expect(Math.abs(signed(cast.midheaven - progressedMc))).toBeLessThan(1e-6);

    const data = await computeSolarArcDirections(TROMSO, target, engine, { arcKind: 'ascendant' });
    expect(data.arc).toBeCloseTo(signed(cast.ascendant - natalHouses.ascendant), 6);
  });

  it('at a high latitude the Ascendant arc is not the solar arc, as it would be with rigidly rotated angles', async () => {
    const engine = await getEngine();
    const natalJd = await natalJdOf(TROMSO);
    const target = natalJd + 30 * TROPICAL_YEAR_DAYS;
    const solar = await computeSolarArcDirections(TROMSO, target, engine);
    const ascendant = await computeSolarArcDirections(TROMSO, target, engine, { arcKind: 'ascendant' });
    expect(Math.abs(ascendant.arc - solar.arc)).toBeGreaterThan(1);
  });

  it('gives Ascendant arc contacts no dates, and scales the arc by the multiplier', async () => {
    const engine = await getEngine();
    const target = (await natalJdOf(PERSON)) + 34.2 * TROPICAL_YEAR_DAYS;
    const ascendant = await computeSolarArcDirections(PERSON, target, engine, { arcKind: 'ascendant' });
    const negative = await computeSolarArcDirections(PERSON, target, engine, {
      arcKind: 'ascendant',
      arcMultiplier: -1,
    });
    expect(negative.arc).toBeCloseTo(-ascendant.arc, 9);
    for (const contact of ascendant.contacts) {
      expect(contact.exactJd).toBeUndefined();
      expect(contact.activeFromJd).toBeUndefined();
      expect(contact.activeUntilJd).toBeUndefined();
    }
  });
});
