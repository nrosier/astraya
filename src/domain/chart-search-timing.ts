/**
 * @module chart-search-timing
 * @purpose Builds the `SearchSubject` a chart search needs for each timing scope (#1405): the natal chart, the sky at an as-of date read against it (transit), the secondary progression, the solar-arc directed chart (#1486), and the solar and lunar return in force at that date.
 * @conventions Pure over the `EphemerisProvider` parameter; no store, UI or sweph-wasm access. Only the scopes asked for are computed. Every compute call receives the person's own `SearchTimingSettings` (house system, zodiac, rulership, orbs, bodies; answer 15), so a search matches the person's chart and can differ from the Transit and Progressions screens, which use engine defaults; this is a recorded known gap. The as-of date becomes a Julian day with `provider.julianDayFromUtc(y, m, d, 12, 0, 0)`, noon UTC, the conversion the Transit and Progressions screens use; this is the chosen rule for the "today, local timezone" default (answer 6): the caller passes the user's local calendar date and it is read as that date at noon UTC. Transit: `computeTransit` (contacts already use `orbConfigForContext('transit', ...)`), plus every transiting body to the natal Ascendant and Midheaven with `matchPointAspect` under that same transit orb config (answer 11, no invented orb); the natal angle is a fixed point (speed 0). Progression: `computeSecondaryProgression` with the person's `mcMethod`; its positions, progressed houses and contacts are used as they come, never rebuilt into a `ChartData` from the real sky, and the progressed houses are carried for display only (house conditions read the natal cusps, answer 14); progression contacts use the person's own orbs (natal context). Returns: `returnInForceAtJd` (last return at or before the as-of date; a solar date before that year's return falls back to the previous year, answers 3 and 7) then `computeSolarReturnChart` or `computeLunarReturnChart` for that return, cast at the birth place with the person's settings and zodiac. Angle contacts are empty when the birth time is unknown or the houses have no solution. Solar arc (#1486, cited to Tebbs, provisional): the same true solar arc `computeSolarArcDirections` applies, every natal body directed by it, contacts found by `findCrossAspects` with the person's own orbs (no transit or synastry offset), natal houses shifted by the arc for display; no exact-date bisection, since search needs only the contacts. The directed body is `bodyA`, as for progression. Both Suns are read in the person's zodiac, as the directions module reads them (#1489), so the two agree exactly.
 * @exports asOfJulianDay, orUndefinedWhenNotFound, SearchTimingSettings, SearchTimingInput, buildSearchSubject
 */
import { findCrossAspects, matchPointAspect, DEFAULT_ORB_CONFIG, type OrbConfig } from '../astrology/aspects.js';
import { bodyById, bodyByKey, bodyIdsFor, type BodyCategory } from '../astrology/bodies.js';
import { orbConfigForContext } from '../astrology/orb-profiles.js';
import {
  ageInYears,
  mcArc,
  progressedJulianDay,
  shiftHouses,
  type ProgressedMcMethod,
} from '../astrology/progressions.js';
import { directedSubjects, directPositions, fixedNatalSubjects } from '../astrology/solar-arc-directions.js';
import type { BodyId, BodyPosition, EphemerisProvider, GeoPosition, JulianDayUT } from '../ephemeris/types.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type { BirthMomentInput } from '../time/types.js';
import {
  computeChartData,
  housesAreDefined,
  type AngleAspect,
  type ChartCalculationOptions,
  type ChartData,
} from './chart-compute.js';
import { returnInForceAtJd } from './life-event-return.js';
import { computeLunarReturnChart, computeSolarReturnChart, ReturnNotFoundError } from './return-chart.js';
import { SEARCH_SCOPES, type SearchScope, type SearchSubject, type TimingReference } from './chart-search.js';
import { computeSecondaryProgression } from './secondary-progression.js';
import { computeTransit } from './transit.js';

/** The person's own calculation settings (answer 15), plus their progressed-MC method. */
export interface SearchTimingSettings extends ChartCalculationOptions {
  /** Defaults to Naibod, as `computeSecondaryProgression` does. */
  readonly mcMethod?: ProgressedMcMethod;
}

export interface SearchTimingInput {
  readonly natalMoment: BirthMomentInput;
  /** False when the person's `timeAccuracy` is `'unknown'`. */
  readonly birthTimeKnown: boolean;
  readonly settings: SearchTimingSettings;
  readonly asOfJd: JulianDayUT;
  /** The scopes to compute; the natal chart is always computed. */
  readonly scopes: readonly SearchScope[];
}

