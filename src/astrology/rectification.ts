/**
 * Birth-time rectification (#408, #1445): narrowing an uncertain birth time by testing candidate times
 * against the dates of known life events.
 *
 * The idea is the one every rectification starts from: the Ascendant and Midheaven move through
 * the whole zodiac in a day, so they are the points that change with the birth time — a planet's
 * position hardly does. If an event in someone's life lines up with a technique's contact to an
 * angle, the angle was probably about where that candidate time puts it. This module counts those
 * alignments for each candidate and ranks the candidates by the count.
 *
 * **It narrows; it does not prove.** A rectified time is a better-supported guess, never a
 * measurement: the score is a count of coincidences, some of which are chance, so each result also
 * carries its `lift` over the average candidate — a time that scores only like the average has
 * explained nothing. The screen says so too.
 *
 * **Citation pending.** The scoring method below (Solar Arc directed angles and slow-planet transits
 * to the angles) has no verified published source yet (#1445). The only verified source is Huber's
 * rectification article, and it supports only the principle of rectifying against dated events
 * (dates accurate to within a month; at least five dates for a margin up to 30 minutes, ten up to two
 * hours); its own method is the apex/prime point, not this one. The convention is stated, not hidden:
 *
 * - **Solar-arc directions**: the secondary-progressed Sun's arc since birth, applied to a point,
 *   carries it forward about a degree a year. A contact counts when a directed angle (Ascendant or
 *   Midheaven) falls on a natal planet, or a directed planet on a natal angle, by conjunction,
 *   square or opposition. An opposition to the Ascendant or Midheaven is a contact with the
 *   Descendant or Imum Coeli.
 * - **Transits to the angles**: Jupiter, Saturn, Uranus, Neptune, Pluto and the mean lunar node —
 *   the slow bodies, whose contact lasts long enough to line up with a dated event — conjunct,
 *   square or opposite the natal Ascendant or Midheaven.
 * - **Orb** (owner decision, #1445; Tebbs): one limit of 3 degrees for every contact (`RECTIFICATION_ORB_LIMIT`), which Tebbs gives only as the outer limit when building the natal hook; her directed-contact orb is 1 degree, a pending change (#1445). Previously the existing transit orb of the body involved (`orbLimitFor` on
 *   the daily transit preset of `transit-importance.ts`); no orb is invented here.
 * - **Weight** (owner decision, #1445, revised 2026-11-11): equal across contact types, scaled by
 *   closeness. A contact adds `1 − orb / limit`: 1 at exact, falling in a straight line to 0 at its
 *   orb limit, and a contact outside the orb adds nothing. This is the same orb multiplier the transit
 *   importance score uses (`transit-importance.ts`), so the fall-off is not a new number either.
 *   Every event counts equally; the user chooses which events to include.
 *
 * Planets are taken at the candidate's own birth moment, so the Moon — which moves a degree every
 * two hours — also helps tell candidates apart, in the directed and natal roles alike.
 */

/**
 * @module Rectification
 * @purpose Narrows an uncertain birth time by scoring candidate birth moments against dated life events using solar-arc and slow-body transit contacts to the angles.
 * @conventions Scoring method citation pending (#1445). Each contact (conjunction, square or opposition) adds an equal-weight, closeness-scaled score (`contactPoints`: 1 − orb/limit, the transit importance orb multiplier; nothing outside the orb, no type weights); its orb is the body's existing transit orb (`orbLimitFor` on the daily transit preset), so none is new; transits come from Jupiter to Pluto and the mean lunar node; results report a `lift` over the mean candidate score via `rectification-lift.ts`; contacts keep their event index so a subset of events can be re-scored without a new search; capped at MAX_RECTIFICATION_CANDIDATES.
 * @exports contactOrbLimit, contactOrb, contactPoints, scoreCandidate, MAX_RECTIFICATION_CANDIDATES, rectify
 */
import { bodyByKey } from './bodies.js';
import { ageInYears } from './progressions.js';
import { liftOf, windowAverage } from './rectification-lift.js';
import type { BodyId, Degrees, EphemerisProvider, GeoPosition, HouseSystem, JulianDayUT } from '../ephemeris/types.js';

/** The daily transit rule set, whose per-body orbs the contacts use (no orb of this tool's own). */

/**
 * The orb limit for every contact, Solar Arc or transit, for any body. Tebbs (Complete Book of Chart Rectification)
 * says to consider exact contacts first, then within 1, 2 and up to 3 degrees, and that the closer the orb the more
 * important the contact. The score falls in a straight line from 1 at exact to 0 at this limit.
 * Tebbs gives 1 degree for directions and progressions, and 3 degrees only as the outer limit when building the
 * natal hook. Directed contacts now use the 1 degree limit (#1445); transit contacts keep this 3 degree limit.
 */
export const RECTIFICATION_ORB_LIMIT: Degrees = 3;

