/**
 * An independent reference for the Sunshine house systems (#1935): 'I' (Treindl's solution) and 'i' (Makransky's), as
 * cast by `housesFromArmc` with an explicit Sun declination, against a small reference implementation of the
 * semi-arc construction written here, with no engine call for the cusps.
 *
 * Construction (own derivation from the definition of Sunshine houses: the Sun's diurnal and nocturnal semi-arcs are
 * each trisected, and the house circles are the great circles through the north and south points of the horizon and
 * those trisection points on the Sun's diurnal circle; the cusp is where that circle meets the ecliptic). No published
 * Sunshine table or formula is cited: none was found in docs/references (astrologer review on #1935, 2026-11-24).
 * This proves the cusp maths, not agreement with a published table.
 *
 * Frame: equatorial, x towards RA 0, y towards RA 90, z towards the north celestial pole.
 *   Semi-arcs: SDA = acos(-tan φ tan δ), SNA = 180 - SDA. Circumpolar (|tan φ tan δ| >= 1) has no semi-arc split and
 *   the reference throws; the test points are asserted not to be circumpolar.
 *   Hour angles H (positive west of the upper meridian): cusp 11 at -SDA/3, cusp 12 at -2 SDA/3, cusp 2 at
 *   -(SDA + SNA/3), cusp 3 at -(SDA + 2 SNA/3). The point has RA α = ARMC - H and declination δ:
 *   P = (cos δ cos α, cos δ sin α, sin δ).
 *   Horizon south point: S = sin φ M - cos φ Zp, with M = (cos ARMC, sin ARMC, 0) the meridian on the equator and
 *   Zp = (0, 0, 1); the north point is -S. The house circle's pole is n = S × P.
 *   Ecliptic point at longitude λ: E(λ) = (cos λ, sin λ cos ε, sin λ sin ε). n · E(λ) = 0 gives
 *   λ = atan2(-n_x, n_y cos ε + n_z sin ε), or λ + 180; the cusp is the one on P's half of the circle, i.e. with
 *   E(λ) · (P - (P · S) S) > 0.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SwissEphemerisEngine } from '../src/ephemeris/engine.js';
import { EphemerisError } from '../src/ephemeris/types.js';
import { getEngine } from './engine-harness.js';

const RAD = Math.PI / 180;
type Vec = readonly [number, number, number];

const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** Signed difference a - b on the circle, in degrees, in (-180, 180]. */
const arcDiff = (a: number, b: number): number => {
  const d = norm360(a - b);
  return d > 180 ? d - 360 : d;
};

function isCircumpolar(latitude: number, declination: number): boolean {
  return Math.abs(Math.tan(latitude * RAD) * Math.tan(declination * RAD)) >= 1;
}

/** Reference Sunshine cusps 11, 12, 2 and 3, in degrees of ecliptic longitude (see the header for the formula). */
function referenceSunshineCusps(
  armc: number,
  latitude: number,
  obliquity: number,
  declination: number,
): Readonly<Record<11 | 12 | 2 | 3, number>> {
  if (isCircumpolar(latitude, declination)) {
    throw new Error('circumpolar Sun: the semi-arc construction is undefined');
  }
  const phi = latitude * RAD;
  const delta = declination * RAD;
  const eps = obliquity * RAD;
  const sda = Math.acos(-Math.tan(phi) * Math.tan(delta)) / RAD;
  const sna = 180 - sda;
  const meridian: Vec = [Math.cos(armc * RAD), Math.sin(armc * RAD), 0];
  const south: Vec = [Math.sin(phi) * meridian[0], Math.sin(phi) * meridian[1], -Math.cos(phi)];
  const cusp = (hourAngle: number): number => {
    const alpha = (armc - hourAngle) * RAD;
    const p: Vec = [Math.cos(delta) * Math.cos(alpha), Math.cos(delta) * Math.sin(alpha), Math.sin(delta)];
    const n = cross(south, p);
    const lambda = Math.atan2(-n[0], n[1] * Math.cos(eps) + n[2] * Math.sin(eps));
    const ps = dot(p, south);
    const pPerp: Vec = [p[0] - ps * south[0], p[1] - ps * south[1], p[2] - ps * south[2]];
    const e: Vec = [Math.cos(lambda), Math.sin(lambda) * Math.cos(eps), Math.sin(lambda) * Math.sin(eps)];
    return norm360(lambda / RAD + (dot(e, pPerp) > 0 ? 0 : 180));
  };
  return {
    11: cusp(-sda / 3),
    12: cusp((-2 * sda) / 3),
    2: cusp(-(sda + sna / 3)),
    3: cusp(-(sda + (2 * sna) / 3)),
  };
}

// The astrologer's test points (#1935 review, 2026-11-24).
const ARMC = 100;
const LATITUDE = 52.37;
const OBLIQUITY = 23.44;
const DECLINATIONS = [5, 20, -15] as const;
const CUSPS = [11, 12, 2, 3] as const;
// Tolerance: the owner decision on #1935 (2026-11-24) sets 1e-4 degrees; both sides are closed-form double-precision
// geometry, so any real disagreement in the construction shows up far above it.
const TOLERANCE_DEG = 1e-4;

let engine: SwissEphemerisEngine;

beforeAll(async () => {
  engine = await getEngine();
});

describe('Sunshine against an independent semi-arc reference (#1935)', () => {
  it('the test points are not circumpolar', () => {
    for (const declination of DECLINATIONS) expect(isCircumpolar(LATITUDE, declination)).toBe(false);
  });

  for (const system of ['I', 'i'] as const) {
    for (const declination of DECLINATIONS) {
      it(`'${system}' at declination ${String(declination)} matches the reference for cusps 11, 12, 2 and 3 to 1e-4 degrees`, async () => {
        const reference = referenceSunshineCusps(ARMC, LATITUDE, OBLIQUITY, declination);
        const result = await engine.housesFromArmc(ARMC, LATITUDE, OBLIQUITY, system, declination);
        expect(result.system).toBe(system);
        for (const house of CUSPS) {
          const actual = result.cusps[house] ?? Number.NaN;
          expect(Math.abs(arcDiff(actual, reference[house]))).toBeLessThan(TOLERANCE_DEG);
        }
      });
    }
  }

  it("refuses 'i' when no Sun declination is given (regression guard for needsSunDeclination)", async () => {
    const call = engine.housesFromArmc(ARMC, LATITUDE, OBLIQUITY, 'i');
    await expect(call).rejects.toBeInstanceOf(EphemerisError);
    await expect(call).rejects.toThrow(/^House system 'i' \(Sunshine\) needs the Sun's declination\.$/);
  });
});
