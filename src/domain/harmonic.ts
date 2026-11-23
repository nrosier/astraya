/**
 * Computes a harmonic or Vedic Varga chart from one person's natal chart (#170).
 *
 * Like the composite chart (#169), a harmonic chart is a synthetic chart, not a comparison — so
 * this reuses the single-chart engine (`findAspects`, `essentialDignitiesFor`, `sectOf`, the two
 * Arabic parts) to compute fresh aspects/dignities/sect/parts from the transformed positions and
 * houses, exactly the way `computeChartDataAtJd` does for a real chart. The transform itself
 * (`harmonicLongitude`, `harmonicPosition`, `harmonicHouses`) lives in `astrology/harmonics.ts`,
 * including the doc comment on which Varga convention is used and why — this module only wires
 * that transform into a full `ChartData`.
 */
/**
 * @module harmonic
 * @purpose Computes a harmonic or Vedic Varga chart (e.g. D9 Navamsha) from one person's natal chart (#170).
 * @conventions Synthetic chart, not a comparison, so reuses the single-chart engine on positions/houses already transformed by `astrology/harmonics.ts`; for `computeHarmonic`, `n` must be a positive integer, with `n=1` reproducing the natal chart (whole-sign houses in place of whatever system the natal chart used). The age harmonics (#1407) follow the Solar Fire Deluxe guide §12.6 (PDF p. 85): Harmonic Age multiplies by the exact age in decimal years at the target date (zero at birth), Harmonic Age+1 by that age plus one (one at birth); age is `ageInYears` (tropical years), and a target before birth is refused.
 * @exports computeHarmonic, computeHarmonicAge, harmonicPositionProvenance, HarmonicData, HarmonicAgeData, HarmonicAgeOptions, HarmonicPositionProvenanceRow
 */
import { DEFAULT_ORB_CONFIG, findAspects, subjectsFrom, type Aspect } from '../astrology/aspects.js';
import { bodyByKey, bodyById, type BodyCategory } from '../astrology/bodies.js';
import type { EssentialDignities } from '../astrology/dignities.js';
import { DEFAULT_RULERSHIP_CHOICE, essentialDignitiesFor } from '../astrology/rulership.js';
import { partOfFortune, partOfSpirit } from '../astrology/arabic-parts.js';
import { harmonicHouses, harmonicPosition } from '../astrology/harmonics.js';
import { ageInYears } from '../astrology/progressions.js';
import { sectOf, type Sect } from '../astrology/sect.js';
import {
  computeChartData,
  isAspectParticipant,
  type ChartCalculationOptions,
  type ChartData,
} from './chart-compute.js';
import { chartBodyKey, chartBodyName } from './chart-tables.js';
import type { BodyId, BodyPosition, EphemerisProvider, JulianDayUT } from '../ephemeris/types.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type { BirthMomentInput } from '../time/types.js';

function categoryOf(body: BodyId): BodyCategory {
  const definition = bodyById(body);
  return definition?.category ?? 'asteroid';
}

export interface HarmonicData {
  readonly natal: ChartData;
  /** The harmonic/Varga chart itself: transformed positions, whole-sign houses, and its own aspects, dignities, sect and Arabic parts. */
  readonly harmonic: ChartData;
}

/** An age harmonic chart (#1407): the harmonic chart plus the number it was cast with and the age behind it. */
export interface HarmonicAgeData extends HarmonicData {
  /** The exact age in tropical years at the target date. */
  readonly ageInYears: number;
  /** The multiplier used: the age, or the age plus one. */
  readonly harmonicNumber: number;
  readonly plusOne: boolean;
}

export interface HarmonicAgeOptions extends ChartCalculationOptions {
  /** Harmonic Age+1 (Solar Fire §12.6): multiply by the age plus one, so the chart at birth is the natal chart. */
  readonly plusOne?: boolean;
}

/** One body’s radix longitude alongside its transformed harmonic longitude. */
export interface HarmonicPositionProvenanceRow {
  readonly bodyKey: string;
  readonly bodyName: string;
  readonly radixLongitude: number;
  readonly harmonicLongitude: number;
}

/** Pairs every transformed body with its radix source position for UI and export provenance. */
export function harmonicPositionProvenance(data: HarmonicData): readonly HarmonicPositionProvenanceRow[] {
  const radixByBody = new Map(data.natal.positions.map((position) => [position.body, position.longitude]));
  return data.harmonic.positions.flatMap((position) => {
    const radixLongitude = radixByBody.get(position.body);
    return radixLongitude === undefined
      ? []
      : [
          {
            bodyKey: chartBodyKey(data.harmonic, position.body),
            bodyName: chartBodyName(data.harmonic, position.body),
            radixLongitude,
            harmonicLongitude: position.longitude,
          },
        ];
  });
}

