/**
 * @module chart-search-timing
 * @purpose Builds the `SearchSubject` a chart search needs for each timing scope (#1405): the natal chart, the sky at an as-of date read against it (transit), the secondary progression, and the solar and lunar return in force at that date.
 * @conventions Pure over the `EphemerisProvider` parameter; no store, UI or sweph-wasm access. Only the scopes asked for are computed. Every compute call receives the person's own `SearchTimingSettings` (house system, zodiac, rulership, orbs, bodies; answer 15), so a search matches the person's chart and can differ from the Transit and Progressions screens, which use engine defaults; this is a recorded known gap. The as-of date becomes a Julian day with `provider.julianDayFromUtc(y, m, d, 12, 0, 0)`, noon UTC, the conversion the Transit and Progressions screens use; this is the chosen rule for the "today, local timezone" default (answer 6): the caller passes the user's local calendar date and it is read as that date at noon UTC. Transit: `computeTransit` (contacts already use `orbConfigForContext('transit', ...)`), plus every transiting body to the natal Ascendant and Midheaven with `matchPointAspect` under that same transit orb config (answer 11, no invented orb); the natal angle is a fixed point (speed 0). Progression: `computeSecondaryProgression` with the person's `mcMethod`; its positions, progressed houses and contacts are used as they come, never rebuilt into a `ChartData` from the real sky, and the progressed houses are carried for display only (house conditions read the natal cusps, answer 14); progression contacts use the person's own orbs (natal context). Returns: `returnInForceAtJd` (last return at or before the as-of date; a solar date before that year's return falls back to the previous year, answers 3 and 7) then `computeSolarReturnChart` or `computeLunarReturnChart` for that return, cast at the birth place with the person's settings and zodiac. Angle contacts are empty when the birth time is unknown or the houses have no solution.
 * @exports asOfJulianDay, SearchTimingSettings, SearchTimingInput, buildSearchSubject
 */
import { matchPointAspect, DEFAULT_ORB_CONFIG } from '../astrology/aspects.js';
import { bodyById } from '../astrology/bodies.js';
import { orbConfigForContext } from '../astrology/orb-profiles.js';
import type { ProgressedMcMethod } from '../astrology/progressions.js';
import type { BodyPosition, EphemerisProvider, GeoPosition, JulianDayUT } from '../ephemeris/types.js';
import type { BirthMomentInput } from '../time/types.js';
import {
  computeChartData,
  housesAreDefined,
  type AngleAspect,
  type ChartCalculationOptions,
  type ChartData,
} from './chart-compute.js';
import { returnInForceAtJd } from './life-event-return.js';
import { computeLunarReturnChart, computeSolarReturnChart } from './return-chart.js';
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

/**
 * The subject for one person: the natal chart plus a reference for each requested scope. A scope not requested
 * leaves its field absent, which the evaluator reports as not-evaluable (`timing-unavailable`). Compute failures
 * (including a return that cannot be found) propagate.
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
  let solarReturn: ChartData | undefined;
  if (wanted.has('solarReturn')) {
    const inForce = await returnInForceAtJd('solar-return', asOfJd, natalMoment, provider, settings.zodiac);
    solarReturn = (await computeSolarReturnChart(natalMoment, inForce.year, provider, returnOptions)).chart;
  }
  let lunarReturn: ChartData | undefined;
  if (wanted.has('lunarReturn')) {
    const inForce = await returnInForceAtJd('lunar-return', asOfJd, natalMoment, provider, settings.zodiac);
    // The chart search starts just before the return so the first return found is the one in force.
    lunarReturn = (await computeLunarReturnChart(natalMoment, inForce.returnJd - 0.5, provider, returnOptions)).chart;
  }

  return {
    chart: natal,
    birthTimeKnown,
    ...(transit === undefined ? {} : { transit }),
    ...(progression === undefined ? {} : { progression }),
    ...(solarReturn === undefined ? {} : { solarReturn }),
    ...(lunarReturn === undefined ? {} : { lunarReturn }),
  };
}
