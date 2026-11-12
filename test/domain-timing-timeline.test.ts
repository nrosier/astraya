/**
 * Tests for the shared TimingTimelineEvent adapters (#554).
 *
 * The releasing/firdaria adapters are pure and tested with fixed inputs; the profections
 * adapter is tested against the real engine (via `computeProfections`), since `ProfectionData`
 * itself only comes from a real houses call.
 */
import { describe, expect, it } from 'vitest';
import { ASPECTS, DEFAULT_ORB_CONFIG, orbFor } from '../src/astrology/aspects.js';
import { bodyByKey } from '../src/astrology/bodies.js';
import { TROPICAL_YEAR_DAYS, progressedJulianDay } from '../src/astrology/progressions.js';
import { computeSolarArcDirections } from '../src/domain/solar-arc-directions.js';
import { findExactTransitAspects } from '../src/astrology/transit-events.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { computeTransitOrbWindows } from '../src/domain/transit-orb-windows.js';
import { periodicTransitToTimelineEvents } from '../src/domain/timing-timeline.js';
import type { TransitAspectEvent } from '../src/astrology/transit-events.js';
import type { PeriodicTransitForecast } from '../src/domain/periodic-transit.js';
import { firdariaPeriods } from '../src/astrology/firdaria.js';
import { zodiacalReleasingPeriods, zodiacalReleasingSubperiods } from '../src/astrology/zodiacal-releasing.js';
import { computeProfections } from '../src/domain/profections.js';
import type { SolarArcDirectionsData } from '../src/domain/solar-arc-directions.js';
import {
  eventMatchesBodyGroup,
  firdariaPeriodsToTimelineEvents,
  profectionToTimelineEvents,
  releasingPeriodsToTimelineEvents,
  releasingSubperiodsToTimelineEvents,
  solarArcToTimelineEvents,
  timingTimelineTracks,
  type TimingTimelineEvent,
} from '../src/domain/timing-timeline.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { arcsecondsBetween, getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

describe('releasingPeriodsToTimelineEvents (#554)', () => {
  it('carries each period’s own boundaries and labels it by sign and ruler', () => {
    const periods = zodiacalReleasingPeriods(35, 0, 2); // Taurus/Venus, then Gemini/Mercury
    const events = releasingPeriodsToTimelineEvents(periods, 'fortune');
    expect(events).toHaveLength(2);
    expect(events[0]?.kind).toBe('zodiacal-releasing');
    expect(events[0]?.startJd).toBe(periods[0]?.startJd);
    expect(events[0]?.endJd).toBe(periods[0]?.endJd);
    expect(events[0]?.subject).toEqual({
      kind: 'releasing',
      lot: 'fortune',
      level: 1,
      sign: 'Taurus',
      ruler: 'venus',
      loosingOfBond: false,
    });
    expect(events[0]?.sourceModule).toBe('astrology/zodiacal-releasing');
  });
});

describe('releasingSubperiodsToTimelineEvents (#554)', () => {
  it('keeps Level-2 periods on the zodiacal-releasing track and makes a bond release visible', () => {
    const parent = zodiacalReleasingPeriods(305, 0, 1)[0];
    if (parent === undefined) throw new Error('fixture bug: no parent period');
    const events = releasingSubperiodsToTimelineEvents(zodiacalReleasingSubperiods(parent), 'spirit');
    expect(
      events.some(
        (event) =>
          event.subject.kind === 'releasing' &&
          event.subject.level === 2 &&
          event.subject.sign === 'Leo' &&
          event.subject.ruler === 'sun' &&
          event.subject.loosingOfBond,
      ),
    ).toBe(true);
    expect(events.every((event) => event.kind === 'zodiacal-releasing')).toBe(true);
  });
});

describe('firdariaPeriodsToTimelineEvents (#554)', () => {
  it('carries each period’s own boundaries and labels it by ruler', () => {
    const periods = firdariaPeriods('day', 0, 2); // Sun then Venus
    const events = firdariaPeriodsToTimelineEvents(periods);
    expect(events).toHaveLength(2);
    expect(events[0]?.kind).toBe('firdaria');
    expect(events[0]?.subject).toEqual({ kind: 'firdaria', ruler: 'sun' });
    expect(events[0]?.startJd).toBe(periods[0]?.startJd);
    expect(events[0]?.endJd).toBe(periods[0]?.endJd);
  });
});

