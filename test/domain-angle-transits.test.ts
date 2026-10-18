/** Slow transits to the natal Ascendant and Midheaven (#678), against the real ephemeris. */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { findExactTransitAspects } from '../src/astrology/transit-events.js';
import { angleTransits } from '../src/domain/angle-transits.js';
import { computeChartData, computeChartDataAtJd } from '../src/domain/chart-compute.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};
const PLACE = { latitude: NATAL.coordinates.latitude, longitude: NATAL.coordinates.longitude, altitude: 0 };

describe('angleTransits (#678)', () => {
  it('lists Saturn on the natal Ascendant around its exact date, with orb, motion and every exact pass', async () => {
    const engine = await getEngine();
    const natal = await computeChartData(NATAL, engine);
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const saturn = bodyByKey('saturn');
    if (saturn === undefined) throw new Error('fixture bug: no Saturn');
    // The first time Saturn conjoins this Ascendant after birth, found independently of angleTransits.
    const hits = await findExactTransitAspects(
      engine,
      [saturn.id],
      new Map([['asc', natal.houses.ascendant]]),
      natalJd,
      natalJd + 40 * 365.2425,
      { sampleStepDays: 5 },
    );
    const exact = hits.find((hit) => hit.aspect.key === 'conjunction');
    if (exact === undefined) throw new Error('fixture bug: Saturn never conjoins this Ascendant in 40 years');

    const nowJd = exact.jd + 10;
    const sky = await computeChartDataAtJd(nowJd, PLACE, engine);
    const contacts = await angleTransits(sky.positions, natal.houses, nowJd, engine);
    const onAscendant = contacts.find(
      (contact) => contact.transitingKey === 'saturn' && contact.aspectKey === 'conjunction' && contact.angle === 'asc',
    );
    if (onAscendant === undefined) throw new Error('expected Saturn conjunct the Ascendant');

    const saturnNow = sky.positions.find((position) => position.body === saturn.id);
    if (saturnNow === undefined) throw new Error('fixture bug: no Saturn position');
    const gap = Math.abs(((saturnNow.longitude - natal.houses.ascendant + 540) % 360) - 180);
    expect(onAscendant.orb).toBeCloseTo(gap, 6);
    expect(onAscendant.orb).toBeLessThan(3.5);
    // Ten days past exact, moving direct it separates, moving retrograde it applies again.
    expect(onAscendant.applying).toBe(saturnNow.longitudeSpeed < 0);
    expect(onAscendant.exactJds.some((jd) => Math.abs(jd - exact.jd) < 1e-3)).toBe(true);
    expect([...onAscendant.exactJds].sort((a, b) => a - b)).toEqual(onAscendant.exactJds);
  });

  it('lists only the yearly rule set’s bodies and aspects, within its 3.5° orb', async () => {
    const engine = await getEngine();
    const natal = await computeChartData(NATAL, engine);
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const nowJd = natalJd + 30 * 365.2425;
    const sky = await computeChartDataAtJd(nowJd, PLACE, engine);
    const contacts = await angleTransits(sky.positions, natal.houses, nowJd, engine);
    for (const contact of contacts) {
      expect(['jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'chiron']).toContain(contact.transitingKey);
      expect(['conjunction', 'sextile', 'square', 'trine', 'opposition']).toContain(contact.aspectKey);
      expect(contact.orb).toBeLessThanOrEqual(3.5);
    }
  });
});