/**
 * `n` is the harmonic number (5, 7, ... or a Varga preset's `n`, e.g. 9 for D9 Navamsha). Must be
 * a positive integer; `n=1` reproduces the natal chart itself (with whole-sign houses in place of
 * whatever house system the natal chart used). `provider` must already be initialized.
 */
export async function computeHarmonic(
  moment: BirthMomentInput,
  n: number,
  provider: EphemerisProvider,
  options: ChartCalculationOptions = {},
): Promise<HarmonicData> {
  if (!Number.isInteger(n) || n < 1) throw new Error(`harmonic number must be a positive integer, got ${String(n)}`);

  const natal = await computeChartData(moment, provider, options);
  return { natal, harmonic: harmonicChart(natal, n, options) };
}

/**
 * Harmonic Age and Harmonic Age+1 (Solar Fire Deluxe guide §12.6, PDF p. 85; #1407): every longitude multiplied by the
 * subject's exact age in decimal years at `targetJd`, or by that age plus one. The age harmonic is zero at birth (every
 * point at 0° Aries); the age+1 harmonic is one at birth (the natal chart, with whole-sign houses). The multiplier is
 * not an integer, which is the point of the technique, so this does not go through `computeHarmonic`'s integer check.
 * `provider` must already be initialized.
 */
export async function computeHarmonicAge(
  moment: BirthMomentInput,
  targetJd: JulianDayUT,
  provider: EphemerisProvider,
  options: HarmonicAgeOptions = {},
): Promise<HarmonicAgeData> {
  const natalJd = await julianDayFor(provider, resolveMoment(moment));
  const age = ageInYears(natalJd, targetJd);
  if (age < 0) throw new Error('an age harmonic needs a target date on or after birth');
  const plusOne = options.plusOne === true;
  const harmonicNumber = plusOne ? age + 1 : age;
  const natal = await computeChartData(moment, provider, options);
  return { natal, harmonic: harmonicChart(natal, harmonicNumber, options), ageInYears: age, harmonicNumber, plusOne };
}

/**
 * The harmonic chart of `natal` for multiplier `n`: transformed positions, whole-sign houses, and its own aspects,
 * dignities, sect and Arabic parts. `n` may be any real number here; the callers decide which values are allowed.
 */
function harmonicChart(natal: ChartData, n: number, options: ChartCalculationOptions): ChartData {
  const positions: BodyPosition[] = natal.positions.map((position) => harmonicPosition(position, n));
  const houses = harmonicHouses(natal.houses, n);

  const eligiblePositions = positions.filter((position) => isAspectParticipant(position.body, options.aspectsTo));
  const aspects: readonly Aspect[] = findAspects(
    subjectsFrom(eligiblePositions, categoryOf),
    options.orbConfig ?? DEFAULT_ORB_CONFIG,
  );

  const dignities = new Map<BodyId, EssentialDignities>(
    positions.map((position) => [
      position.body,
      essentialDignitiesFor(position.body, position.longitude, options.rulership ?? DEFAULT_RULERSHIP_CHOICE),
    ]),
  );

  const sun = bodyByKey('sun');
  const moon = bodyByKey('moon');
  if (sun === undefined || moon === undefined) throw new Error('unreachable: sun/moon are always in BODIES');
  const positionByBody = new Map(positions.map((position) => [position.body, position]));
  const sunPosition = positionByBody.get(sun.id);
  const moonPosition = positionByBody.get(moon.id);
  if (sunPosition === undefined || moonPosition === undefined) {
    throw new Error('unreachable: the natal chart always carries a Sun and Moon position');
  }

  const sect: Sect = sectOf(sunPosition.longitude, houses.ascendant);
  const customPoints = natal.customPoints?.flatMap((point) => {
    const position = positionByBody.get(point.body);
    return position === undefined ? [] : [{ ...point, position }];
  });

  const harmonic: ChartData = {
    positions,
    houses,
    aspects,
    dignities,
    sect,
    partOfFortune: partOfFortune(
      sect,
      houses.ascendant,
      sunPosition.longitude,
      moonPosition.longitude,
      options.fortuneFormula,
    ),
    partOfSpirit: partOfSpirit(
      sect,
      houses.ascendant,
      sunPosition.longitude,
      moonPosition.longitude,
      options.fortuneFormula,
    ),
    ...(customPoints === undefined ? {} : { customPoints }),
  };

  return harmonic;
}