/** The as-of calendar date as a Julian day: noon UTC, as the Transit and Progressions screens do. */
export function asOfJulianDay(
  provider: EphemerisProvider,
  year: number,
  month: number,
  day: number,
): Promise<JulianDayUT> {
  return provider.julianDayFromUtc(year, month, day, 12, 0, 0);
}

function pointPosition(longitude: number): BodyPosition {
  // A fixed natal point: speed 0, so applying/separating is the moving body's alone.
  return {
    body: -1,
    longitude,
    latitude: 0,
    distance: 1,
    longitudeSpeed: 0,
    latitudeSpeed: 0,
    distanceSpeed: 0,
    retrograde: false,
  };
}

/** Every moving body's aspect to the natal Ascendant and Midheaven, under `orbConfig`. */
function contactsToNatalAngles(
  moving: readonly BodyPosition[],
  natal: ChartData,
  birthTimeKnown: boolean,
  orbConfig: NonNullable<ChartCalculationOptions['orbConfig']>,
): readonly AngleAspect[] {
  if (!birthTimeKnown || !housesAreDefined(natal.houses)) return [];
  const angles = [
    { angle: 'asc', longitude: natal.houses.ascendant },
    { angle: 'mc', longitude: natal.houses.midheaven },
  ] as const;
  const contacts: AngleAspect[] = [];
  for (const { angle, longitude } of angles) {
    const point = pointPosition(longitude);
    for (const body of moving) {
      const definition = bodyById(body.body);
      if (definition === undefined) continue;
      const match = matchPointAspect(point, body, definition.category, orbConfig);
      if (match !== undefined) contacts.push({ ...match, angle, body: body.body });
    }
  }
  return contacts;
}

function place(moment: BirthMomentInput): GeoPosition {
  return { ...moment.coordinates, altitude: 0 };
}

function categoryOf(body: BodyId): BodyCategory {
  const definition = bodyById(body);
  if (definition === undefined) throw new Error(`unreachable: ${String(body)} is always one of BODIES`);
  return definition.category;
}

/**
 * The solar-arc reference (#1486): every natal body carried by the true solar arc, the same arc `computeSolarArcDirections`
 * applies, and the same contacts to the fixed natal chart, found with the person's own orbs (no offset: the directions
 * module passes its orbs to `findCrossAspects` unchanged). The exact-date bisection is not run: search needs only the
 * directed positions, contacts and houses. The directed body is `bodyA` of every contact; the natal Ascendant and
 * Midheaven are fixed points, so angle contacts read the same as for a transit or progression.
 */
async function solarArcReference(
  natalMoment: BirthMomentInput,
  birthTimeKnown: boolean,
  natal: ChartData,
  asOfJd: JulianDayUT,
  provider: EphemerisProvider,
  settings: SearchTimingSettings,
  orbs: OrbConfig,
): Promise<TimingReference> {
  const natalJd = await julianDayFor(provider, resolveMoment(natalMoment));
  const sun = bodyByKey('sun');
  if (sun === undefined) throw new Error('unreachable: sun is always in BODIES');
  const positionOptions = settings.zodiac === undefined ? undefined : { zodiac: settings.zodiac };

  const natalPositions = await provider.positions(natalJd, bodyIdsFor(settings), positionOptions);
  const natalSun = natalPositions.find((position) => position.body === sun.id);
  if (natalSun === undefined) throw new Error('unreachable: the ephemeris returned no position for the Sun');
  // Both Suns are read in the person's zodiac, as `computeSolarArcDirections` reads them (#1489).
  const [progressedSun] = await provider.positions(progressedJulianDay(natalJd, asOfJd), [sun.id], positionOptions);
  if (progressedSun === undefined) throw new Error('unreachable: the ephemeris returned no position for the Sun');

  const arc = mcArc('solarArc', ageInYears(natalJd, asOfJd), natalSun.longitude, progressedSun.longitude);
  const directed = directedSubjects(directPositions(natalPositions, arc), categoryOf, progressedSun.longitudeSpeed);
  const directedPositions = directed.map((subject) => subject.position);
  const contacts = findCrossAspects(directed, fixedNatalSubjects(natalPositions, categoryOf), orbs);

  return {
    positions: directedPositions,
    contacts,
    angleContacts: contactsToNatalAngles(directedPositions, natal, birthTimeKnown, orbs),
    houses: shiftHouses(natal.houses, arc),
  };
}

