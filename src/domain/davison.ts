/**
 * Davison relationship chart (#1406): one real chart cast for the space-time midpoint of two births.
 *
 * Unlike the composite (`composite.ts`, which averages two charts' positions), a Davison chart
 * is an ordinary chart for a single real moment and place, so the ephemeris is asked for its
 * positions and houses directly.
 *
 * Time (Davison, *Synastry*, 1983, p. 244 and the worked example on pp. 246-247): the halfway
 * point in time is the meeting of the elder's progressed date and the younger's converse date,
 * which is the exact midpoint of the two birth instants. The book first expresses each birth
 * time in Local Mean Time and reads the result as the Local Mean Time of the relationship
 * horoscope's own meridian. This module does the same: it takes the mean of the two LMT
 * instants, then converts that LMT back to UT at the chosen place's longitude for the engine.
 *
 * Place: the default is the great-circle (spherical geodesic) midpoint of the two birthplaces,
 * standard spherical geometry: both places become unit vectors, the vectors are added and
 * normalised, and the result is converted back to latitude and longitude. The alternative is
 * the book's own method (Davison 1983, p. 245, pp. 247-248): the mean of the two latitudes and
 * the mean of the two longitudes, where for opposite hemispheres the half difference is
 * subtracted from the larger value. The book presents that method as valid in its own right;
 * the two differ for distant birthplaces.
 *
 * House cusps are calculated for the latitude of the cast place, which is the mean latitude in
 * the book's method and the midpoint's own latitude in the great-circle method.
 */
/**
 * @module domain/davison
 * @purpose Computes a Davison relationship chart: a real chart for the time and place midpoint of two births, alongside both natal charts (#1406).
 * @conventions Time midpoint is taken in Local Mean Time (Davison 1983, pp. 244-248) then converted to UT at the cast longitude; place midpoint defaults to the great-circle midpoint, with the book's arithmetic latitude/longitude mean as an option; houses use the cast place's latitude; all ephemeris access goes through `EphemerisProvider`.
 * @exports computeDavison, greatCircleMidpoint, arithmeticMidpoint, davisonPlace, DavisonData, DavisonOptions, DavisonPlaceMethod
 */
import { computeChartDataAtJd, type ChartCalculationOptions, type ChartData } from './chart-compute.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import { localMeanTimeOffsetMinutes } from '../time/zones.js';
import type { BirthMomentInput, Coordinates } from '../time/types.js';
import type { EphemerisProvider, GeoPosition, JulianDayUT } from '../ephemeris/types.js';

/** How the place midpoint is found: the default great circle, or the book's arithmetic mean. */
export type DavisonPlaceMethod = 'great-circle' | 'arithmetic';

export interface DavisonOptions extends ChartCalculationOptions {
  /** Default `'great-circle'`. `'arithmetic'` is Davison 1983's mean of latitudes and of longitudes. */
  readonly placeMethod?: DavisonPlaceMethod;
}

export interface DavisonData {
  /** First person's natal chart. */
  readonly chartA: ChartData;
  /** Second person's natal chart. */
  readonly chartB: ChartData;
  /** The relationship chart, cast at `castJd` and `castPlace`. */
  readonly davison: ChartData;
  /** UT moment the Davison chart is cast for. */
  readonly castJd: JulianDayUT;
  /** Place the Davison chart is cast for; its latitude is the one the house cusps use. */
  readonly castPlace: GeoPosition;
  /** Which place method produced `castPlace`, for the basis line. */
  readonly placeMethod: DavisonPlaceMethod;
}

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Below this resultant-vector length the two places are antipodal and have no unique midpoint. */
const ANTIPODAL_EPSILON = 1e-9;

/**
 * Great-circle midpoint of two places (standard spherical geometry): sum the two unit vectors,
 * normalise, convert back. Longitudes on either side of the 180 degree meridian need no special
 * case because the vector sum is continuous across it. Vector addition is commutative, so the
 * result is identical whichever place is first.
 *
 * The formula is standard spherical trigonometry and is checked from first principles in the
 * tests. Ed Williams' Aviation Formulary (great-circle navigation) is a related reference; it has
 * NOT been checked against the source text, so no version or section is cited.
 *
 * Throws for antipodal places, where every point on a half great circle is equally "halfway".
 */