describe('profectionToTimelineEvents (#554)', () => {
  it('reconstructs year/month boundaries that bracket the target moment', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const targetJd = natalJd + 5.5 * 365.2425; // mid-way through age 5

    const profected = await computeProfections(NATAL, targetJd, engine);
    const [yearEvent, monthEvent] = profectionToTimelineEvents(profected);

    expect(yearEvent?.kind).toBe('profection-year');
    expect(yearEvent?.startJd).toBeLessThanOrEqual(targetJd);
    expect(yearEvent?.endJd).toBeGreaterThan(targetJd);

    expect(monthEvent?.kind).toBe('profection-month');
    expect(monthEvent?.startJd).toBeLessThanOrEqual(targetJd);
    expect(monthEvent?.endJd).toBeGreaterThan(targetJd);
    // The month window sits inside the year window.
    expect(monthEvent?.startJd ?? 0).toBeGreaterThanOrEqual(yearEvent?.startJd ?? 0);
    expect(monthEvent?.endJd ?? 0).toBeLessThanOrEqual(yearEvent?.endJd ?? 0);
  });
});

describe('timingTimelineTracks (#554)', () => {
  it('overlays at least three techniques on one requested date range', () => {
    const tracks = timingTimelineTracks(
      [
        {
          kind: 'zodiacal-releasing',
          startJd: 0,
          endJd: 100,
          subject: { kind: 'firdaria', ruler: 'mars' },
          sourceModule: 'fixture',
        },
        {
          kind: 'firdaria',
          startJd: 0,
          endJd: 100,
          subject: { kind: 'firdaria', ruler: 'sun' },
          sourceModule: 'fixture',
        },
        {
          kind: 'profection-year',
          startJd: 20,
          endJd: 40,
          subject: { kind: 'profection', sign: 'Leo', house: 5 },
          sourceModule: 'fixture',
        },
        {
          kind: 'transit',
          startJd: 30,
          endJd: 30,
          subject: { kind: 'aspect', from: 'mars', aspect: 'square', to: 'sun' },
          sourceModule: 'fixture',
        },
      ],
      25,
      35,
    );

    expect(tracks.filter((track) => track.events.length > 0).map((track) => track.track)).toEqual([
      'zodiacal-releasing',
      'firdaria',
      'profections',
      'transit',
    ]);
  });
});

describe('solarArcToTimelineEvents (#673)', () => {
  it('spans each contact’s active window, not only the day it is exact', () => {
    const contact = {
      bodyA: 0,
      bodyB: 1,
      aspect: ASPECTS[0],
      orb: 0.4,
      applying: true,
      exactJd: 2_460_000,
      activeFromJd: 2_459_635,
      activeUntilJd: 2_460_366,
    };
    const [event] = solarArcToTimelineEvents({ contacts: [contact] } as unknown as SolarArcDirectionsData);
    expect(event?.startJd).toBe(2_459_635);
    expect(event?.endJd).toBe(2_460_366);
    // So a page asking "what is active today" finds it months before and after the exact day.
    expect(
      timingTimelineTracks(event === undefined ? [] : [event], 2_459_800, 2_459_800).find(
        (t) => t.track === 'solar-arc',
      )?.events,
    ).toHaveLength(1);
  });
});

