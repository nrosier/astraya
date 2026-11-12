/**
 * Tests for the chart-search timing subjects (#1405, owner answers 3, 7, 11, 13, 14, 15).
 *
 * Everything runs against the real Swiss Ephemeris engine (test/engine-harness.ts), never a mock.
 *
 * Reference values and their source: no ephemeris number is hard-coded. Each expectation is derived from an
 * independent route through the same engine, so a wrong subject cannot agree with itself by construction:
 * - Solar return moment: `computeSolarReturn` (the Sun's crossing of its natal longitude, `nextSunCrossing`),
 *   asserted again by Sun longitude of the cast chart against the natal Sun.
 * - Lunar return moments: `computeLunarReturns` over a window; the Moon of the cast chart is checked against the natal Moon.
 * - Transit angle contacts: the transiting longitude from `provider.positions`, the natal Ascendant from
 *   `provider.houses`, and the separation from `angularSeparation`, checked against the aspect angle and the
 *   orb limit the contact itself reports (`allowedOrb`, from `matchPointAspect`/`orbForPoint`).
 * - Natal house: `houseOf` over the natal cusps from `provider.houses`.
 * The natal moment (1990-06-15 14:30, UTC-5, 38.7478 N 85.0672 W) is the one the other domain tests use.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { angularSeparation, ASPECTS, DEFAULT_ORB_CONFIG } from '../src/astrology/aspects.js';
import { bodyByKey } from '../src/astrology/bodies.js';
import { houseOf } from '../src/astrology/emphasis.js';
import { ageInYears, mcArc, progressedJulianDay } from '../src/astrology/progressions.js';
import { signIndex } from '../src/astrology/signs.js';
import { computeSolarArcDirections } from '../src/domain/solar-arc-directions.js';
import {
  addCondition,
  evaluateCondition,
  evaluateSearch,
  MAX_SEARCH_CONDITIONS,
  searchScopes,
  validateSearch,
  type AspectCondition,
  type ChartSearch,
  type SearchCondition,
  type SearchScope,
  type SearchSubject,
} from '../src/domain/chart-search.js';
import { asOfJulianDay, buildSearchSubject, orUndefinedWhenNotFound } from '../src/domain/chart-search-timing.js';
import { returnInForceAtJd } from '../src/domain/life-event-return.js';
import { computeLunarReturns } from '../src/domain/lunar-returns.js';
import { computeSecondaryProgression } from '../src/domain/secondary-progression.js';
import { ReturnNotFoundError } from '../src/domain/return-chart.js';
import { computeSolarReturn } from '../src/domain/solar-return.js';
import type { EphemerisProvider, JulianDayUT } from '../src/ephemeris/types.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};
const PLACE = { ...NATAL.coordinates, altitude: 0 };

function bodyId(key: string): number {
  const definition = bodyByKey(key);
  if (definition === undefined) throw new Error(`no body ${key}`);
  return definition.id;
}

const SUN = bodyId('sun');
const MOON = bodyId('moon');
const SATURN = bodyId('saturn');

let engine: EphemerisProvider;
let natalJd: JulianDayUT;

beforeAll(async () => {
  engine = await getEngine();
  natalJd = await julianDayFor(engine, resolveMoment(NATAL));
}, 60_000);

function subjectFor(
  scopes: readonly SearchScope[],
  asOfJd: JulianDayUT,
  birthTimeKnown = true,
  settings = {},
): Promise<SearchSubject> {
  return buildSearchSubject({ natalMoment: NATAL, birthTimeKnown, settings, asOfJd, scopes }, engine);
}

function longitudeIn(positions: readonly { body: number; longitude: number }[], body: number): number {
  const found = positions.find((p) => p.body === body);
  if (found === undefined) throw new Error(`no position for ${body}`);
  return found.longitude;
}

describe('asOfJulianDay', () => {
  it('is the noon-UTC conversion the Transit and Progressions screens use', async () => {
    expect(await asOfJulianDay(engine, 2026, 11, 11)).toBe(await engine.julianDayFromUtc(2026, 11, 11, 12, 0, 0));
  });
});

describe('solar return in force (answer 3)', () => {
  it('is the previous year the day before a return and the new one on the return', async () => {
    const r2025 = (await computeSolarReturn(NATAL, 2025, engine)).returnJd;
    const r2024 = (await computeSolarReturn(NATAL, 2024, engine)).returnJd;

    expect((await returnInForceAtJd('solar-return', r2025 - 1, NATAL, engine)).returnJd).toBe(r2024);
    expect((await returnInForceAtJd('solar-return', r2025, NATAL, engine)).returnJd).toBe(r2025);
    expect((await returnInForceAtJd('solar-return', r2025 + 1, NATAL, engine)).returnJd).toBe(r2025);

    const before = await subjectFor(['solarReturn'], r2025 - 1);
    const on = await subjectFor(['solarReturn'], r2025);
    const natalSun = longitudeIn((await subjectFor([], r2025)).chart.positions, SUN);
    for (const subject of [before, on]) {
      const solar = subject.solarReturn;
      if (solar === undefined) throw new Error('expected a solar return chart');
      expect(angularSeparation(longitudeIn(solar.positions, SUN), natalSun)).toBeLessThan(0.05);
    }
    // The two years' returns are cast at different moments, so their Ascendants differ.
    expect(before.solarReturn?.houses.ascendant).not.toBeCloseTo(on.solarReturn?.houses.ascendant ?? -1, 3);
    const r2024Asc = (await engine.houses(r2024, PLACE, 'P')).ascendant;
    const r2025Asc = (await engine.houses(r2025, PLACE, 'P')).ascendant;
    expect(before.solarReturn?.houses.ascendant).toBeCloseTo(r2024Asc, 6);
    expect(on.solarReturn?.houses.ascendant).toBeCloseTo(r2025Asc, 6);
  }, 120_000);
});

describe('lunar return in force (answer 7)', () => {
  it('is the last lunar return at or before the as-of date', async () => {
    const start = natalJd + 3650;
    const window = await computeLunarReturns(NATAL, start, start + 120, engine);
    const [, second, third] = window.returns;
    if (second === undefined || third === undefined) throw new Error('expected at least three returns in 120 days');

    expect((await returnInForceAtJd('lunar-return', second.returnJd + 3, NATAL, engine)).returnJd).toBeCloseTo(
      second.returnJd,
      6,
    );
    expect((await returnInForceAtJd('lunar-return', third.returnJd - 3, NATAL, engine)).returnJd).toBeCloseTo(
      second.returnJd,
      6,
    );

    const subject = await subjectFor(['lunarReturn'], third.returnJd - 3);
    const lunar = subject.lunarReturn;
    if (lunar === undefined) throw new Error('expected a lunar return chart');
    const natalMoon = longitudeIn(subject.chart.positions, MOON);
    expect(angularSeparation(longitudeIn(lunar.positions, MOON), natalMoon)).toBeLessThan(0.05);
    const secondAsc = (await engine.houses(second.returnJd, PLACE, 'P')).ascendant;
    expect(lunar.houses.ascendant).toBeCloseTo(secondAsc, 3);
  }, 120_000);
});

describe('transit to the natal Ascendant and Midheaven (answer 11)', () => {
  /** The first day from `natalJd + 12000` whose transit has at least one contact to the natal Ascendant. */
  async function dayWithAscContact(): Promise<{ subject: SearchSubject; asOfJd: JulianDayUT }> {
    for (let day = 0; day < 40; day++) {
      const asOfJd = natalJd + 12000 + day;
      const subject = await subjectFor(['transit'], asOfJd);
      if (subject.transit?.angleContacts.some((c) => c.angle === 'asc')) return { subject, asOfJd };
    }
    throw new Error('no transit contact to the natal Ascendant in 40 days');
  }

  it('finds a body within the existing point orb and not one outside it', async () => {
    const { subject, asOfJd } = await dayWithAscContact();
    const transit = subject.transit;
    if (transit === undefined) throw new Error('expected a transit reference');
    const contact = transit.angleContacts.find((c) => c.angle === 'asc');
    if (contact === undefined) throw new Error('unreachable');

    const natalAsc = (await engine.houses(natalJd, PLACE, 'P')).ascendant;
    expect(subject.chart.houses.ascendant).toBeCloseTo(natalAsc, 6);
    const transiting = (await engine.positions(asOfJd, [contact.body]))[0];
    if (transiting === undefined) throw new Error('no transiting position');
    const separation = angularSeparation(transiting.longitude, natalAsc);
    expect(Math.abs(separation - contact.aspect.angle)).toBeLessThanOrEqual(contact.allowedOrb);

    const inOrb: AspectCondition = {
      kind: 'aspect',
      scope: 'transit',
      body: contact.body,
      aspectKey: contact.aspect.key,
      target: { kind: 'angle', angle: 'asc' },
    };
    expect(evaluateCondition(inOrb, subject).outcome).toBe('matched');

    // An aspect whose angle is farther from the separation than any orb the app uses (10 degrees at most).
    const farAspect = ASPECTS.find((a) => a.family === 'major' && Math.abs(separation - a.angle) > 10);
    if (farAspect === undefined) throw new Error('every major aspect is within 10 degrees');
    expect(evaluateCondition({ ...inOrb, aspectKey: farAspect.key }, subject).outcome).toBe('not-matched');
  }, 120_000);

  it('considers every transiting body, not only slow planets', async () => {
    const { subject } = await dayWithAscContact();
    const transitBodies = new Set(subject.transit?.positions.map((p) => p.body));
    expect(transitBodies.has(MOON)).toBe(true);
    expect(transitBodies.has(SUN)).toBe(true);
    expect(transitBodies.has(SATURN)).toBe(true);
  }, 120_000);

  it("uses the person's own orbs: a tighter scale finds no more contacts than the default", async () => {
    const asOfJd = natalJd + 12000;
    const normal = await subjectFor(['transit'], asOfJd);
    const tight = await subjectFor(['transit'], asOfJd, true, {
      orbConfig: { ...DEFAULT_ORB_CONFIG, scalePercent: -90 },
    });
    expect(tight.transit?.angleContacts.length ?? 0).toBeLessThanOrEqual(normal.transit?.angleContacts.length ?? 0);
    expect(tight.transit?.contacts.length ?? 0).toBeLessThanOrEqual(normal.transit?.contacts.length ?? 0);
  }, 120_000);
});