/**
 * The orb limit for directed (Solar Arc) contacts: 1 degree, Tebbs's directed-contact orb (owner decision, #1445,
 * 2026-11-11). The 3 degree `RECTIFICATION_ORB_LIMIT` stays the transit limit, since no decision moved it.
 */
export const RECTIFICATION_DIRECTED_ORB_LIMIT: Degrees = 1;

/** The orb limit for a contact of the given technique (#1445). Directed contacts use the 1 degree limit. */
export function contactOrbLimit(_bodyKey: string, technique: RectificationTechnique = 'transit'): Degrees {
  return technique === 'solar-arc' ? RECTIFICATION_DIRECTED_ORB_LIMIT : RECTIFICATION_ORB_LIMIT;
}

const ANGLE_KEYS: readonly string[] = ['asc', 'mc'];

const DEFAULT_HOUSE_SYSTEM: HouseSystem = 'P';

/** The aspects that count: conjunction, square and opposition — the hard, event-marking ones. */
const CONTACT_ANGLES: readonly { readonly key: 'conjunction' | 'square' | 'opposition'; readonly angle: Degrees }[] = [
  { key: 'conjunction', angle: 0 },
  { key: 'square', angle: 90 },
  { key: 'opposition', angle: 180 },
];

/** Bodies that are directed and received: the luminaries and the planets. */
const CHART_BODY_KEYS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
/** The slow bodies whose transits to the angles count: Jupiter to Pluto and the mean lunar node. */
const SLOW_TRANSIT_KEYS = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'meanNode'];

export type RectificationTechnique = 'solar-arc' | 'transit';

/** A dated life event the candidate times are tested against. */
export interface RectificationEvent {
  readonly label: string;
  readonly jd: JulianDayUT;
}

export interface RectificationContact {
  readonly eventIndex: number;
  readonly technique: RectificationTechnique;
  /** The moving point: `'asc'`/`'mc'` directed, a directed body key, or a transiting body key. */
  readonly moving: string;
  /** The natal point it touches: a body key, `'asc'` or `'mc'`. */
  readonly natal: string;
  readonly aspect: 'conjunction' | 'square' | 'opposition';
  /** Distance from exact, in degrees. */
  readonly orb: Degrees;
  /** The orb limit this contact was admitted under (the body's transit orb). */
  readonly orbLimit: Degrees;
  /** What the contact adds to the raw score: {@link contactPoints} of its orb and limit. */
  readonly points: number;
}

export interface CandidateScore {
  /** The candidate birth moment. */
  readonly jd: JulianDayUT;
  readonly ascendant: Degrees;
  readonly midheaven: Degrees;
  readonly score: number;
  readonly contacts: readonly RectificationContact[];
}

