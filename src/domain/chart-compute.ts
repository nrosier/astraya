/**
 * Computes everything a chart's data tables need from a birth moment (#44).
 *
 * Deliberately decoupled from the `Chart` entity in `chart.ts`: that entity
 * holds no computed positions by design (see its own doc comment), and no UI
 * yet exists to create or persist one. This module instead takes a birth
 * moment directly, the same input `PersonForm`/`person-form.ts` already
 * produce, so a future chart-settings UI can supply real `ChartCalculationOptions`
 * later without this module changing shape.
 *
 * Everything here is one pass over the ephemeris: a single Julian day, one
 * batch position call, one house call, then pure arithmetic over the results
 * for aspects, dignities, sect and the two derived points. Nothing is cached
 * or stored — recomputing is cheap, and storing results would only create a
 * second version of the truth the `Chart` doc comment already warns against.
 */
/**
 * @module chart-compute
 * @purpose Computes a chart's positions, houses, aspects, dignities, sect and derived points from a birth moment (#44).
 * @conventions One ephemeris pass (one Julian day, one batch position call, one house call) then pure arithmetic; nothing is cached — results are cheap to recompute, not stored as a second source of truth; `housesAreDefined` must be checked before trusting house-derived fields. Point aspects (Asc/MC always; Vertex, Part of Fortune/Spirit opt-in via `aspectsTo`) are point-to-body only, use the planet orbs, and drop a part's aspect to its own "+" luminary (#516).
 * @exports computeChartData, computeChartDataAtJd, housesAreDefined, ChartData, ChartCalculationOptions, AngleAspect, NATAL_FIXED_STARS
 */
import {
  DEFAULT_ORB_CONFIG,
  findAspects,
  matchAspect,
  type Aspect,
  type AspectMatch,
  type AspectSubject,
  type OrbConfig,
} from '../astrology/aspects.js';
import { bodyByKey, BODIES } from '../astrology/bodies.js';
import type { EssentialDignities } from '../astrology/dignities.js';
import { DEFAULT_RULERSHIP_CHOICE, essentialDignitiesFor, type RulershipChoice } from '../astrology/rulership.js';
import { partOfFortune, partOfSpirit } from '../astrology/arabic-parts.js';
import { sectOf, type Sect } from '../astrology/sect.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type {
  BodyId,
  BodyPosition,
  Degrees,
  EphemerisProvider,
  GeoPosition,
  HousePositions,
  HouseSystem,
  JulianDayUT,
  Zodiac,
} from '../ephemeris/types.js';
import type { BirthMomentInput } from '../time/types.js';

/** Placidus, the system every other screen in the app defaults to. */
const DEFAULT_HOUSE_SYSTEM: HouseSystem = 'P';

/**
 * The seven traditionally significant "royal"/prominent fixed stars (#398) — a deliberately
 * short, well-known list rather than every star `sefstars.txt` (#33) carries, matching how most
 * mainstream natal-report software surfaces fixed stars at all. Exact spellings confirmed against
 * `public/ephe/sefstars.txt` itself.
 */
export const NATAL_FIXED_STARS: readonly string[] = [
  'Regulus',
  'Spica',
  'Algol',
  'Aldebaran',
  'Antares',
  'Fomalhaut',
  'Sirius',
];

export interface ChartCalculationOptions {
  readonly houseSystem?: HouseSystem;
  /** Whose rulers the essential dignities use: modern by default (#426). */
  readonly rulership?: RulershipChoice;
  readonly zodiac?: Zodiac;
  readonly orbConfig?: OrbConfig;
  /** Which Lilith model `data.positions` carries; the other two are dropped. Default 'mean'. */
  readonly lilithVariant?: 'mean' | 'true' | 'interpolated';
  /** Which lunar-node model `data.positions` carries; the other is dropped. Default 'mean'. */
  readonly nodeVariant?: 'mean' | 'true';
  /**
   * Whether these point families participate in aspect-finding at all. All
   * default to false — Chiron, Lilith and the Nodes are still computed and
   * appear in `data.positions`, just excluded from the pairs `findAspects`
   * checks, matching most astrology tools' own "aspects to" defaults.
   */
  readonly aspectsTo?: {
    readonly chiron?: boolean;
    readonly lilith?: boolean;
    readonly lunarNodes?: boolean;
    /** The Vertex, the Part of Fortune and the Part of Spirit as aspecting points (#516); the Ascendant and Midheaven always are. */
    readonly vertex?: boolean;
    readonly partOfFortune?: boolean;
    readonly partOfSpirit?: boolean;
  };
}