describe('direction-aware aspects (answer 13)', () => {
  function directed(contacts: NonNullable<SearchSubject['transit']>['contacts']): {
    forward: AspectCondition;
    reverse: AspectCondition;
  } {
    const has = (a: number, b: number, key: string): boolean =>
      contacts.some((c) => c.bodyA === a && c.bodyB === b && c.aspect.key === key);
    const contact = contacts.find((c) => c.bodyA !== c.bodyB && !has(c.bodyB, c.bodyA, c.aspect.key));
    if (contact === undefined) throw new Error('no one-way contact to test direction with');
    const make = (body: number, target: number): AspectCondition => ({
      kind: 'aspect',
      body,
      aspectKey: contact.aspect.key,
      target: { kind: 'body', body: target },
    });
    return { forward: make(contact.bodyA, contact.bodyB), reverse: make(contact.bodyB, contact.bodyA) };
  }

  it('transit: transiting X to natal Y is not natal X to transiting Y', async () => {
    const subject = await subjectFor(['transit'], natalJd + 12000);
    const { forward, reverse } = directed(subject.transit?.contacts ?? []);
    expect(evaluateCondition({ ...forward, scope: 'transit' }, subject).outcome).toBe('matched');
    expect(evaluateCondition({ ...reverse, scope: 'transit' }, subject).outcome).toBe('not-matched');
  }, 120_000);

  it('progression: progressed X to natal Y is not natal X to progressed Y', async () => {
    const subject = await subjectFor(['progression'], natalJd + 365.25 * 30);
    const { forward, reverse } = directed(subject.progression?.contacts ?? []);
    expect(evaluateCondition({ ...forward, scope: 'progression' }, subject).outcome).toBe('matched');
    expect(evaluateCondition({ ...reverse, scope: 'progression' }, subject).outcome).toBe('not-matched');
  }, 120_000);

  it('progression: keeps the progressed houses from computeSecondaryProgression, not the real sky', async () => {
    const asOfJd = natalJd + 365.25 * 30;
    const subject = await subjectFor(['progression'], asOfJd, true, { mcMethod: 'solarArc' });
    const direct = await computeSecondaryProgression(NATAL, asOfJd, engine, { mcMethod: 'solarArc' });
    expect(subject.progression?.houses?.ascendant).toBeCloseTo(direct.houses.ascendant, 6);
    const skyAsc = (await engine.houses(asOfJd, PLACE, 'P')).ascendant;
    expect(subject.progression?.houses?.ascendant).not.toBeCloseTo(skyAsc, 1);
  }, 120_000);
});

