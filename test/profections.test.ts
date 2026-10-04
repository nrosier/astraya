/**
 * Integration tests for computeProfections (#168).
 *
 * Runs against the real Swiss Ephemeris engine, never a mock: the natal Ascendant
 * comes from a genuine houses call, and the point of these tests is that the pure
 * sign-rotation math in `astrology/profections.ts` gets wired to it correctly.
 */
import { describe, expect, it } from 'vitest';
import { rulerOf } from '../src/astrology/dignities.js';
import { signIndex } from '../src/astrology/signs.js';
import { computeProfections, profectedHouse } from '../src/domain/profections.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

const NATAL_PLACE = { latitude: NATAL.coordinates.latitude, longitude: NATAL.coordinates.longitude, altitude: 0 };

describe('computeProfections (#168)', () => {
  it('profects to the natal Ascendant itself at the moment of birth', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const natalHouses = await engine.houses(natalJd, NATAL_PLACE, 'P');

    const profected = await computeProfections(NATAL, natalJd, engine);
    expect(profected.age).toBeCloseTo(0, 6);
    expect(profected.year.signIndex).toBe(signIndex(natalHouses.ascendant));
    expect(profected.month.signIndex).toBe(signIndex(natalHouses.ascendant));
  });

  it('advances the year profection by one sign per completed 365.2425-day year of age', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const natalHouses = await engine.houses(natalJd, NATAL_PLACE, 'P');
    const targetJd = natalJd + 365.2425 * 5;

    const profected = await computeProfections(NATAL, targetJd, engine);
    expect(profected.age).toBeCloseTo(5, 5);
    expect(profected.year.signIndex).toBe((signIndex(natalHouses.ascendant) + 5) % 12);
  });

  it('resolves the Lord of the Year with the traditional rulers when requested', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const targetJd = natalJd + 365.2425 * 5;

    const profected = await computeProfections(NATAL, targetJd, engine, { rulership: 'traditional' });
    expect(profected.year.ruler).toBe(rulerOf(profected.year.signIndex, 'traditional'));
  });

  it('resolves the Lord of the Year with modern rulership when requested', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    // 8 years lands on a sign whose traditional and modern rulers differ (Scorpio/Aquarius family).
    const targetJd = natalJd + 365.2425 * 8;

    const profected = await computeProfections(NATAL, targetJd, engine, { rulership: 'modern' });
    expect(profected.year.ruler).toBe(rulerOf(profected.year.signIndex, 'modern'));
  });

  it('uses the modern rulers by default, like the rest of the app, and names both lords under Both (#426)', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    // Walk the years until the profected sign is one the schemes disagree on (Scorpio, Aquarius, Pisces).
    let found: { age: number; sign: number } | undefined;
    for (let age = 0; age < 12 && found === undefined; age++) {
      const p = await computeProfections(NATAL, natalJd + 365.2425 * age, engine, { rulership: 'traditional' });
      if ([7, 10, 11].includes(p.year.signIndex)) found = { age, sign: p.year.signIndex };
    }
    if (found === undefined) throw new Error('fixture bug: no year profects to Scorpio, Aquarius or Pisces');
    const targetJd = natalJd + 365.2425 * found.age;

    const byDefault = await computeProfections(NATAL, targetJd, engine);
    const modern = await computeProfections(NATAL, targetJd, engine, { rulership: 'modern' });
    const traditional = await computeProfections(NATAL, targetJd, engine, { rulership: 'traditional' });
    const both = await computeProfections(NATAL, targetJd, engine, { rulership: 'both' });

    expect(byDefault.year.ruler).toBe(rulerOf(found.sign, 'modern'));
    expect(byDefault.year.ruler).toBe(modern.year.ruler);
    expect(modern.year.coRuler).toBeUndefined();
    expect(traditional.year.ruler).toBe(rulerOf(found.sign, 'traditional'));
    expect(traditional.year.ruler).not.toBe(modern.year.ruler);
    expect(traditional.year.coRuler).toBeUndefined();
    // Both: the traditional lord first, the modern one as the second lord.
    expect(both.year.ruler).toBe(traditional.year.ruler);
    expect(both.year.coRuler).toBe(modern.year.ruler);
  });

  it('has no second lord under Both when the two schemes agree', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    for (let age = 0; age < 12; age++) {
      const p = await computeProfections(NATAL, natalJd + 365.2425 * age, engine, { rulership: 'both' });
      expect(p.year.coRuler !== undefined).toBe([7, 10, 11].includes(p.year.signIndex));
    }
  });

  it('subdivides the year into monthly profections that start at the year’s own sign', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const targetJd = natalJd + 365.2425 * 3;

    const startOfYear = await computeProfections(NATAL, targetJd, engine);
    expect(startOfYear.month.monthIndex).toBe(0);
    expect(startOfYear.month.signIndex).toBe(startOfYear.year.signIndex);

    const sixMonthsIn = await computeProfections(NATAL, targetJd + 365.2425 / 2, engine);
    expect(sixMonthsIn.month.monthIndex).toBe(6);
    expect(sixMonthsIn.month.signIndex).toBe((startOfYear.year.signIndex + 6) % 12);
  });

  it('accepts an alternate house system for the natal Ascendant', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const koch = await engine.houses(natalJd, NATAL_PLACE, 'K');

    const profected = await computeProfections(NATAL, natalJd, engine, { houseSystem: 'K' });
    expect(profected.ascendant).toBeCloseTo(koch.ascendant, 6);
  });

  it('reports a negative age, without error, for a target before birth', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const targetJd = natalJd - 365.2425 * 2;

    const profected = await computeProfections(NATAL, targetJd, engine);
    expect(profected.age).toBeCloseTo(-2, 5);
  });
});

describe('the profected house (#427)', () => {
  it('counts whole signs from the natal Ascendant’s sign: its own sign is the 1st house', () => {
    // Ascendant at 15° Gemini (sign 2).
    expect(profectedHouse(75, 2)).toBe(1);
    expect(profectedHouse(75, 3)).toBe(2);
    expect(profectedHouse(75, 1)).toBe(12);
    expect(profectedHouse(75, 8)).toBe(7);
  });

  it('is the 1st house at birth and moves one house per year', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const atBirth = await computeProfections(NATAL, natalJd, engine);
    expect(atBirth.year.house).toBe(1);
    expect(atBirth.month.house).toBe(1);
    const atThirtyFive = await computeProfections(NATAL, natalJd + 35 * 365.2425 + 1, engine);
    expect(atThirtyFive.year.house).toBe((35 % 12) + 1);
  });
});