/**
 * Which calculated point an `AngleAspect` is to (#413, #516): the Ascendant and Midheaven always, the Vertex and the
 * two lots when their `aspectsTo` flag is on. They share one one-directional mechanism — a point has no `BodyId`.
 */
export type AspectAngle = 'asc' | 'mc' | 'vertex' | 'partOfFortune' | 'partOfSpirit';

/**
 * An aspect between a calculated point (an angle, the Vertex or a lot) and a body (#413, #516). Separate from
 * `Aspect` because an angle has no `BodyId`; `body` is the body side, `angle` the angle side.
 */
export interface AngleAspect extends AspectMatch {
  readonly angle: AspectAngle;
  readonly body: BodyId;
}

/**
 * How fast the Ascendant and Midheaven sweep the ecliptic, in degrees per day — one turn of the
 * sky per sidereal day. Only used to decide applying/separating for an angle aspect, where the
 * angle's own motion dwarfs any body's, so its exact instantaneous rate doesn't matter.
 */
const ANGLE_SPEED_DEG_PER_DAY = 360.9856;

export interface ChartData {
  readonly positions: readonly BodyPosition[];
  readonly houses: HousePositions;
  readonly aspects: readonly Aspect[];
  /**
   * Aspects from the Ascendant and Midheaven (always), and the Vertex, Part of Fortune and Part of Spirit (when
   * enabled in `aspectsTo`, #516), to each body that takes part in `aspects`. Points are never aspected to each other.
   * Undefined for a composite/harmonic chart (those have no real angles to aspect) and empty when
   * the houses have no solution.
   */
  readonly angleAspects?: readonly AngleAspect[];
  readonly dignities: ReadonlyMap<BodyId, EssentialDignities>;
  readonly sect: Sect;
  readonly partOfFortune: Degrees;
  readonly partOfSpirit: Degrees;
  /**
   * Declination (equatorial, not ecliptic) per body — `declinations.ts`'s parallels/
   * contraparallels/out-of-bounds all key off this. Undefined for a composite/harmonic chart
   * (`composite.ts`/`harmonic.ts`): those positions are synthetic midpoints/multiples with no
   * single real moment or place, so "declination of this point" isn't a coherent question —
   * callers must treat a missing `declinations` as "not applicable here", not as a bug.
   */
  readonly declinations?: ReadonlyMap<BodyId, Degrees>;
  /** True obliquity of the ecliptic at this moment — the out-of-bounds threshold (`declinations.ts`'s own doc comment). Same composite/harmonic caveat as `declinations`. */
  readonly obliquity?: Degrees;
  /**
   * Ecliptic longitude per `NATAL_FIXED_STARS` name, for `fixed-stars.ts`'s `fixedStarConjunctions`
   * (#398). Undefined for a composite/harmonic chart — same reasoning as `declinations`: fixed
   * stars conjunct a real body's own longitude, which a synthetic midpoint/multiple position
   * doesn't coherently have one real moment to look them up for.
   */
  readonly fixedStars?: ReadonlyMap<string, Degrees>;
}

/**
 * Whether `houses` is actually usable, distinct from `Person.timeAccuracy !== 'unknown'` (#378):
 * a *known* birth time at a latitude where the chosen house system has no solution (e.g. inside a
 * polar circle with Placidus) still produces a `HousePositions` — one whose cusps/angles are
 * `NaN`, per `engine.ts`'s own handling of that case — rather than throwing or returning
 * `undefined`. `cusps[0]` is excluded from the check: it is always unused/`NaN` by design (see
 * `HousePositions.cusps`'s own doc comment), not a signal of this failure.
 *
 * Every caller that renders anything built on houses (a position's house via `houseOf`, the
 * Ascendant-based report sections, the wheel) needs this check *in addition to* `timeAccuracy`,
 * not instead of it — `timeAccuracy === 'unknown'` is caught before a chart is even computed, so
 * `houses` is never consulted at all in that case; this check is for the chart that *was*
 * computed, from a real time, but came back without a geometrically valid house division.
 */
export function housesAreDefined(houses: HousePositions): boolean {
  return (
    Number.isFinite(houses.ascendant) &&
    Number.isFinite(houses.midheaven) &&
    houses.cusps.slice(1).every((cusp) => Number.isFinite(cusp))
  );
}

/** A calculated point that aspects bodies: an angle, the Vertex or a lot, with the speed `isApplying` needs. */
interface AspectPoint {
  readonly id: AspectAngle;
  readonly longitude: Degrees;
  readonly speed: Degrees;
  /** The one luminary whose aspect to this point only repeats an existing Ascendant-to-luminary aspect, or undefined. */
  readonly redundantLuminary?: BodyId;
}