describe('house meaning (answer 14)', () => {
  it('a transit house condition is the natal house, read from the natal cusps', async () => {
    const subject = await subjectFor(['transit'], natalJd + 12000);
    const transit = subject.transit;
    if (transit === undefined) throw new Error('expected a transit reference');
    const natalCusps = (await engine.houses(natalJd, PLACE, 'P')).cusps;
    const lon = longitudeIn(transit.positions, SATURN);
    const natalHouse = houseOf(lon, natalCusps);
    const cond = (house: number): SearchCondition => ({ kind: 'house', scope: 'transit', body: SATURN, house });
    expect(evaluateCondition(cond(natalHouse), subject).outcome).toBe('matched');
    expect(evaluateCondition(cond((natalHouse % 12) + 1), subject).outcome).toBe('not-matched');

    // Some body sits in a different house of the transit chart than of the natal chart; the natal one wins.
    const differing = transit.positions.find(
      (p) =>
        transit.houses !== undefined && houseOf(p.longitude, transit.houses.cusps) !== houseOf(p.longitude, natalCusps),
    );
    if (differing === undefined) throw new Error('expected a body whose transit house differs from its natal house');
    const transitHouse = houseOf(differing.longitude, transit.houses?.cusps ?? []);
    expect(
      evaluateCondition({ kind: 'house', scope: 'transit', body: differing.body, house: transitHouse }, subject)
        .outcome,
    ).toBe('not-matched');
  }, 120_000);

  it('a return house condition is read in the return chart', async () => {
    const r2025 = (await computeSolarReturn(NATAL, 2025, engine)).returnJd;
    const subject = await subjectFor(['solarReturn'], r2025 + 1);
    const solar = subject.solarReturn;
    if (solar === undefined) throw new Error('expected a solar return chart');
    const house = houseOf(longitudeIn(solar.positions, MOON), solar.houses.cusps);
    expect(evaluateCondition({ kind: 'house', scope: 'solarReturn', body: MOON, house }, subject).outcome).toBe(
      'matched',
    );
    expect(
      evaluateCondition({ kind: 'house', scope: 'solarReturn', body: MOON, house: (house % 12) + 1 }, subject).outcome,
    ).toBe('not-matched');
  }, 120_000);
});

