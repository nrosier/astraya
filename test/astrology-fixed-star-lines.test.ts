/**
 * Fixed-star map lines (#2018), checked against the real Swiss Ephemeris engine.
 *
 * Each line is compared with `engine.azimuthAltitude` at the line's own place:
 * an MC or IC point is on the star's meridian, so its altitude is known in
 * closed form; an AC or DC point is on the horizon. No mocks.
 */
import { describe, expect, it } from 'vitest';
import { fixedStarLines, type HorizonLinePoint } from '../src/astrology/astrocartography.js';
import { armcAtAngle, parans, type AngleEvent, type EquatorialPoint } from '../src/astrology/fixed-stars.js';
import { getEngine } from './engine-harness.js';

const JD_2024 = 2_460_310.5; // 2024-01-01 00:00 UT
const PLACES = [0, 30, -40, 60] as const;

interface StarCase {
  readonly name: string;
  readonly point: EquatorialPoint;
  readonly armc0: number;
}

async function starCase(name: string): Promise<StarCase> {
  const engine = await getEngine();
  const star = await engine.fixedStar(JD_2024, name, { equatorial: true });
  const houses = await engine.houses(JD_2024, { latitude: 0, longitude: 0, altitude: 0 }, 'P');
  return {
    name,
    point: { rightAscension: star.longitude, declination: star.latitude },
    armc0: houses.armc,
  };
}