function norm360(degrees: Degrees): Degrees {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

/** The smaller of the two arcs between two longitudes, in [0, 180]. */
function separation(a: Degrees, b: Degrees): Degrees {
  const diff = norm360(a - b);
  return diff > 180 ? 360 - diff : diff;
}

/**
 * How close `moving` is to making `aspectAngle` to `natal`, in degrees, or `undefined` outside `maxOrb`.
 */
export function contactOrb(
  moving: Degrees,
  natal: Degrees,
  aspectAngle: Degrees,
  maxOrb: Degrees,
): Degrees | undefined {
  const orb = Math.abs(separation(moving, natal) - aspectAngle);
  return orb <= maxOrb ? orb : undefined;
}

/**
 * What one contact adds (owner decision, #1445): equal weight for every contact type, scaled by closeness, 1 at
 * exact and falling in a straight line to 0 at the orb limit; nothing outside the orb. The fall-off is the transit
 * importance orb multiplier (`transit-importance.ts`).
 */
export function contactPoints(orb: Degrees, orbLimit: Degrees): number {
  if (!(orbLimit > 0) || orb > orbLimit) return 0;
  return Math.max(0, 1 - orb / orbLimit);
}

interface Point {
  readonly key: string;
  readonly longitude: Degrees;
}

/**
 * Every contact between `moving` points and `natal` points that falls within the orb of the body involved (the
 * moving or the natal point, whichever is not an angle).
 */
function contactsBetween(
  eventIndex: number,
  technique: RectificationTechnique,
  moving: readonly Point[],
  natal: readonly Point[],
): readonly RectificationContact[] {
  const contacts: RectificationContact[] = [];
  for (const mover of moving) {
    for (const target of natal) {
      if (mover.key === target.key) continue;
      const maxOrb = contactOrbLimit(ANGLE_KEYS.includes(mover.key) ? target.key : mover.key, technique);
      for (const { key, angle } of CONTACT_ANGLES) {
        const orb = contactOrb(mover.longitude, target.longitude, angle, maxOrb);
        if (orb === undefined) continue;
        contacts.push({
          eventIndex,
          technique,
          moving: mover.key,
          natal: target.key,
          aspect: key,
          orb,
          orbLimit: maxOrb,
          points: contactPoints(orb, maxOrb),
        });
      }
    }
  }
  return contacts;
}

export interface RectificationOptions {
  readonly houseSystem?: HouseSystem;
}

function bodyIds(keys: readonly string[]): readonly { key: string; id: BodyId }[] {
  return keys.flatMap((key) => {
    const body = bodyByKey(key);
    return body === undefined ? [] : [{ key, id: body.id }];
  });
}

/** How well one candidate birth moment fits the events. */
export async function scoreCandidate(
  provider: EphemerisProvider,
  place: GeoPosition,
  candidateJd: JulianDayUT,
  events: readonly RectificationEvent[],
  options: RectificationOptions = {},
): Promise<CandidateScore> {
  const sun = bodyByKey('sun');
  if (sun === undefined) throw new Error('unreachable: the Sun is always in BODIES');
  const houses = await provider.houses(candidateJd, place, options.houseSystem ?? DEFAULT_HOUSE_SYSTEM);
  if (!Number.isFinite(houses.ascendant) || !Number.isFinite(houses.midheaven)) {
    throw new RangeError('No Ascendant or Midheaven can be cast for this place and time.');
  }

  const chartBodies = bodyIds(CHART_BODY_KEYS);
  const natalPositions = await provider.positions(
    candidateJd,
    chartBodies.map((body) => body.id),
  );
  const natalBodies: Point[] = chartBodies.map((body, index) => ({
    key: body.key,
    longitude: natalPositions[index]?.longitude ?? Number.NaN,
  }));
  const natalAngles: Point[] = [
    { key: 'asc', longitude: houses.ascendant },
    { key: 'mc', longitude: houses.midheaven },
  ];
  const natalSun = natalBodies.find((body) => body.key === 'sun')?.longitude ?? Number.NaN;

  const slow = bodyIds(SLOW_TRANSIT_KEYS);
  const contacts: RectificationContact[] = [];
  for (const [eventIndex, event] of events.entries()) {
    // The solar arc: how far the progressed Sun (a day of motion per year of age) has moved.
    const age = ageInYears(candidateJd, event.jd);
    const progressedSun = await provider.position(candidateJd + age, sun.id);
    const arc = progressedSun.longitude - natalSun;
    const directedAngles = natalAngles.map((angle) => ({ key: angle.key, longitude: norm360(angle.longitude + arc) }));
    const directedBodies = natalBodies.map((body) => ({ key: body.key, longitude: norm360(body.longitude + arc) }));
    contacts.push(
      ...contactsBetween(eventIndex, 'solar-arc', directedAngles, natalBodies),
      ...contactsBetween(eventIndex, 'solar-arc', directedBodies, natalAngles),
    );

    const transits = await provider.positions(
      event.jd,
      slow.map((body) => body.id),
    );
    const transiting: Point[] = slow.map((body, index) => ({
      key: body.key,
      longitude: transits[index]?.longitude ?? Number.NaN,
    }));
    contacts.push(...contactsBetween(eventIndex, 'transit', transiting, natalAngles));
  }

  return {
    jd: candidateJd,
    ascendant: houses.ascendant,
    midheaven: houses.midheaven,
    contacts,
    score: contacts.reduce((total, contact) => total + contact.points, 0),
  };
}

export interface RankedCandidate extends CandidateScore {
  /** This candidate's score divided by the average over all candidates: 1 is no better than chance. */
  readonly lift: number;
}

/** Refuse a search over more candidates than this: it is for reading, and for a tab to finish. */
export const MAX_RECTIFICATION_CANDIDATES = 1500;

/**
 * Scores every candidate and ranks them, best first. `lift` is each score over the mean score of
 * all candidates, so a flat field (every time explains the events about equally) is visible as
 * lifts near 1 rather than hidden behind a "best" time.
 */
export async function rectify(
  provider: EphemerisProvider,
  place: GeoPosition,
  candidateJds: readonly JulianDayUT[],
  events: readonly RectificationEvent[],
  options: RectificationOptions = {},
): Promise<readonly RankedCandidate[]> {
  if (events.length === 0) throw new RangeError('add at least one dated event');
  if (candidateJds.length === 0) throw new RangeError('no candidate times to test');
  if (candidateJds.length > MAX_RECTIFICATION_CANDIDATES) {
    throw new RangeError(
      `${String(candidateJds.length)} candidate times is more than the ${String(MAX_RECTIFICATION_CANDIDATES)} allowed — shorten the range or use a longer step.`,
    );
  }
  const scored: CandidateScore[] = [];
  for (const jd of candidateJds) scored.push(await scoreCandidate(provider, place, jd, events, options));
  const mean = windowAverage(scored.map((candidate) => candidate.score));
  return scored
    .map((candidate) => ({ ...candidate, lift: liftOf(candidate.score, mean) }))
    .sort((a, b) => b.score - a.score || a.jd - b.jd);
}