describe('unknown birth time and missing references (answer 12)', () => {
  it('is not-evaluable for house and Asc/MC conditions, but sign conditions still evaluate', async () => {
    const subject = await subjectFor(['transit', 'progression', 'solarReturn'], natalJd + 12000, false);
    const asc = { kind: 'angle', angle: 'asc' } as const;
    for (const scope of ['transit', 'progression', 'solarReturn'] as const) {
      const house = evaluateCondition({ kind: 'house', scope, body: SUN, house: 1 }, subject);
      expect(house.outcome).toBe('not-evaluable');
      expect(house.reason).toBe('birth-time-unknown');
      const angle = evaluateCondition(
        { kind: 'aspect', scope, body: SUN, aspectKey: 'conjunction', target: asc },
        subject,
      );
      expect(angle.outcome).toBe('not-evaluable');
      expect(angle.reason).toBe('birth-time-unknown');
    }
    expect(subject.transit?.angleContacts).toEqual([]);
    expect(evaluateCondition({ kind: 'sign', scope: 'transit', body: SUN, sign: 0 }, subject).outcome).not.toBe(
      'not-evaluable',
    );
  }, 120_000);

  it('combines three-valued with a timing condition', async () => {
    const subject = await subjectFor(['transit'], natalJd + 12000, false);
    const unevaluable: SearchCondition = { kind: 'house', scope: 'transit', body: SUN, house: 1 };
    const clearMiss: SearchCondition = { kind: 'sign', scope: 'transit', body: SUN, sign: 99 };
    const search = (operator: 'and' | 'or', conditions: readonly SearchCondition[]): ChartSearch => ({
      operator,
      conditions,
    });
    expect(evaluateSearch(search('and', [unevaluable, clearMiss]), subject).outcome).toBe('not-matched');
    expect(evaluateSearch(search('and', [unevaluable]), subject).outcome).toBe('not-evaluable');
    expect(evaluateSearch(search('or', [unevaluable, clearMiss]), subject).outcome).toBe('not-evaluable');
  }, 120_000);

  it('a scope that was not computed is not-evaluable with timing-unavailable', async () => {
    const subject = await subjectFor([], natalJd + 12000);
    const result = evaluateCondition({ kind: 'sign', scope: 'transit', body: SUN, sign: 0 }, subject);
    expect(result.outcome).toBe('not-evaluable');
    expect(result.reason).toBe('timing-unavailable');
  }, 120_000);
});