describe('the solar-arc track for a 1970-01-01 birth (#1498)', () => {
  const EPOCH_BIRTH: BirthMomentInput = {
    civil: { year: 1970, month: 1, day: 1, hour: 12, minute: 0, second: 0 },
    coordinates: { latitude: 52.37, longitude: 4.9 },
    offsetOverrideMinutes: 0,
  };

  it('has dated solar-arc events inside the window, each exact where the directed body meets the natal one', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(EPOCH_BIRTH));
    const windowEndJd = natalJd + 150 * TROPICAL_YEAR_DAYS;
    const data = await computeSolarArcDirections(EPOCH_BIRTH, natalJd + 40 * TROPICAL_YEAR_DAYS, engine);

    const events = solarArcToTimelineEvents(data);
    const track = timingTimelineTracks(events, natalJd, windowEndJd).find((t) => t.track === 'solar-arc');
    expect(track?.events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.kind === 'solar-arc')).toBe(true);

    const dated = data.contacts.filter((contact) => contact.exactJd !== undefined);
    expect(dated.length).toBe(events.length);
    const sun = bodyByKey('sun');
    if (sun === undefined) throw new Error('unreachable: sun is always in BODIES');
    const natal = await engine.positions(natalJd, [sun.id, ...dated.flatMap((c) => [c.bodyA, c.bodyB])]);
    const natalOf = (body: number): number => {
      const position = natal.find((p) => p.body === body);
      if (position === undefined) throw new Error('unreachable: natal position requested above');
      return position.longitude;
    };

    // Independent route: at the exact date the directed body (natal + arc) sits the aspect angle from the natal target.
    for (const contact of dated.slice(0, 10)) {
      const exactJd = contact.exactJd;
      if (exactJd === undefined) throw new Error('unreachable: filtered to dated contacts');
      expect(exactJd).toBeGreaterThanOrEqual(natalJd);
      expect(exactJd).toBeLessThanOrEqual(windowEndJd);
      const [progressedSun] = await engine.positions(progressedJulianDay(natalJd, exactJd), [sun.id]);
      const arc = (progressedSun?.longitude ?? 0) - natalOf(sun.id);
      const directed = natalOf(contact.bodyA) + arc;
      const target = natalOf(contact.bodyB);
      const miss = Math.min(
        arcsecondsBetween(directed, target + contact.aspect.angle),
        arcsecondsBetween(directed, target - contact.aspect.angle),
      );
      expect(miss).toBeLessThan(5);
    }
  });
});

describe('the bodies filter (#1260)', () => {
  const at = (subject: TimingTimelineEvent['subject']): TimingTimelineEvent => ({
    kind: 'x',
    startJd: 1,
    subject,
    sourceModule: 'test',
  });
  const aspect = (from: string, to: string): TimingTimelineEvent =>
    at({ kind: 'aspect', from, aspect: 'conjunction', to });
  const shows = (event: TimingTimelineEvent): readonly boolean[] =>
    (['all', 'major', 'minor'] as const).map((group) => eventMatchesBodyGroup(event, group));

  it('shows an event that names no body under every filter', () => {
    expect(shows(at({ kind: 'firdaria', ruler: 'sun' }))).toEqual([true, true, true]);
    expect(shows(at({ kind: 'profection', sign: 'Libra', house: 4 }))).toEqual([true, true, true]);
    expect(shows(at({ kind: 'return', which: 'solar-return' }))).toEqual([true, true, true]);
  });

  it('puts luminaries, planets, nodes and angles with the major planets', () => {
    expect(shows(aspect('sun', 'saturn'))).toEqual([true, true, false]);
    expect(shows(aspect('ascendant', 'trueNode'))).toEqual([true, true, false]);
  });

  it('puts Lilith, centaurs and asteroids in the minor group, whichever end names them', () => {
    expect(shows(aspect('sun', 'chiron'))).toEqual([true, false, true]);
    expect(shows(aspect('ceres', 'moon'))).toEqual([true, false, true]);
    expect(shows(aspect('meanLilith', 'venus'))).toEqual([true, false, true]);
    expect(shows(at({ kind: 'station', body: 'vesta', direction: 'retrograde' }))).toEqual([true, false, true]);
    expect(shows(at({ kind: 'station', body: 'mars', direction: 'direct' }))).toEqual([true, true, false]);
  });
});