/** Signed angular difference a − b, wrapped to [-180, 180). */
function angleDiff(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

function allSegmentPoints(segments: readonly (readonly HorizonLinePoint[])[]): HorizonLinePoint[] {
  return segments.flat();
}

const STARS = ['Regulus', 'Sirius', 'Menkar'] as const;

describe('fixedStarLines (#2018): MC and IC', () => {
  for (const name of STARS) {
    it(`${name}: MC altitude is 90 - |φ - δ| at every latitude`, async () => {
      const { point, armc0 } = await starCase(name);
      const lines = fixedStarLines(name, point, armc0);
      const engine = await getEngine();
      for (const lat of PLACES) {
        const alt = await engine.azimuthAltitude(
          JD_2024,
          { longitude: point.rightAscension, latitude: point.declination },
          { latitude: lat, longitude: lines.mc, altitude: 0 },
          { equatorial: true },
        );
        expect(alt.altitude).toBeCloseTo(90 - Math.abs(lat - point.declination), 3);
      }
    });

    it(`${name}: IC altitude is -(90 - |φ + δ|) at every latitude`, async () => {
      const { point, armc0 } = await starCase(name);
      const lines = fixedStarLines(name, point, armc0);
      const engine = await getEngine();
      for (const lat of PLACES) {
        const alt = await engine.azimuthAltitude(
          JD_2024,
          { longitude: point.rightAscension, latitude: point.declination },
          { latitude: lat, longitude: lines.ic, altitude: 0 },
          { equatorial: true },
        );
        expect(alt.altitude).toBeCloseTo(-(90 - Math.abs(lat + point.declination)), 3);
      }
    });

    it(`${name}: MC and IC match armcAtAngle through the ARMC relation`, async () => {
      const { point, armc0 } = await starCase(name);
      const lines = fixedStarLines(name, point, armc0);
      const mcArmc = armcAtAngle(point, 0, 'culminating');
      const icArmc = armcAtAngle(point, 0, 'anticulminating');
      expect(mcArmc).toBeDefined();
      expect(icArmc).toBeDefined();
      expect(Math.abs(angleDiff(armc0 + lines.mc, mcArmc ?? NaN))).toBeLessThan(1e-9);
      expect(Math.abs(angleDiff(armc0 + lines.ic, icArmc ?? NaN))).toBeLessThan(1e-9);
    });
  }
});

describe('fixedStarLines (#2018): AC and DC', () => {
  for (const name of STARS) {
    it(`${name}: AC points are on the eastern horizon, DC points on the western`, async () => {
      const { point, armc0 } = await starCase(name);
      const lines = fixedStarLines(name, point, armc0);
      const engine = await getEngine();
      const star = { longitude: point.rightAscension, latitude: point.declination };
      const sampled = [
        ...allSegmentPoints(lines.ac).map((p) => ({ p, east: true })),
        ...allSegmentPoints(lines.dc).map((p) => ({ p, east: false })),
      ];
      expect(sampled.length).toBeGreaterThan(0);
      for (const { p, east } of sampled) {
        const hz = await engine.azimuthAltitude(
          JD_2024,
          star,
          { latitude: p.latitude, longitude: p.longitude, altitude: 0 },
          { equatorial: true },
        );
        expect(hz.altitude).toBeCloseTo(0, 3);
        if (east) expect(hz.azimuth).toBeLessThan(180);
        else expect(hz.azimuth).toBeGreaterThan(180);
      }
    });

    it(`${name}: AC and DC match armcAtAngle through the ARMC relation`, async () => {
      const { point, armc0 } = await starCase(name);
      const lines = fixedStarLines(name, point, armc0);
      const checks: readonly (readonly [readonly (readonly HorizonLinePoint[])[], AngleEvent])[] = [
        [lines.ac, 'rising'],
        [lines.dc, 'setting'],
      ];
      for (const [segments, event] of checks) {
        for (const p of allSegmentPoints(segments)) {
          const armc = armcAtAngle(point, p.latitude, event);
          expect(armc).toBeDefined();
          expect(Math.abs(angleDiff(armc0 + p.longitude, armc ?? NaN))).toBeLessThan(1e-9);
        }
      }
    });

    it(`${name}: no AC or DC point beyond |φ| > 90 - |δ|`, async () => {
      const { point, armc0 } = await starCase(name);
      const lines = fixedStarLines(name, point, armc0);
      const limit = 90 - Math.abs(point.declination);
      for (const p of [...allSegmentPoints(lines.ac), ...allSegmentPoints(lines.dc)]) {
        expect(Math.abs(p.latitude)).toBeLessThanOrEqual(limit + 1e-9);
      }
    });
  }

  it('Regulus and Sirius: segments reach the |φ| = 90 - |δ| limit, not much short of it', async () => {
    for (const name of ['Regulus', 'Sirius'] as const) {
      const { point, armc0 } = await starCase(name);
      const lines = fixedStarLines(name, point, armc0);
      const limit = 90 - Math.abs(point.declination);
      const maxNorth = Math.max(...allSegmentPoints(lines.ac).map((p) => p.latitude));
      // Tolerance is 2°, not 1°: the sampler steps 1° in latitude (fixedStarLines, as horizonLine), so the last
      // sample can sit up to one full step short of the limit, and the 2° bound covers that step.
      expect(maxNorth).toBeGreaterThan(limit - 2);
    }
  });

  it('Regulus: the MC line longitude matches the ARMC of the same star culminating in parans() with itself at orb 0', async () => {
    // parans() returns angle pairs and orbs, not ARMC values. The star's culminating event is paired with itself
    // at orb 0; its ARMC is armcAtAngle(star, lat, 'culminating'), the same value parans() compares internally.
    const { point, armc0 } = await starCase('Regulus');
    const lines = fixedStarLines('Regulus', point, armc0);
    const lat = 30;
    const self = parans(point, point, lat, 0);
    expect(self).toContainEqual(expect.objectContaining({ angleA: 'culminating', angleB: 'culminating' }));
    const eventArmc = armcAtAngle(point, lat, 'culminating');
    expect(eventArmc).toBeDefined();
    expect(Math.abs(angleDiff(armc0 + lines.mc, eventArmc ?? NaN))).toBeLessThan(1e-9);
  });

  it('Menkar (|δ| < 5°): one segment per line covering ±85°', async () => {
    const { point, armc0 } = await starCase('Menkar');
    expect(Math.abs(point.declination)).toBeLessThan(5);
    const lines = fixedStarLines('Menkar', point, armc0);
    for (const segments of [lines.ac, lines.dc]) {
      expect(segments).toHaveLength(1);
      const first = segments[0]?.[0];
      const last = segments[0]?.[segments[0].length - 1];
      expect(first?.latitude).toBeCloseTo(-85, 9);
      expect(last?.latitude).toBeCloseTo(85, 9);
    }
  });
});