/**
 * Aspects from each point to every subject, treating each point as a non-luminary (#413, #516).
 *
 * Conventions: point-to-body only (points are never aspected to each other: Asc-MC is latitude geometry, and a lot to
 * the Ascendant is just the Sun-Moon aspect); the planet orbs of `orbFor`, with the luminary bonus from the body side
 * only. Source: the Solar Fire 9 User Guide (Esoteric Technologies, 2014), "Editing an Aspect Set" — luminary orbs
 * apply whenever one of the two points is the Sun or Moon, other orbs otherwise, and its Arabic Parts report lists
 * aspects to chart points with those same orbs (docs/references/SolarFire_v9.pdf). Applying/separating is the
 * diurnal sweep of the point, not an own-motion claim: this follows the Astro-Seek reference sheet (#413), whereas
 * Solar Fire holds chart angles stationary, so the two can differ on applying versus separating.
 */
function findPointAspects(
  points: readonly AspectPoint[],
  subjects: readonly AspectSubject[],
  orbConfig: OrbConfig,
): readonly AngleAspect[] {
  const result: AngleAspect[] = [];
  for (const point of points) {
    const position: BodyPosition = {
      body: -1,
      longitude: point.longitude,
      latitude: 0,
      distance: 1,
      longitudeSpeed: point.speed,
      latitudeSpeed: 0,
      distanceSpeed: 0,
      retrograde: false,
    };
    for (const subject of subjects) {
      if (subject.body === point.redundantLuminary) continue;
      const match = matchAspect(position, 'planet', subject.position, subject.category, orbConfig);
      if (match) result.push({ ...match, angle: point.id, body: subject.body });
    }
  }
  return result;
}

/**
 * Computes a chart's positions, houses, aspects, dignities, sect and the two
 * classical derived points from a birth moment.
 *
 * `provider` must already be initialized. Houses, the Ascendant and the
 * derived points (both built on the Ascendant) are computed the same as for
 * any other moment — callers with an `'unknown'`-accuracy birth time are
 * responsible for not showing them, per `Person.timeAccuracy`'s own doc
 * comment: an unknown time makes them meaningless, not merely approximate.
 */
export async function computeChartData(
  moment: BirthMomentInput,
  provider: EphemerisProvider,
  options: ChartCalculationOptions = {},
): Promise<ChartData> {
  const resolved = resolveMoment(moment);
  const jd = await julianDayFor(provider, resolved);
  const place: GeoPosition = { ...moment.coordinates, altitude: 0 };
  return computeChartDataAtJd(jd, place, provider, options);
}

/**
 * The same computation as `computeChartData`, for a caller that already has a Julian day and
 * place rather than a `BirthMomentInput` to resolve — a transit or "current sky" moment, say,
 * which has no civil birth record of its own. `computeChartData` is the resolve-then-call
 * wrapper of this for the common case; both produce the same `ChartData` shape so any table,
 * wheel or sheet built for one works unchanged for the other.
 */
