/**
 * Eclipse search (#404), against the real Swiss Ephemeris and NASA's published eclipse
 * catalogue (times of greatest eclipse, UT, to the second). The binding's own type
 * declarations promise a `{ flag, data }` result that the live call does not return, so the
 * kind of each eclipse is derived in the engine — this is the test that proves that derivation
 * gives the same answer as the catalogue, hybrids included.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { EphemerisProvider, JulianDayUT, LunarEclipseKind, SolarEclipseKind } from '../src/ephemeris/types.js';
import { civilFromJulianDay } from '../src/time/julian.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;
let from2023: JulianDayUT;

const SECOND = 1 / 86400;

// UT (second precision) = NASA TD of greatest eclipse minus the printed ΔT, from
// https://eclipse.gsfc.nasa.gov/SEcat5/SE2001-2100.html (catalogue 09559-09566), checked 2026-11-26.
const SOLAR: readonly (readonly [string, SolarEclipseKind])[] = [
  ['2023-04-20 04:16:43', 'hybrid'], // 09559: TD 04:17:56, ΔT 73
  ['2023-10-14 17:59:27', 'annular'], // 09560: TD 18:00:41, ΔT 74
  ['2024-04-08 18:17:15', 'total'], // 09561: TD 18:18:29, ΔT 74
  ['2024-10-02 18:44:59', 'annular'], // 09562: TD 18:46:13, ΔT 74
  ['2025-03-29 10:47:21', 'partial'], // 09563: TD 10:48:36, ΔT 75
  ['2025-09-21 19:41:49', 'partial'], // 09564: TD 19:43:04, ΔT 75
  ['2026-02-17 12:11:51', 'annular'], // 09565: TD 12:13:06, ΔT 75
  ['2026-08-12 17:45:51', 'total'], // 09566: TD 17:47:06, ΔT 75
];

// UT (second precision) = NASA TD of greatest eclipse minus the printed ΔT, from
// https://eclipse.gsfc.nasa.gov/LEcat5/LE2001-2100.html (catalogue 09702-09709), checked 2026-11-26.
const LUNAR: readonly (readonly [string, LunarEclipseKind])[] = [
  ['2023-05-05 17:22:52', 'penumbral'], // 09702: TD 17:24:05, ΔT 73
  ['2023-10-28 20:14:04', 'partial'], // 09703: TD 20:15:18, ΔT 74
  ['2024-03-25 07:12:45', 'penumbral'], // 09704: TD 07:13:59, ΔT 74
  ['2024-09-18 02:44:11', 'partial'], // 09705: TD 02:45:25, ΔT 74
  ['2025-03-14 06:58:41', 'total'], // 09706: TD 06:59:56, ΔT 75
  ['2025-09-07 18:11:43', 'total'], // 09707: TD 18:12:58, ΔT 75
  ['2026-03-03 11:33:37', 'total'], // 09708: TD 11:34:52, ΔT 75
  ['2026-08-28 04:12:49', 'partial'], // 09709: TD 04:14:04, ΔT 75
];

function stamp(jd: JulianDayUT): string {
  const c = civilFromJulianDay(jd);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${String(c.year)}-${p(c.month)}-${p(c.day)} ${p(c.hour)}:${p(c.minute)}`;
}

async function jdOf(text: string): Promise<JulianDayUT> {
  const [date = '', time = ''] = text.split(' ');
  const [y = 0, m = 0, d = 0] = date.split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = time.split(':').map(Number);
  return engine.julianDayFromUtc(y, m, d, hh, mm, ss);
}

beforeAll(async () => {
  engine = await getEngine();
  from2023 = await engine.julianDayFromUtc(2023, 1, 1, 0, 0, 0);
}, 60_000);

describe('nextSolarEclipse (#404)', () => {
  it('walks the solar eclipses of 2023-2026 with the catalogue’s time and kind for each', async () => {
    let from = from2023;
    for (const [expectedTime, expectedKind] of SOLAR) {
      const eclipse = await engine.nextSolarEclipse(from);
      expect(Math.abs(eclipse.maxJd - (await jdOf(expectedTime)))).toBeLessThan(15 * SECOND);
      expect(eclipse.kind, `${stamp(eclipse.maxJd)} should be ${expectedKind}`).toBe(expectedKind);
      from = eclipse.maxJd + 20;
    }
  }, 120_000);

  it('gives a central phase only to central eclipses, inside the eclipse’s own span', async () => {
    const partial = await engine.nextSolarEclipse(await jdOf('2025-03-01 00:00'));
    expect(partial.kind).toBe('partial');
    expect(partial.centralStartJd).toBeUndefined();
    expect(partial.centralEndJd).toBeUndefined();

    const total = await engine.nextSolarEclipse(await jdOf('2024-03-01 00:00'));
    expect(total.kind).toBe('total');
    const { centralStartJd, centralEndJd } = total;
    expect(centralStartJd).toBeDefined();
    expect(centralEndJd).toBeDefined();
    expect(total.startJd).toBeLessThan(centralStartJd ?? 0);
    expect(centralStartJd ?? 0).toBeLessThan(total.maxJd);
    expect(total.maxJd).toBeLessThan(centralEndJd ?? 0);
    expect(centralEndJd ?? 0).toBeLessThan(total.endJd);
  }, 60_000);

  it('finds the other hybrid of the decade, 14 November 2031', async () => {
    const eclipse = await engine.nextSolarEclipse(await jdOf('2031-10-01 00:00'));
    expect(stamp(eclipse.maxJd).slice(0, 10)).toBe('2031-11-14');
    expect(eclipse.kind).toBe('hybrid');
  }, 60_000);

  it('searches backwards: the eclipse before the April 2024 total is the October 2023 annular', async () => {
    const eclipse = await engine.nextSolarEclipse(await jdOf('2024-04-08 00:00'), true);
    expect(stamp(eclipse.maxJd).slice(0, 10)).toBe('2023-10-14');
    expect(eclipse.kind).toBe('annular');
  }, 60_000);
});

describe('nextLunarEclipse (#404)', () => {
  it('walks the lunar eclipses of 2023-2026 with the catalogue’s time and kind for each', async () => {
    let from = from2023;
    for (const [expectedTime, expectedKind] of LUNAR) {
      const eclipse = await engine.nextLunarEclipse(from);
      expect(Math.abs(eclipse.maxJd - (await jdOf(expectedTime)))).toBeLessThan(15 * SECOND);
      expect(eclipse.kind, `${stamp(eclipse.maxJd)} should be ${expectedKind}`).toBe(expectedKind);
      from = eclipse.maxJd + 20;
    }
  }, 120_000);

  it('nests the phases of a total eclipse: penumbral contacts outside partial outside totality', async () => {
    const eclipse = await engine.nextLunarEclipse(await jdOf('2025-03-01 00:00'));
    expect(eclipse.kind).toBe('total');
    const { partialStartJd, partialEndJd, totalStartJd, totalEndJd } = eclipse;
    expect(eclipse.penumbralStartJd).toBeLessThan(partialStartJd ?? 0);
    expect(partialStartJd ?? 0).toBeLessThan(totalStartJd ?? 0);
    expect(totalStartJd ?? 0).toBeLessThan(eclipse.maxJd);
    expect(eclipse.maxJd).toBeLessThan(totalEndJd ?? 0);
    expect(totalEndJd ?? 0).toBeLessThan(partialEndJd ?? 0);
    expect(partialEndJd ?? 0).toBeLessThan(eclipse.penumbralEndJd);
  }, 60_000);

  it('gives a penumbral eclipse no partial or total phase', async () => {
    const eclipse = await engine.nextLunarEclipse(await jdOf('2023-05-01 00:00'));
    expect(eclipse.kind).toBe('penumbral');
    expect(eclipse.partialStartJd).toBeUndefined();
    expect(eclipse.totalStartJd).toBeUndefined();
    expect(eclipse.penumbralEndJd).toBeGreaterThan(eclipse.penumbralStartJd);
  }, 60_000);

  it('searches backwards: the eclipse before the March 2025 total is the September 2024 partial', async () => {
    const eclipse = await engine.nextLunarEclipse(await jdOf('2025-03-14 00:00'), true);
    expect(stamp(eclipse.maxJd).slice(0, 10)).toBe('2024-09-18');
    expect(eclipse.kind).toBe('partial');
  }, 60_000);
});
