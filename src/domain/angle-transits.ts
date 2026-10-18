/**
 * Slow transits to the natal Ascendant and Midheaven (#678).
 *
 * Transit contacts elsewhere are between bodies only (`transit-importance.ts`: "The angles are not covered yet"),
 * so Saturn crossing the Ascendant, a classic consultation headline, could never appear. This lists them apart from
 * the ranked transits, in time order and without a score: no weight for an angle is invented.
 *
 * The bodies, aspects and orb are the yearly rule set's (`transitPreset('important', yearly)`): Jupiter to Pluto and
 * Chiron, the five major aspects, within 3.5°. Each contact in orb now is given every exact date within
 * `ANGLE_TRANSIT_SEARCH_YEARS` either side, so a retrograde's three passes all show.
 */
/**
 * @module domain/angle-transits
 * @purpose Finds the slow planets' current transits to the natal Ascendant and Midheaven, with orb, applying/separating and exact dates, for the consultation page (#678).
 * @conventions Reuses the yearly transit rules for bodies, aspects and orb, and `findExactTransitAspects` (keyed by angle) for the exact dates; unscored, ordered by the next exact date. Needs a known birth time: callers skip it when the natal houses are not defined.
 * @exports AngleKey, AngleTransit, ANGLE_TRANSIT_SEARCH_YEARS, angleTransits
 */
import { aspectByKey } from '../astrology/aspects.js';
import { bodyById, bodyByKey } from '../astrology/bodies.js';
import { findExactTransitAspects, targetLongitudes } from '../astrology/transit-events.js';
import { transitPreset } from '../astrology/transit-importance.js';
import type { BodyPosition, Degrees, EphemerisProvider, HousePositions, JulianDayUT } from '../ephemeris/types.js';

export type AngleKey = 'asc' | 'mc';

export interface AngleTransit {
  readonly transitingKey: string;
  readonly aspectKey: string;
  readonly angle: AngleKey;
  /** Degrees from exact now. */
  readonly orb: Degrees;
  readonly applying: boolean;
  /** Every exact hit within `ANGLE_TRANSIT_SEARCH_YEARS` either side of now, in time order. */
  readonly exactJds: readonly JulianDayUT[];
}

/** How far either side of now exact dates are looked for: enough for Pluto to cross 3.5° of orb and back. */
export const ANGLE_TRANSIT_SEARCH_YEARS = 3;

/** A slow body moves well under a degree in five days, so no crossing of one target is missed between samples. */
const SAMPLE_STEP_DAYS = 5;

const YEAR_DAYS = 365.2425;

function signedDelta(from: Degrees, to: Degrees): Degrees {
  const raw = (((to - from) % 360) + 360) % 360;
  return raw > 180 ? raw - 360 : raw;
}

export async function angleTransits(
  transitPositions: readonly BodyPosition[],
  natalHouses: HousePositions,
  nowJd: JulianDayUT,
  provider: EphemerisProvider,
): Promise<readonly AngleTransit[]> {
  const yearly = transitPreset('important', { everyBodyKey: [], context: 'yearly' });
  const angles: readonly (readonly [AngleKey, Degrees])[] = [
    ['asc', natalHouses.ascendant],
    ['mc', natalHouses.midheaven],
  ];

  const inOrb: Omit<AngleTransit, 'exactJds'>[] = [];
  for (const position of transitPositions) {
    const transitingKey = bodyById(position.body)?.key;
    if (transitingKey === undefined || !yearly.transiting.includes(transitingKey)) continue;
    for (const [angle, natalLongitude] of angles) {
      for (const aspectKey of yearly.aspects) {
        const aspect = aspectByKey(aspectKey);
        if (aspect === undefined) continue;
        for (const target of targetLongitudes(aspect.angle, natalLongitude)) {
          const delta = signedDelta(position.longitude, target);
          if (Math.abs(delta) > yearly.maxOrb) continue;
          // Moving toward the target: the gap and the body's motion point the same way.
          inOrb.push({
            transitingKey,
            aspectKey,
            angle,
            orb: Math.abs(delta),
            applying: delta * position.longitudeSpeed > 0,
          });
        }
      }
    }
  }
  if (inOrb.length === 0) return [];

  const bodies = [...new Set(inOrb.map((contact) => contact.transitingKey))].flatMap((key) => {
    const body = bodyByKey(key);
    return body === undefined ? [] : [body.id];
  });
  const hits = await findExactTransitAspects<AngleKey>(
    provider,
    bodies,
    new Map(angles),
    nowJd - ANGLE_TRANSIT_SEARCH_YEARS * YEAR_DAYS,
    nowJd + ANGLE_TRANSIT_SEARCH_YEARS * YEAR_DAYS,
    { sampleStepDays: SAMPLE_STEP_DAYS },
  );

  const withDates = inOrb.map((contact) => ({
    ...contact,
    exactJds: hits
      .filter(
        (hit) =>
          hit.natalBody === contact.angle &&
          hit.aspect.key === contact.aspectKey &&
          bodyById(hit.transitingBody)?.key === contact.transitingKey,
      )
      .map((hit) => hit.jd),
  }));
  // Time order: by the next exact date from now, or the last one when every pass is already behind.
  const nextExact = (contact: AngleTransit): number =>
    contact.exactJds.find((jd) => jd >= nowJd) ?? contact.exactJds.at(-1) ?? Number.POSITIVE_INFINITY;
  return withDates.sort((a, b) => nextExact(a) - nextExact(b));
}