/** The `computeSecondaryProgression` options for a person's settings. */
function progressionOptions(settings: SearchTimingSettings): Parameters<typeof computeSecondaryProgression>[3] {
  return {
    ...(settings.orbConfig === undefined ? {} : { orbConfig: settings.orbConfig }),
    ...(settings.houseSystem === undefined ? {} : { houseSystem: settings.houseSystem }),
    ...(settings.mcMethod === undefined ? {} : { mcMethod: settings.mcMethod }),
    ...(settings.zodiac === undefined ? {} : { zodiac: settings.zodiac }),
    ...(settings.includePholus === true ? { includePholus: true } : {}),
  };
}

/** The result of `build`, or undefined when it fails with `ReturnNotFoundError`; every other error propagates. */
export async function orUndefinedWhenNotFound<T>(build: () => Promise<T>): Promise<T | undefined> {
  try {
    return await build();
  } catch (error) {
    if (error instanceof ReturnNotFoundError) return undefined;
    throw error;
  }
}

/**
 * The subject for one person: the natal chart plus a reference for each requested scope. A scope not requested
 * leaves its field absent, which the evaluator reports as not-evaluable (`timing-unavailable`). A return that cannot be
 * found (`ReturnNotFoundError`) leaves only that scope's field absent, so the evaluator reports `timing-unavailable`
 * for that scope (answer 12); the other scopes are still built. Any other failure, a genuine engine error, propagates.
 */
export async function buildSearchSubject(
  input: SearchTimingInput,
  provider: EphemerisProvider,
): Promise<SearchSubject> {
  const { natalMoment, birthTimeKnown, settings, asOfJd } = input;
  const wanted = new Set<SearchScope>(SEARCH_SCOPES.filter((scope) => input.scopes.includes(scope)));
  const baseOrbs = settings.orbConfig ?? DEFAULT_ORB_CONFIG;

  const transitData = wanted.has('transit') ? await computeTransit(natalMoment, asOfJd, provider, settings) : undefined;
  const natal = transitData?.natal ?? (await computeChartData(natalMoment, provider, settings));

  const transit: TimingReference | undefined =
    transitData === undefined
      ? undefined
      : {
          positions: transitData.transit.positions,
          contacts: transitData.contacts,
          angleContacts: contactsToNatalAngles(
            transitData.transit.positions,
            natal,
            birthTimeKnown,
            orbConfigForContext('transit', baseOrbs),
          ),
          houses: transitData.transit.houses,
        };

  let progression: TimingReference | undefined;
  if (wanted.has('progression')) {
    const progressed = await computeSecondaryProgression(natalMoment, asOfJd, provider, progressionOptions(settings));
    progression = {
      positions: progressed.positions,
      contacts: progressed.contacts,
      angleContacts: contactsToNatalAngles(progressed.positions, natal, birthTimeKnown, baseOrbs),
      houses: progressed.houses,
    };
  }

  const returnOptions = { ...settings, place: place(natalMoment) };
  let solarArc: TimingReference | undefined;
  if (wanted.has('solarArc')) {
    solarArc = await solarArcReference(natalMoment, birthTimeKnown, natal, asOfJd, provider, settings, baseOrbs);
  }

  let solarReturn: ChartData | undefined;
  if (wanted.has('solarReturn')) {
    solarReturn = await orUndefinedWhenNotFound(async () => {
      const inForce = await returnInForceAtJd('solar-return', asOfJd, natalMoment, provider, settings.zodiac);
      return (await computeSolarReturnChart(natalMoment, inForce.year, provider, returnOptions)).chart;
    });
  }
  let lunarReturn: ChartData | undefined;
  if (wanted.has('lunarReturn')) {
    lunarReturn = await orUndefinedWhenNotFound(async () => {
      const inForce = await returnInForceAtJd('lunar-return', asOfJd, natalMoment, provider, settings.zodiac);
      // The chart search starts just before the return so the first return found is the one in force.
      return (await computeLunarReturnChart(natalMoment, inForce.returnJd - 0.5, provider, returnOptions)).chart;
    });
  }

  return {
    chart: natal,
    birthTimeKnown,
    ...(transit === undefined ? {} : { transit }),
    ...(progression === undefined ? {} : { progression }),
    ...(solarArc === undefined ? {} : { solarArc }),
    ...(solarReturn === undefined ? {} : { solarReturn }),
    ...(lunarReturn === undefined ? {} : { lunarReturn }),
  };
}