describe('transit orb windows and pass numbers (#1401)', () => {
  // Transiting Pluto conjunct the natal Saturn of the fixed chart above: three exact passes in 2020 (direct 2020-01, retrograde 2020-05, direct 2020-10).
  async function plutoOverSaturn() {
    const engine = await getEngine();
    const natal = await computeChartData(NATAL, engine, {});
    const saturn = bodyByKey('saturn');
    const pluto = bodyByKey('pluto');
    if (saturn === undefined || pluto === undefined) throw new Error('unreachable: bodies exist');
    const natalLongitude = natal.positions.find((position) => position.body === saturn.id)?.longitude ?? 0;
    const from = await engine.julianDayFromUtc(2019, 1, 1, 12, 0, 0);
    const to = await engine.julianDayFromUtc(2022, 1, 1, 12, 0, 0);
    const events = await findExactTransitAspects(engine, [pluto.id], new Map([[saturn.id, natalLongitude]]), from, to);
    return { engine, events: events.filter((event) => event.aspect.key === 'conjunction'), pluto, saturn };
  }

  it('gives all three passes the same window and numbers them in date order, direct and retrograde', async () => {
    const { engine, events } = await plutoOverSaturn();
    expect(events.map((event) => event.retrograde)).toEqual([false, true, false]);
    const windows = await computeTransitOrbWindows(engine, events);
    const infos = events.map((event) => windows.get(event));
    expect(infos.map((info) => info?.pass)).toEqual([
      { number: 1, count: 3 },
      { number: 2, count: 3 },
      { number: 3, count: 3 },
    ]);
    const first = infos[0]?.window;
    expect(first).toBeDefined();
    for (const info of infos) expect(info?.window).toEqual(first);
    expect(first?.entryJd).toBeLessThan(events[0]?.jd ?? 0);
    expect(first?.exitJd).toBeGreaterThan(events[2]?.jd ?? 0);
  });

  it('measures the window with the orb Astraya already applies to the aspect, on the real positions', async () => {
    const { engine, events, pluto } = await plutoOverSaturn();
    const first = events[0];
    if (first === undefined) throw new Error('expected a first pass');
    const window = (await computeTransitOrbWindows(engine, events)).get(first)?.window;
    expect(window?.orb).toBe(orbFor('conjunction', 'planet', 'planet', DEFAULT_ORB_CONFIG));
    const exactLongitude = (await engine.position(events[0]?.jd ?? 0, pluto.id)).longitude;
    const gapAt = async (jd: number): Promise<number> => {
      const longitude = (await engine.position(jd, pluto.id)).longitude;
      return Math.abs(((((longitude - exactLongitude + 540) % 360) + 360) % 360) - 180);
    };
    // At the entry and exit dates the body is exactly one orb from the point; a day inside either one it is within it.
    expect(await gapAt(window?.entryJd ?? 0)).toBeCloseTo(window?.orb ?? 0, 3);
    expect(await gapAt(window?.exitJd ?? 0)).toBeCloseTo(window?.orb ?? 0, 3);
    expect(await gapAt((window?.entryJd ?? 0) + 1)).toBeLessThan(window?.orb ?? 0);
    expect(await gapAt((window?.exitJd ?? 0) - 1)).toBeLessThan(window?.orb ?? 0);
  });

  it('numbers a pass from the whole window even when only that pass is listed', async () => {
    const { engine, events } = await plutoOverSaturn();
    const second = events[1];
    if (second === undefined) throw new Error('expected a second pass');
    const info = (await computeTransitOrbWindows(engine, [second])).get(second);
    expect(info?.pass).toEqual({ number: 2, count: 3 });
  });
});

describe('forecast exact transits are listed once (owner decision, #1442)', () => {
  it('lists an exact transit once when the daily and weekly tiers both list it, and keeps a different transit', () => {
    const exact = (jd: number, body: number) =>
      ({
        kind: 'periodic-transit',
        startJd: jd - 2,
        endJd: jd + 2,
        exactJd: jd,
        jd,
        transitingBody: body,
        natalBody: 'sun',
        aspect: { key: 'trine', name: 'Trine', angle: 120, family: 'major' },
      }) as unknown as TransitAspectEvent;
    // The app computes each tier separately: the same exact transit arrives as equal objects in two tiers.
    const forecast = {
      daily: { exactToday: [exact(2461000.5, 1)], stationsToday: [] },
      weekly: { events: [exact(2461000.5, 1), exact(2461000.5, 2)], lunarReturns: { returns: [] } },
      monthly: { events: [], progressedLunarReturn: { returnJd: 0 } },
      yearly: { solarReturn: { returnJd: 0 }, demibirthday: { demibirthdayJd: 0 } },
    } as unknown as PeriodicTransitForecast;
    const exacts = periodicTransitToTimelineEvents(forecast).filter((event) => event.kind === 'periodic-transit');
    expect(exacts).toHaveLength(2);
  });
});
