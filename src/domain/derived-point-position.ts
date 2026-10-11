/**
 * Where a derived point falls in a computed chart (#511): the ecliptic longitude of the Part of Fortune, the
 * Part of Spirit and the two midpoints, and the sign and house that gives. The one place the four are
 * located, shared by the Derived points table and the chart's selection inspector so the two cannot disagree.
 */
/**
 * @module domain/derived-point-position
 * @purpose Computes the longitude (and from it the sign and house) of each derived chart point from a ChartData.
 * @conventions Pure and total over the closed DerivedPointKey list; `undefined` only when the point cannot be located (a midpoint of a body the chart lacks). The house is `undefined` when the chart has no defined houses. No visibility rules here — those belong to the table's options.
 * @exports derivedPointLongitude, derivedPointPlacementFacts, DerivedPointPlacementFacts
 */
import { bodyByKey } from '../astrology/bodies.js';
import type { DerivedPointKey } from '../astrology/derived-points.js';
import { houseOf } from '../astrology/emphasis.js';
import { midpointOf } from '../astrology/midpoints.js';
import { signIndex } from '../astrology/signs.js';
import type { Degrees } from '../ephemeris/types.js';
import { housesAreDefined, type ChartData } from './chart-compute.js';

function bodyLongitude(data: ChartData, key: string): Degrees | undefined {
  const body = bodyByKey(key);
  return body === undefined ? undefined : data.positions.find((position) => position.body === body.id)?.longitude;
}

export function derivedPointLongitude(data: ChartData, key: DerivedPointKey): Degrees | undefined {
  switch (key) {
    case 'part-of-fortune':
      return data.partOfFortune;
    case 'part-of-spirit':
      return data.partOfSpirit;
    case 'asc-mc-midpoint':
      return midpointOf(data.houses.ascendant, data.houses.midheaven);
    case 'sun-moon-midpoint': {
      const sun = bodyLongitude(data, 'sun');
      const moon = bodyLongitude(data, 'moon');
      return sun === undefined || moon === undefined ? undefined : midpointOf(sun, moon);
    }
  }
}

export interface DerivedPointPlacementFacts {
  readonly longitude: Degrees;
  /** Zero-based, as the corpus keys use it. */
  readonly sign: number;
  /** One-based; `undefined` when the chart has no defined houses. */
  readonly house: number | undefined;
}

export function derivedPointPlacementFacts(
  data: ChartData,
  key: DerivedPointKey,
): DerivedPointPlacementFacts | undefined {
  const longitude = derivedPointLongitude(data, key);
  if (longitude === undefined) return undefined;
  return {
    longitude,
    sign: signIndex(longitude),
    house: housesAreDefined(data.houses) ? houseOf(longitude, data.houses.cusps) : undefined,
  };
}
