/**
 * The heliocentric chart (#1407; owner decisions 2026-11-14): the Earth in the Sun's place, Mercury to Pluto and
 * Chiron seen from the Sun, no Moon, nodes, Lilith or points. Real Swiss Ephemeris through the engine harness.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { housesAreDefined } from '../src/domain/chart-compute.js';
import { positionRows } from '../src/domain/chart-tables.js';
import { computeHeliocentric, HELIOCENTRIC_BODY_KEYS } from '../src/domain/heliocentric.js';
import type { SwissEphemerisEngine } from '../src/ephemeris/engine.js';
import { SE } from '../src/ephemeris/generated-constants.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { arcsecondsBetween, getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

let engine: SwissEphemerisEngine;
let jd: number;

beforeAll(async () => {
  engine = await getEngine();
  jd = await julianDayFor(engine, resolveMoment(NATAL));
}, 60_000);

function idOf(key: string): number {
  const id = bodyByKey(key)?.id;
  if (id === undefined) throw new Error(`no body ${key}`);
  return id;
}

describe('computeHeliocentric (#1407)', () => {
  it('lists the Earth, Mercury to Pluto and Chiron, and no Sun, Moon, node or Lilith', async () => {
    const { heliocentric } = await computeHeliocentric(NATAL, engine);
    expect(heliocentric.positions.map((p) => p.body)).toEqual(HELIOCENTRIC_BODY_KEYS.map(idOf));
    const bodies = new Set(heliocentric.positions.map((p) => p.body));
    for (const key of ['sun', 'moon', 'meanNode', 'trueNode', 'meanLilith']) expect(bodies.has(idOf(key))).toBe(false);
    expect(idOf('earth')).toBe(SE.SE_EARTH);
  });

  it('puts the Earth opposite the geocentric Sun, within the aberration and light-time difference', async () => {
    const { heliocentric, natal } = await computeHeliocentric(NATAL, engine);
    const earth = heliocentric.positions.find((p) => p.body === SE.SE_EARTH);
    const sun = natal.positions.find((p) => p.body === SE.SE_SUN);
    if (earth === undefined || sun === undefined) throw new Error('missing Earth or Sun');
    // The geocentric Sun is apparent (annual aberration, about 20.5″) and the heliocentric Earth is not, so they
    // are not exactly opposite; 30″ allows for that, and a wrong frame would be off by degrees.
    expect(Math.abs(arcsecondsBetween(earth.longitude, sun.longitude + 180))).toBeLessThan(30);
  });

  it('reads each body from the engine’s heliocentric flag, not the geocentric chart', async () => {
    const { heliocentric, natal } = await computeHeliocentric(NATAL, engine);
    const mars = idOf('mars');
    const direct = await engine.position(jd, mars, { heliocentric: true });
    const helioMars = heliocentric.positions.find((p) => p.body === mars);
    const geoMars = natal.positions.find((p) => p.body === mars);
    expect(helioMars?.longitude).toBe(direct.longitude);
    // Mars seen from the Sun and from the Earth differ by its parallax, many degrees for an inner-system body.
    expect(Math.abs(arcsecondsBetween(helioMars?.longitude ?? 0, geoMars?.longitude ?? 0))).toBeGreaterThan(3600);
  });

  it('has no houses: every cusp and angle is undefined, so no body is given a house', async () => {
    const { heliocentric } = await computeHeliocentric(NATAL, engine);
    expect(housesAreDefined(heliocentric.houses)).toBe(false);
    expect(Number.isNaN(heliocentric.houses.ascendant)).toBe(true);
    expect(positionRows(heliocentric).every((row) => row.house === undefined)).toBe(true);
  });

  it('finds its own aspects between heliocentric bodies only, with the given orbs', async () => {
    const { heliocentric } = await computeHeliocentric(NATAL, engine);
    const ids = new Set(HELIOCENTRIC_BODY_KEYS.map(idOf));
    expect(heliocentric.aspects.length).toBeGreaterThan(0);
    for (const aspect of heliocentric.aspects) {
      expect(ids.has(aspect.bodyA) && ids.has(aspect.bodyB)).toBe(true);
    }
  });
});
