/**
 * Computes a heliocentric chart from one person's birth moment (#1407, Solar Fire Deluxe v6 §7.13; owner decisions
 * of 2026-11-14 recorded on #1407).
 *
 * The positions are seen from the Sun rather than from the Earth: Swiss Ephemeris's heliocentric flag
 * (`SEFLG_HELCTR`, through `PositionOptions.heliocentric`). The Earth takes the Sun's place, since the Sun has no
 * heliocentric position. The Moon, the lunar nodes, Lilith and the calculated points are geocentric by definition,
 * so they are left out. Houses and angles depend on a place on the Earth and have no heliocentric meaning: the chart
 * carries the natal `HousePositions` only because `ChartData` requires them, and its screen draws no houses, angles
 * or house column. The same goes for `sect` and the two lots, which are taken from the natal chart and not shown.
 */
/**
 * @module domain/heliocentric
 * @purpose Computes a heliocentric chart (#1407): the Earth, Mercury to Pluto and Chiron seen from the Sun, with their own aspects and dignities.
 * @conventions Synthetic chart in the tropical zodiac, like the draconic one: the engine defaults plus the person's orbs and rulers. Houses, angles, sect and lots are the natal chart's, carried only to fill `ChartData`, and the screen does not show them. All ephemeris access goes through `EphemerisProvider`.
 * @exports HELIOCENTRIC_BODY_KEYS, computeHeliocentric, HeliocentricData
 */
import { DEFAULT_ORB_CONFIG, findAspects, subjectsFrom, type Aspect } from '../astrology/aspects.js';
import { bodyById, bodyByKey, type BodyCategory } from '../astrology/bodies.js';
import type { EssentialDignities } from '../astrology/dignities.js';
import { DEFAULT_RULERSHIP_CHOICE, essentialDignitiesFor } from '../astrology/rulership.js';
import { computeChartData, type ChartCalculationOptions, type ChartData } from './chart-compute.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type { BirthMomentInput } from '../time/types.js';
import type { BodyId, EphemerisProvider } from '../ephemeris/types.js';

/** The bodies the heliocentric chart shows, in chart-listing order, the Earth in the Sun's place (owner decision). */
export const HELIOCENTRIC_BODY_KEYS: readonly string[] = [
  'earth',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
  'chiron',
];

function bodyIdOf(key: string): BodyId {
  const definition = bodyByKey(key);
  if (definition === undefined) throw new Error(`unreachable: "${key}" is a known body`);
  return definition.id;
}

function categoryOf(body: BodyId): BodyCategory {
  return bodyById(body)?.category ?? 'asteroid';
}

export interface HeliocentricData {
  readonly natal: ChartData;
  /** The heliocentric chart itself: its own positions, aspects and dignities; houses, sect and lots from the natal chart. */
  readonly heliocentric: ChartData;
}

/** `provider` must already be initialized. Only the orbs and rulership of `options` apply (the engine defaults otherwise). */
export async function computeHeliocentric(
  moment: BirthMomentInput,
  provider: EphemerisProvider,
  options: Pick<ChartCalculationOptions, 'orbConfig' | 'rulership'> = {},
): Promise<HeliocentricData> {
  const natal = await computeChartData(moment, provider, options);
  const jd = await julianDayFor(provider, resolveMoment(moment));
  const positions = await provider.positions(jd, HELIOCENTRIC_BODY_KEYS.map(bodyIdOf), { heliocentric: true });

  const aspects: readonly Aspect[] = findAspects(
    subjectsFrom(positions, categoryOf),
    options.orbConfig ?? DEFAULT_ORB_CONFIG,
  );
  const dignities = new Map<BodyId, EssentialDignities>(
    positions.map((position) => [
      position.body,
      essentialDignitiesFor(position.body, position.longitude, options.rulership ?? DEFAULT_RULERSHIP_CHOICE),
    ]),
  );

  const heliocentric: ChartData = {
    positions,
    houses: natal.houses,
    aspects,
    dignities,
    sect: natal.sect,
    partOfFortune: natal.partOfFortune,
    partOfSpirit: natal.partOfSpirit,
  };
  return { natal, heliocentric };
}
