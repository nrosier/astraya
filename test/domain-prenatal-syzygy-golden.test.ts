/**
 * The prenatal syzygy against an independent published table (#1798, owner decision 2026-11-20): Fred Espenak, NASA
 * GSFC, "Phases of the Moon: 1801 to 1900" (`espenak-nasa-moon-phases-1801-1900` in docs/references/sources.json),
 * whose page states "the date and time (Universal Time) of all phases of the Moon". Its 1879 rows, as printed:
 *
 *   New Moon Feb 21 04:03, Full Moon Mar 8 13:10, New Moon Mar 22 21:05 (UT).
 *
 * Einstein was born 1879-03-14 11:30 local mean time at Ulm (9.99° E, so 39m58s ahead of UT): 10:50:02 UT. The last
 * syzygy before that is the Full Moon of 8 March, so the nativity is preventional. The table gives whole minutes, so
 * the instant is checked within 2 minutes, the tolerance the brief set.
 */
import { describe, expect, it } from 'vitest';
import { prenatalSyzygy } from '../src/domain/prenatal-syzygy.js';
import type { GeoPosition } from '../src/ephemeris/types.js';
import { getEngine } from './engine-harness.js';

const ULM: GeoPosition = { latitude: 48.4, longitude: 9.99, altitude: 0 };
const TWO_MINUTES_DAYS = 2 / (24 * 60);

describe('prenatalSyzygy against the NASA/Espenak 1879 table (#1798)', () => {
  it("finds Einstein's prenatal syzygy: the Full Moon of 1879 Mar 8 13:10 UT, a prevention", async () => {
    const engine = await getEngine();
    const birthJd = await engine.julianDayFromUtc(1879, 3, 14, 10, 50, 2);
    const tableFullMoonJd = await engine.julianDayFromUtc(1879, 3, 8, 13, 10, 0);
    const result = await prenatalSyzygy(engine, birthJd, ULM);
    expect(result.kind).toBe('prevention');
    expect(Math.abs(result.jd - tableFullMoonJd)).toBeLessThanOrEqual(TWO_MINUTES_DAYS);
  });

  it('is not the New Moon of Feb 21 (earlier) or of Mar 22 (after the birth)', async () => {
    const engine = await getEngine();
    const birthJd = await engine.julianDayFromUtc(1879, 3, 14, 10, 50, 2);
    const result = await prenatalSyzygy(engine, birthJd, ULM);
    const febNew = await engine.julianDayFromUtc(1879, 2, 21, 4, 3, 0);
    const marNew = await engine.julianDayFromUtc(1879, 3, 22, 21, 5, 0);
    expect(Math.abs(result.jd - febNew)).toBeGreaterThan(1);
    expect(result.jd).toBeLessThan(birthJd);
    expect(marNew).toBeGreaterThan(birthJd);
  });
});