describe('condition cap (answer 10)', () => {
  it('holds at 10 across scopes', () => {
    let search: ChartSearch = { operator: 'and', conditions: [] };
    const scopes = ['natal', 'transit', 'progression', 'solarReturn', 'lunarReturn'] as const;
    for (let i = 0; i < MAX_SEARCH_CONDITIONS; i++) {
      const added = addCondition(search, {
        kind: 'sign',
        scope: scopes[i % scopes.length] ?? 'natal',
        body: SUN,
        sign: 0,
      });
      if (!added.ok) throw new Error('expected room');
      search = added.search;
    }
    expect(search.conditions).toHaveLength(10);
    expect(addCondition(search, { kind: 'sign', body: SUN, sign: 1 })).toEqual({
      ok: false,
      reason: 'too-many-conditions',
    });
    expect(searchScopes(search)).toEqual(['natal', 'transit', 'progression', 'solarReturn', 'lunarReturn']);
    const over: ChartSearch = {
      operator: 'or',
      conditions: [...search.conditions, { kind: 'sign', body: SUN, sign: 1 }],
    };
    expect(validateSearch(over)).toBe('too-many-conditions');
  });
});

describe('a return that cannot be found (answer 12)', () => {
  // The real engine always finds a Moon return inside the 29-day window (the Moon's period is about 27.3 days),
  // so the not-found case cannot be reached with a real date and no stub. These tests cover the typed branch
  // directly and do not claim an end-to-end not-found run.
  it('a ReturnNotFoundError becomes an absent scope, which the evaluator reports as timing-unavailable', async () => {
    const missing = await orUndefinedWhenNotFound<number>(() => Promise.reject(new ReturnNotFoundError('none')));
    expect(missing).toBeUndefined();
    const subject = await subjectFor(['transit'], natalJd + 12000);
    expect(subject.lunarReturn).toBeUndefined();
    const lunar = evaluateCondition({ kind: 'sign', scope: 'lunarReturn', body: SUN, sign: 0 }, subject);
    expect(lunar.outcome).toBe('not-evaluable');
    expect(lunar.reason).toBe('timing-unavailable');
    expect(evaluateCondition({ kind: 'sign', scope: 'natal', body: SUN, sign: 99 }, subject).outcome).toBe(
      'not-matched',
    );
    expect(evaluateCondition({ kind: 'sign', scope: 'transit', body: SUN, sign: 99 }, subject).outcome).toBe(
      'not-matched',
    );
  }, 120_000);

  it('a plain RangeError or Error is not swallowed', async () => {
    await expect(orUndefinedWhenNotFound(() => Promise.reject(new RangeError('bad input')))).rejects.toThrow(
      'bad input',
    );
    await expect(orUndefinedWhenNotFound(() => Promise.reject(new Error('engine failure')))).rejects.toThrow(
      'engine failure',
    );
  });

  it('a genuine provider failure still propagates out of buildSearchSubject', async () => {
    // A delegating wrapper, not an object inheriting from the engine: the engine's methods use private
    // fields, so a call through a prototype-only object fails with a receiver error instead of the stub's error.
    const broken: EphemerisProvider = new Proxy(engine, {
      get(target, property) {
        if (property === 'nextMoonCrossing') return () => Promise.reject(new Error('engine failure'));
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    await expect(
      buildSearchSubject(
        { natalMoment: NATAL, birthTimeKnown: true, settings: {}, asOfJd: natalJd + 12000, scopes: ['lunarReturn'] },
        broken,
      ),
    ).rejects.toThrow('engine failure');
  }, 120_000);
});

describe('solar-arc scope (#1486, cited to Tebbs, provisional)', () => {
  /** The solar arc at an as-of Julian day, from the natal and progressed Suns read straight from the engine. */
  async function arcAt(asOfJd: JulianDayUT): Promise<number> {
    const [natalSun] = await engine.positions(natalJd, [SUN]);
    const [progressedSun] = await engine.positions(progressedJulianDay(natalJd, asOfJd), [SUN]);
    if (natalSun === undefined || progressedSun === undefined) throw new Error('no Sun position');
    return mcArc('solarArc', ageInYears(natalJd, asOfJd), natalSun.longitude, progressedSun.longitude);
  }

  /** Read at test time: `natalJd` is set in `beforeAll`, after collection. */
  const asOf = (): JulianDayUT => natalJd + 12000;

  it('directs each body by the true solar arc, read independently from the engine', async () => {
    const subject = await subjectFor(['solarArc'], asOf());
    const solarArc = subject.solarArc;
    if (solarArc === undefined) throw new Error('expected a solar-arc reference');
    const arc = await arcAt(asOf());
    const natalMoon = longitudeIn(subject.chart.positions, MOON);
    const directedMoon = longitudeIn(solarArc.positions, MOON);
    expect(angularSeparation(directedMoon, (natalMoon + arc) % 360)).toBeLessThan(1e-6);
  }, 120_000);

  it('a sign condition reads the directed body sign, against the independent route', async () => {
    const subject = await subjectFor(['solarArc'], asOf());
    const arc = await arcAt(asOf());
    const directedSun = (longitudeIn(subject.chart.positions, SUN) + arc) % 360;
    const sign = signIndex(directedSun);
    const cond = (s: number): SearchCondition => ({ kind: 'sign', scope: 'solarArc', body: SUN, sign: s });
    expect(evaluateCondition(cond(sign), subject).outcome).toBe('matched');
    expect(evaluateCondition(cond((sign + 1) % 12), subject).outcome).toBe('not-matched');
  }, 120_000);

  it('a house condition reads the natal house of the directed body, from the natal cusps', async () => {
    const subject = await subjectFor(['solarArc'], asOf());
    const solarArc = subject.solarArc;
    if (solarArc === undefined) throw new Error('expected a solar-arc reference');
    const natalCusps = (await engine.houses(natalJd, PLACE, 'P')).cusps;
    const directedMoon = longitudeIn(solarArc.positions, MOON);
    const natalHouse = houseOf(directedMoon, natalCusps);
    const cond = (house: number): SearchCondition => ({ kind: 'house', scope: 'solarArc', body: MOON, house });
    expect(evaluateCondition(cond(natalHouse), subject).outcome).toBe('matched');
    expect(evaluateCondition(cond((natalHouse % 12) + 1), subject).outcome).toBe('not-matched');
  }, 120_000);

  it('an aspect condition is direction-aware: directed X to natal Y is not natal X to directed Y', async () => {
    const subject = await subjectFor(['solarArc'], asOf());
    const contacts = subject.solarArc?.contacts ?? [];
    const has = (a: number, b: number, key: string): boolean =>
      contacts.some((c) => c.bodyA === a && c.bodyB === b && c.aspect.key === key);
    const contact = contacts.find((c) => c.bodyA !== c.bodyB && !has(c.bodyB, c.bodyA, c.aspect.key));
    if (contact === undefined) throw new Error('no one-way solar-arc contact to test direction with');
    const forward: AspectCondition = {
      kind: 'aspect',
      scope: 'solarArc',
      body: contact.bodyA,
      aspectKey: contact.aspect.key,
      target: { kind: 'body', body: contact.bodyB },
    };
    const reverse: AspectCondition = { ...forward, body: contact.bodyB, target: { kind: 'body', body: contact.bodyA } };
    expect(evaluateCondition(forward, subject).outcome).toBe('matched');
    expect(evaluateCondition(reverse, subject).outcome).toBe('not-matched');
  }, 120_000);

  it('an unknown birth time makes house and angle conditions not-evaluable, and keeps sign conditions', async () => {
    const subject = await subjectFor(['solarArc'], asOf(), false);
    const house = evaluateCondition({ kind: 'house', scope: 'solarArc', body: MOON, house: 1 }, subject);
    expect(house.outcome).toBe('not-evaluable');
    expect(house.reason).toBe('birth-time-unknown');
    const angle = evaluateCondition(
      {
        kind: 'aspect',
        scope: 'solarArc',
        body: SUN,
        aspectKey: 'conjunction',
        target: { kind: 'angle', angle: 'asc' },
      },
      subject,
    );
    expect(angle.outcome).toBe('not-evaluable');
    expect(angle.reason).toBe('birth-time-unknown');
    expect(subject.solarArc?.angleContacts).toEqual([]);
    expect(evaluateCondition({ kind: 'sign', scope: 'solarArc', body: SUN, sign: 0 }, subject).outcome).not.toBe(
      'not-evaluable',
    );
  }, 120_000);

  it('a scope that was not computed is not-evaluable with timing-unavailable', async () => {
    const subject = await subjectFor([], asOf());
    const result = evaluateCondition({ kind: 'sign', scope: 'solarArc', body: SUN, sign: 0 }, subject);
    expect(result.outcome).toBe('not-evaluable');
    expect(result.reason).toBe('timing-unavailable');
  }, 120_000);

  it('contacts match computeSolarArcDirections for the same orbs, and the person orbs apply', async () => {
    const orbConfig = { ...DEFAULT_ORB_CONFIG, scalePercent: -40 };
    const subject = await subjectFor(['solarArc'], asOf(), true, { orbConfig });
    const direct = await computeSolarArcDirections(NATAL, asOf(), engine, { orbConfig });
    const key = (a: { bodyA: number; bodyB: number; aspect: { key: string } }): string =>
      `${a.bodyA}|${a.bodyB}|${a.aspect.key}`;
    const ours = (subject.solarArc?.contacts ?? []).map(key).sort();
    const theirs = direct.contacts.map(key).sort();
    expect(ours.length).toBeGreaterThan(0);
    expect(ours).toEqual(theirs);
    // A default-orb subject finds at least as many contacts as the tighter one.
    const wide = await subjectFor(['solarArc'], asOf());
    expect(wide.solarArc?.contacts.length ?? 0).toBeGreaterThanOrEqual(ours.length);
  }, 120_000);
});
