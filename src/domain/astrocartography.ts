/**
 * Astrocartography (ACG) lines, Local Space lines, and relocation (#171).
 *
 * Follows `computeSolarReturn`'s template (`src/domain/solar-return.ts`): a
 * pure async `(inputs, provider, options) => Promise<StructuredData>`, no
 * rendering. ACG lines, Local Space lines, and relocation share one module —
 * all three are "geolocation analysis for a natal chart," and relocation is
 * small enough (one extra `houses()` call) to piggyback rather than earn its
 * own domain module.
 */
/**
 * @module astrocartography
 * @purpose Computes astrocartography (ACG) lines, Local Space lines, and relocated houses for a natal chart (#171).
 * @conventions Pure async `(inputs, provider, options) => Promise<StructuredData>`, no rendering; ARMC is sampled at longitude 0 to avoid the Placidus polar-house fallback. Fixed-star lines (#2018) are a separate, opt-in field (`options.fixedStars`, default none), never part of `AcgLine`, so the planetary output is identical with the option absent; stars are read tropical and equatorial at the natal instant, as the paran table reads them.
 * @exports TRADITIONAL_ACG_BODY_IDS, EXTENDED_ACG_BODY_IDS, computeAstrocartography, AstrocartographyOptions, AstrocartographyData, AcgLine, AcgStarRef, AcgFixedStar
 */
import {
  fixedStarLines,
  horizonLine,
  localSpaceLine,
  meridianLine,
  type AcgSamplingOptions,
  type FixedStarLine,
  type GreatCircleSamplingOptions,
  type HorizonLine,
  type LocalSpaceLine,
  type MeridianLine,
} from '../astrology/astrocartography.js';
import { SE } from '../ephemeris/generated-constants.js';
import type {
  BodyId,
  EphemerisProvider,
  GeoPosition,
  HousePositions,
  HouseSystem,
  JulianDayUT,
  Zodiac,
} from '../ephemeris/types.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type { BirthMomentInput } from '../time/types.js';

const DEFAULT_HOUSE_SYSTEM: HouseSystem = 'P';

/** Sun through Saturn — the traditional 7, checked by default in the body picker. */
export const TRADITIONAL_ACG_BODY_IDS: readonly BodyId[] = [
  SE.SE_SUN,
  SE.SE_MOON,
  SE.SE_MERCURY,
  SE.SE_VENUS,
  SE.SE_MARS,
  SE.SE_JUPITER,
  SE.SE_SATURN,
];

/** Uranus, Neptune, Pluto — offered as an opt-in extension of the default body set. */
export const EXTENDED_ACG_BODY_IDS: readonly BodyId[] = [SE.SE_URANUS, SE.SE_NEPTUNE, SE.SE_PLUTO];

const DEFAULT_LINE_TYPES: readonly ('MC' | 'IC' | 'AC' | 'DC')[] = ['MC', 'IC', 'AC', 'DC'];

export type AcgLine = MeridianLine | HorizonLine;

/** A fixed star to draw: the key it is labelled by (as in `ChartData.fixedStars`) and the identifier the engine is asked for. */
export interface AcgStarRef {
  readonly key: string;
  readonly id: string;
}

/** One star's map lines with the equatorial position they were derived from (the tooltip shows it). */
export interface AcgFixedStar {
  readonly star: string;
  /** Degrees, tropical, of date. */
  readonly rightAscension: number;
  readonly declination: number;
  readonly lines: readonly FixedStarLine[];
}

export interface AstrocartographyOptions {
  /** Default `TRADITIONAL_ACG_BODY_IDS`. */
  readonly bodies?: readonly BodyId[];
  /** Default all four. */
  readonly lineTypes?: readonly ('MC' | 'IC' | 'AC' | 'DC')[];
  /** Default `false`. */
  readonly localSpace?: boolean;
  /** Stars to draw lines for (#2018), the paran star list. Default none: no fixed-star lines are computed. */
  readonly fixedStars?: readonly AcgStarRef[];
  readonly sampling?: AcgSamplingOptions;
  readonly localSpaceSampling?: GreatCircleSamplingOptions;
  readonly relocationPlace?: GeoPosition;
  readonly houseSystem?: HouseSystem;
  readonly zodiac?: Zodiac;
}