export async function computeChartDataAtJd(
  jd: JulianDayUT,
  place: GeoPosition,
  provider: EphemerisProvider,
  options: ChartCalculationOptions = {},
): Promise<ChartData> {
  const positionOptions = options.zodiac === undefined ? undefined : { zodiac: options.zodiac };

  // BODIES always carries every Lilith and Node model at once; collapse each
  // down to the one the caller asked for (default 'mean' for both) rather
  // than showing all three Liliths and both Nodes simultaneously.
  const lilithKey =
    options.lilithVariant === 'true'
      ? 'osculatingLilith'
      : options.lilithVariant === 'interpolated'
        ? 'interpolatedLilith'
        : 'meanLilith';
  const nodeKey = options.nodeVariant === 'true' ? 'trueNode' : 'meanNode';
  const bodies = BODIES.filter((body) => {
    if (body.category === 'lilith') return body.key === lilithKey;
    if (body.category === 'node') return body.key === nodeKey;
    return true;
  });

  const [positions, houses, equatorialPositions, obliquity, fixedStarPositions] = await Promise.all([
    provider.positions(
      jd,
      bodies.map((body) => body.id),
      positionOptions,
    ),
    provider.houses(jd, place, options.houseSystem ?? DEFAULT_HOUSE_SYSTEM, options.zodiac),
    // Equatorial reinterprets `.longitude`/`.latitude` as right ascension/declination
    // (`PositionOptions.equatorial`'s own doc comment) — only declination is used here.
    provider.positions(
      jd,
      bodies.map((body) => body.id),
      { ...positionOptions, equatorial: true },
    ),
    provider.obliquity(jd),
    // `fixedStar` has no batch form (one call per name), unlike `positions` — Promise.all over
    // NATAL_FIXED_STARS is the whole batching this gets. Keyed by the *requested* name, not the
    // engine's own returned `.name` (which can carry extra qualifying text — confirmed by
    // test/ephemeris-fixed-stars.test.ts's own `.toContain('regulus')`, not an exact match), so
    // every caller gets the stable key it asked for.
    Promise.all(NATAL_FIXED_STARS.map((name) => provider.fixedStar(jd, name, positionOptions))),
  ]);
  const declinations = new Map<BodyId, Degrees>(
    equatorialPositions.map((position) => [position.body, position.latitude]),
  );
  const fixedStars = new Map<string, Degrees>(
    fixedStarPositions.map((star, index) => [NATAL_FIXED_STARS[index] ?? star.name, star.longitude]),
  );

  const positionByBody = new Map(positions.map((position) => [position.body, position]));
  const aspectsTo = options.aspectsTo ?? {};
  const subjects: AspectSubject[] = bodies.flatMap((body) => {
    const position = positionByBody.get(body.id);
    if (position === undefined) return [];
    if (body.category === 'centaur' && aspectsTo.chiron !== true) return [];
    if (body.category === 'lilith' && aspectsTo.lilith !== true) return [];
    if (body.category === 'node' && aspectsTo.lunarNodes !== true) return [];
    return [{ body: body.id, position, category: body.category }];
  });
  const orbConfig = options.orbConfig ?? DEFAULT_ORB_CONFIG;
  const aspects = findAspects(subjects, orbConfig);

  const dignities = new Map<BodyId, EssentialDignities>(
    positions.map((position) => [
      position.body,
      essentialDignitiesFor(position.body, position.longitude, options.rulership ?? DEFAULT_RULERSHIP_CHOICE),
    ]),
  );

  const sun = bodyByKey('sun');
  const moon = bodyByKey('moon');
  if (sun === undefined || moon === undefined) throw new Error('unreachable: sun/moon are always in BODIES');
  const sunPosition = positionByBody.get(sun.id);
  const moonPosition = positionByBody.get(moon.id);
  if (sunPosition === undefined || moonPosition === undefined) {
    throw new Error('unreachable: the ephemeris returned no position for the Sun or Moon');
  }

  const sect = sectOf(sunPosition.longitude, houses.ascendant);
  const partOfFortuneLongitude = partOfFortune(sect, houses.ascendant, sunPosition.longitude, moonPosition.longitude);
  const partOfSpiritLongitude = partOfSpirit(sect, houses.ascendant, sunPosition.longitude, moonPosition.longitude);

  // A lot is Asc + a - b, so it sweeps with the angle plus the difference of the two luminaries' own speeds; a lot to
  // its own "+" luminary repeats the Ascendant's aspect to the "-" luminary and is dropped (#516).
  const luminarySpeedGap = moonPosition.longitudeSpeed - sunPosition.longitudeSpeed;
  const fortuneSpeed = ANGLE_SPEED_DEG_PER_DAY + (sect === 'day' ? luminarySpeedGap : -luminarySpeedGap);
  const spiritSpeed = ANGLE_SPEED_DEG_PER_DAY + (sect === 'day' ? -luminarySpeedGap : luminarySpeedGap);
  const plusOfFortune = sect === 'day' ? moon.id : sun.id;
  const plusOfSpirit = sect === 'day' ? sun.id : moon.id;
  const points: AspectPoint[] = [
    { id: 'asc', longitude: houses.ascendant, speed: ANGLE_SPEED_DEG_PER_DAY },
    { id: 'mc', longitude: houses.midheaven, speed: ANGLE_SPEED_DEG_PER_DAY },
    ...(aspectsTo.vertex === true
      ? [{ id: 'vertex', longitude: houses.vertex, speed: ANGLE_SPEED_DEG_PER_DAY } as const]
      : []),
    ...(aspectsTo.partOfFortune === true
      ? [
          {
            id: 'partOfFortune',
            longitude: partOfFortuneLongitude,
            speed: fortuneSpeed,
            redundantLuminary: plusOfFortune,
          } as const,
        ]
      : []),
    ...(aspectsTo.partOfSpirit === true
      ? [
          {
            id: 'partOfSpirit',
            longitude: partOfSpiritLongitude,
            speed: spiritSpeed,
            redundantLuminary: plusOfSpirit,
          } as const,
        ]
      : []),
  ];
  const angleAspects = housesAreDefined(houses) ? findPointAspects(points, subjects, orbConfig) : [];

  return {
    positions,
    houses,
    aspects,
    angleAspects,
    dignities,
    sect,
    partOfFortune: partOfFortuneLongitude,
    partOfSpirit: partOfSpiritLongitude,
    declinations,
    obliquity,
    fixedStars,
  };
}
