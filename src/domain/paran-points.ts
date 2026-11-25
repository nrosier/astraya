/**
 * @module paran-points
 * @purpose Builds the coordinates the fixed-star and body-pair paran table reads: each point's right ascension and declination at each angle event's own instant (#2003).
 * @conventions A body's instant is the first rise, set, culmination or anti-culmination after 24 hours before the chart moment (`riseTransit`, topocentric disc centre at altitude 0, no refraction), so the window is the day leading up to the chart; its position is geocentric and equatorial there, except the Moon's, which is topocentric at the chart place (#2011). A star has no `BodyId`, so its instant is found from sidereal time: the moment the ARMC reaches the star's `armcAtAngle`, refined twice because the star moves slightly. An event the point does not have in that window (circumpolar, or never rising) is absent from its record, so no paran uses it. Tropical and equatorial whatever the zodiac.
 * @exports ParanPoints, paranPointsOf
 */
import {
  ANGLE_EVENTS,
  armcAtAngle,
  type AngleEvent,
  type EquatorialPoint,
  type EventPoints,
} from '../astrology/fixed-stars.js';
import { SE } from '../ephemeris/generated-constants.js';
import type {
  BodyId,
  Degrees,
  EphemerisProvider,
  GeoPosition,
  JulianDayUT,
  RiseTransitEvent,
} from '../ephemeris/types.js';

/** What the paran table reads: the latitude the chart is cast for and each point's equatorial position at each of its events. */
export interface ParanPoints {
  readonly latitude: Degrees;
  readonly bodies: ReadonlyMap<BodyId, EventPoints>;
  /** Keyed like `ChartData.fixedStars`: by the requested star key. */
  readonly stars: ReadonlyMap<string, EventPoints>;
}

const RISE_TRANSIT_EVENT: Readonly<Record<AngleEvent, RiseTransitEvent>> = {
  rising: 'rise',
  culminating: 'culminate',
  setting: 'set',
  anticulminating: 'anticulminate',
};

/** The sidereal day in solar days' degrees: how fast the ARMC advances per day. */
const ARMC_DEGREES_PER_DAY = 360.98564736629;
/** The window of events starts this long before the chart moment, in days. */
const WINDOW_START_DAYS = 1;

function norm360(degrees: Degrees): Degrees {
  return ((degrees % 360) + 360) % 360;
}

/** The Moon alone is taken from the chart place (#2003); every other body stays geocentric, as the table always held them. */
async function bodyPointAt(
  provider: EphemerisProvider,
  jd: JulianDayUT,
  body: BodyId,
  place: GeoPosition,
): Promise<EquatorialPoint> {
  // With `equatorial`, the library's `longitude` is right ascension and its `latitude` is declination.
  const position = await provider.position(
    jd,
    body,
    body === SE.SE_MOON ? { equatorial: true, observer: place } : { equatorial: true },
  );
  return { rightAscension: position.longitude, declination: position.latitude };
}

async function bodyEventPoints(
  provider: EphemerisProvider,
  body: BodyId,
  place: GeoPosition,
  start: JulianDayUT,
): Promise<EventPoints> {
  const points: Partial<Record<AngleEvent, EquatorialPoint>> = {};
  for (const event of ANGLE_EVENTS) {
    const instant = await provider.riseTransit(start, body, place, RISE_TRANSIT_EVENT[event], 'centre-topocentric');
    if (instant !== undefined) points[event] = await bodyPointAt(provider, instant, body, place);
  }
  return points;
}

/**
 * The star's position when it reaches `event`: the first moment after `start` at which the sidereal time equals the
 * ARMC of that event. Each step moves the instant forward by the ARMC still to go and re-reads the star there; the star
 * barely moves in a day, so two refinements settle it far below a second of time.
 */
async function starEventPoint(
  provider: EphemerisProvider,
  starId: string,
  latitude: Degrees,
  place: GeoPosition,
  start: JulianDayUT,
  event: AngleEvent,
): Promise<EquatorialPoint | undefined> {
  const read = async (jd: JulianDayUT): Promise<EquatorialPoint> => {
    const star = await provider.fixedStar(jd, starId, { equatorial: true });
    return { rightAscension: star.longitude, declination: star.latitude };
  };
  let jd = start;
  let point = await read(jd);
  for (let step = 0; step < 3; step += 1) {
    const target = armcAtAngle(point, latitude, event);
    if (target === undefined) return undefined;
    const { armc } = await provider.houses(jd, place, 'O');
    // The first pass looks forward only; a refinement may step a hair back.
    const gap = step === 0 ? norm360(target - armc) : norm360(target - armc + 180) - 180;
    jd += gap / ARMC_DEGREES_PER_DAY;
    point = await read(jd);
  }
  return point;
}

/**
 * The paran table's coordinates (#1407, #2003): every body and star at each of its own angle events in the 24 hours
 * before the chart moment. Both reads are tropical and equatorial, with no zodiac: a paran is the simultaneous rising,
 * culmination or setting of two points, which depends on right ascension and declination only.
 */
export async function paranPointsOf(
  jd: JulianDayUT,
  place: GeoPosition,
  bodyIds: readonly BodyId[],
  stars: readonly { readonly id: string; readonly key: string }[],
  provider: EphemerisProvider,
): Promise<ParanPoints> {
  const start = jd - WINDOW_START_DAYS;
  const [bodyEntries, starEntries] = await Promise.all([
    Promise.all(bodyIds.map(async (body) => [body, await bodyEventPoints(provider, body, place, start)] as const)),
    Promise.all(
      stars.map(async (star) => {
        const points: Partial<Record<AngleEvent, EquatorialPoint>> = {};
        for (const event of ANGLE_EVENTS) {
          const point = await starEventPoint(provider, star.id, place.latitude, place, start, event);
          if (point !== undefined) points[event] = point;
        }
        return [star.key, points] as const;
      }),
    ),
  ]);
  return { latitude: place.latitude, bodies: new Map(bodyEntries), stars: new Map(starEntries) };
}