export interface AstrocartographyData {
  readonly natalJd: JulianDayUT;
  readonly natalPlace: GeoPosition;
  readonly lines: readonly AcgLine[];
  readonly localSpaceLines: readonly LocalSpaceLine[];
  /** Fixed-star lines per star (#2018). Absent unless `options.fixedStars` named at least one star. */
  readonly fixedStarLines?: readonly AcgFixedStar[];
  /** Houses recomputed at `options.relocationPlace` for the same natal instant. Absent unless a relocation place was given. */
  readonly relocatedHouses?: HousePositions;
}

export async function computeAstrocartography(
  natalMoment: BirthMomentInput,
  provider: EphemerisProvider,
  options: AstrocartographyOptions = {},
): Promise<AstrocartographyData> {
  const resolved = resolveMoment(natalMoment);
  const natalJd = await julianDayFor(provider, resolved);
  const natalPlace: GeoPosition = { ...natalMoment.coordinates, altitude: 0 };
  const bodies = options.bodies ?? TRADITIONAL_ACG_BODY_IDS;
  const lineTypes = options.lineTypes ?? DEFAULT_LINE_TYPES;
  const houseSystem = options.houseSystem ?? DEFAULT_HOUSE_SYSTEM;
  const zodiacOption = options.zodiac === undefined ? undefined : { zodiac: options.zodiac };

  const [equatorialPositions, armc0Houses] = await Promise.all([
    provider.positions(natalJd, bodies, { equatorial: true, ...zodiacOption }),
    // Longitude 0: ARMC there is sidereal time at that meridian, independent of
    // latitude and of house system — 'P' never hits the Placidus polar fallback
    // at latitude 0. Only the ARMC field of this call is ever used.
    provider.houses(natalJd, { latitude: 0, longitude: 0, altitude: 0 }, houseSystem, options.zodiac),
  ]);
  const armc0 = armc0Houses.armc;

  const lines: AcgLine[] = [];
  for (const position of equatorialPositions) {
    const point = { rightAscension: position.longitude, declination: position.latitude };
    if (lineTypes.includes('MC')) lines.push(meridianLine('MC', position.body, point, armc0));
    if (lineTypes.includes('IC')) lines.push(meridianLine('IC', position.body, point, armc0));
    if (lineTypes.includes('AC')) lines.push(horizonLine('AC', position.body, point, armc0, options.sampling));
    if (lineTypes.includes('DC')) lines.push(horizonLine('DC', position.body, point, armc0, options.sampling));
  }

  let localSpaceLines: readonly LocalSpaceLine[] = [];
  if (options.localSpace === true) {
    localSpaceLines = await Promise.all(
      equatorialPositions.map(async (position) => {
        const point = { longitude: position.longitude, latitude: position.latitude };
        const horizontal = await provider.azimuthAltitude(natalJd, point, natalPlace, { equatorial: true });
        return localSpaceLine(position.body, natalPlace, horizontal.azimuth, options.localSpaceSampling);
      }),
    );
  }

  const starRefs = options.fixedStars ?? [];
  const fixedStarData: AcgFixedStar[] = await Promise.all(
    starRefs.map(async (ref) => {
      const position = await provider.fixedStar(natalJd, ref.id, { equatorial: true });
      const point = { rightAscension: position.longitude, declination: position.latitude };
      return {
        star: ref.key,
        rightAscension: point.rightAscension,
        declination: point.declination,
        lines: fixedStarLines(ref.key, point, armc0, options.sampling),
      };
    }),
  );

  const relocatedHouses =
    options.relocationPlace === undefined
      ? undefined
      : await provider.houses(natalJd, options.relocationPlace, houseSystem, options.zodiac);

  return {
    natalJd,
    natalPlace,
    lines,
    localSpaceLines,
    ...(fixedStarData.length === 0 ? {} : { fixedStarLines: fixedStarData }),
    ...(relocatedHouses === undefined ? {} : { relocatedHouses }),
  };
}