export function greatCircleMidpoint(a: Coordinates, b: Coordinates): Coordinates {
  const unit = (p: Coordinates): [number, number, number] => {
    const lat = p.latitude * RAD;
    const lon = p.longitude * RAD;
    return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  };
  const [ax, ay, az] = unit(a);
  const [bx, by, bz] = unit(b);
  const x = ax + bx;
  const y = ay + by;
  const z = az + bz;
  const length = Math.hypot(x, y, z);
  if (length < ANTIPODAL_EPSILON) {
    throw new Error('The two birthplaces are antipodal, so they have no unique great-circle midpoint.');
  }
  const longitude = Math.atan2(y, x) * DEG;
  return {
    latitude: Math.asin(Math.max(-1, Math.min(1, z / length))) * DEG,
    // atan2 returns -180 for the exact antimeridian; report it as +180.
    longitude: longitude <= -180 ? 180 : longitude,
  };
}

/**
 * The book's place midpoint: mean of the two latitudes and mean of the two longitudes
 * (Davison 1983, p. 245, worked example pp. 247-248).
 *
 * The book's rule for a pair on opposite sides of the equator or of Greenwich, "subtract the half
 * difference from the larger value", is the same arithmetic as the signed mean: for 51 S 32 and
 * 39 N 18 the half difference 45 25 taken from 51 32 gives 6 S 07, and (-51.5333 + 39.3) / 2 is
 * the same 6 S 07. So signed degrees (south and west negative) are simply averaged. East and west
 * are halved as written, either side of Greenwich; the book gives no separate rule for the 180
 * degree meridian, so this does not take the short way round (the great-circle method does).
 */
export function arithmeticMidpoint(a: Coordinates, b: Coordinates): Coordinates {
  return { latitude: (a.latitude + b.latitude) / 2, longitude: (a.longitude + b.longitude) / 2 };
}

/** The cast place for two birthplaces under the chosen method. */
export function davisonPlace(a: Coordinates, b: Coordinates, method: DavisonPlaceMethod = 'great-circle'): Coordinates {
  return method === 'arithmetic' ? arithmeticMidpoint(a, b) : greatCircleMidpoint(a, b);
}

/** Minutes in a day, and its reciprocal, for Local Mean Time offsets. */
const MINUTES_PER_DAY = 1440;
const DAYS_PER_MINUTE = 1 / MINUTES_PER_DAY;

/**
 * Davison relationship chart for two birth moments. `provider` must already be initialized.
 *
 * The cast instant is the mean of the two births' Local Mean Times (each longitude's own LMT),
 * read as the LMT of the cast place's meridian and converted back to UT there.
 */
export async function computeDavison(
  momentA: BirthMomentInput,
  momentB: BirthMomentInput,
  provider: EphemerisProvider,
  options: DavisonOptions = {},
): Promise<DavisonData> {
  const { placeMethod = 'great-circle', ...chartOptions } = options;

  const [jdA, jdB] = await Promise.all([
    julianDayFor(provider, resolveMoment(momentA)),
    julianDayFor(provider, resolveMoment(momentB)),
  ]);
  const placeA: GeoPosition = { ...momentA.coordinates, altitude: 0 };
  const placeB: GeoPosition = { ...momentB.coordinates, altitude: 0 };

  const middle = davisonPlace(momentA.coordinates, momentB.coordinates, placeMethod);
  const castPlace: GeoPosition = { latitude: middle.latitude, longitude: middle.longitude, altitude: 0 };

  // Each birth time in Local Mean Time, then the halfway instant, then back to UT at the cast meridian.
  // LMT_x = UT_x + offset_x, so mean(LMT) = mean(UT) + mean(offset); UT_cast = mean(LMT) - castOffset.
  const offsetA = localMeanTimeOffsetMinutes(momentA.coordinates.longitude);
  const offsetB = localMeanTimeOffsetMinutes(momentB.coordinates.longitude);
  // The cast meridian's LMT offset is taken on the same day-branch as the mean of the two, so a
  // great-circle midpoint beside the 180 degree meridian is not read a whole day away.
  const rawCastOffset = localMeanTimeOffsetMinutes(castPlace.longitude);
  const castOffset =
    rawCastOffset + MINUTES_PER_DAY * Math.round(((offsetA + offsetB) / 2 - rawCastOffset) / MINUTES_PER_DAY);
  const meanOffset = (offsetA + offsetB) / 2;
  const castJd = (jdA + jdB) / 2 + (meanOffset - castOffset) * DAYS_PER_MINUTE;

  const [chartA, chartB, davison] = await Promise.all([
    computeChartDataAtJd(jdA, placeA, provider, chartOptions),
    computeChartDataAtJd(jdB, placeB, provider, chartOptions),
    computeChartDataAtJd(castJd, castPlace, provider, chartOptions),
  ]);

  return { chartA, chartB, davison, castJd, castPlace, placeMethod };
}
