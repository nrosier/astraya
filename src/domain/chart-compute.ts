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
 * @conventions One ephemeris pass (one Julian day, one batch position call, one house call) then pure arithmetic; nothing is cached — results are cheap to recompute, not stored as a second source of truth; `housesAreDefined` must be checked before trusting house-derived fields. Point aspects (Asc/MC always; Vertex, Part of Fortune/Spirit opt-in via `aspectsTo`) are point-to-body only, use the planet orbs, and drop a part's aspect to its own "+" luminary (#516). Enrichments (declinations, fixedStars, obliquity) are optional fields computed alongside core chart data (#589) but can be lazy-loaded separately for better performance when not needed.
 * @exports computeChartData, computeChartDataAtJd, enrichChartData, housesAreDefined, isAspectParticipant, ChartData, ChartCalculationOptions, AngleAspect, NATAL_FIXED_STARS
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
import { bodyById, bodyByKey, BODIES } from '../astrology/bodies.js';
import { materializeCustomPoints, type ComputedCustomPoint } from './custom-point.js';
import type { CustomPointDefinition } from './person.js';
import type { EssentialDignities } from '../astrology/dignities.js';
import { DEFAULT_RULERSHIP_CHOICE, essentialDignitiesFor, type RulershipChoice } from '../astrology/rulership.js';
import { partOfFortune, partOfSpirit } from '../astrology/arabic-parts.js';
import { sectOf, type Sect } from '../astrology/sect.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import { FINITE_DIFFERENCE_DT_DAYS, finiteDifferenceRate } from '../ephemeris/finite-difference.js';
import type {
  BodyId,
  BodyPosition,
  Degrees,
  EphemerisProvider,
  GeoPosition,
  HousePositions,
  HouseSystem,
  JulianDayUT,
  PositionOptions,
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
  /** Persisted user formulas materialized as chart points after the ephemeris calculation (#566). */
  readonly customPoints?: readonly CustomPointDefinition[];
  /**
   * Per-object aspect participation (#585), keyed by `astrology/bodies.ts` body keys plus
   * `'vertex'`/`'partOfFortune'`/`'partOfSpirit'` — deliberately a plain string-keyed map, not
   * `chart/object-policy.ts`'s `ObjectKey` union, so this module stays decoupled from the
   * settings/UI layer the way it always has been; `extended-settings.ts`'s
   * `toChartCalculationOptions` is what actually populates every key from an `ObjectPolicies`.
   * A key absent from this map falls back to the implicit default it always had before this
   * existed: luminaries, planets and asteroids participate; Chiron, Lilith, the Nodes, the
   * Vertex and the two lots do not (matching most astrology tools' own "aspects to" defaults).
   */
  readonly aspectsTo?: Readonly<Partial<Record<string, boolean>>>;
}

/**
 * Whether `body` takes part in aspect-finding, per `aspectsTo` (#585) — the one place this
 * default/override logic lives, so `composite.ts`/`draconic.ts`/`harmonic.ts`/`return-chart.ts`
 * (each needing the same answer for their own cross-chart aspect-finding or contacts-table
 * filtering) read it from here rather than re-deriving their own copy. A prior, pre-#585 shape
 * grouped Lilith/the Nodes under single `lilith`/`lunarNodes` `aspectsTo` keys; those four
 * modules' own hand-rolled copies of this check still assumed that shape until this function
 * replaced them, which had silently broken Lilith/Node participation for every chart type but
 * the natal one once `aspectsTo` moved to one key per body (caught in #585 review, not by any
 * test — none of those modules' tests drive `aspectsTo` through `extended-settings.ts`'s
 * `toChartCalculationOptions`, only by hand in the old shape).
 */
export function isAspectParticipant(body: BodyId, aspectsTo: ChartCalculationOptions['aspectsTo']): boolean {
  const definition = bodyById(body);
  if (definition === undefined) return true;
  // Luminaries, planets and asteroids participated unconditionally before #585 ever gated
  // anything, so that stays the implicit default for a key `aspectsTo` doesn't name — only
  // Chiron/Lilith/the Nodes keep defaulting to excluded, matching their pre-#585 behavior.
  const participatesByDefault =
    definition.category === 'luminary' || definition.category === 'planet' || definition.category === 'asteroid';
  return aspectsTo?.[definition.key] ?? participatesByDefault;
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
 * The Ascendant, Midheaven, Vertex and the two lots' own longitude a short time after `jd` (#546)
 * — everything `findPointAspects` needs to turn into a real finite-difference rate for each,
 * instead of assuming a fixed sidereal-day rotation rate for all of them alike. `houseSystem`/
 * `zodiac`/`place` are the exact ones the first sample used, so the two samples differ only in
 * time.
 *
 * The lots' `sect` is the first sample's own `sect`, deliberately not recomputed here: a lot's
 * day/night formula is a property of the chart, held fixed everywhere else `sect` is used, not
 * something allowed to flip between two samples a minute apart. (A birth time known to the exact
 * minute of sunrise or sunset is the one case where the lot's own formula is genuinely
 * discontinuous — that is a property of the lot's definition, not an artifact of estimating its
 * rate this way, and is out of scope here.)
 */
async function anglePointLongitudesAfter(
  jd: JulianDayUT,
  place: GeoPosition,
  provider: EphemerisProvider,
  houseSystem: HouseSystem,
  zodiac: Zodiac | undefined,
  positionOptions: PositionOptions | undefined,
  sunId: BodyId,
  moonId: BodyId,
  sect: Sect,
): Promise<{
  readonly ascendant: Degrees;
  readonly midheaven: Degrees;
  readonly vertex: Degrees;
  readonly partOfFortune: Degrees;
  readonly partOfSpirit: Degrees;
}> {
  const jdAfter = jd + FINITE_DIFFERENCE_DT_DAYS;
  const [housesAfter, luminariesAfter] = await Promise.all([
    provider.houses(jdAfter, place, houseSystem, zodiac),
    provider.positions(jdAfter, [sunId, moonId], positionOptions),
  ]);
  const sunAfter = luminariesAfter.find((position) => position.body === sunId);
  const moonAfter = luminariesAfter.find((position) => position.body === moonId);
  if (sunAfter === undefined || moonAfter === undefined) {
    throw new Error('unreachable: the ephemeris returned no position for the Sun or Moon');
  }
  return {
    ascendant: housesAfter.ascendant,
    midheaven: housesAfter.midheaven,
    vertex: housesAfter.vertex,
    partOfFortune: partOfFortune(sect, housesAfter.ascendant, sunAfter.longitude, moonAfter.longitude),
    partOfSpirit: partOfSpirit(sect, housesAfter.ascendant, sunAfter.longitude, moonAfter.longitude),
  };
}

export interface ChartData {
  readonly positions: readonly BodyPosition[];
  /** User-defined formula points materialized into `positions`, retained for labels/provenance. */
  readonly customPoints?: readonly ComputedCustomPoint[];
  readonly houses: HousePositions;
  readonly aspects: readonly Aspect[];
  /**
   * Aspects from the Ascendant and Midheaven (always), and the Vertex, Part of Fortune and Part of Spirit (when
   * enabled in `aspectsTo`, #516), to each body that takes part in `aspects`. Points are never aspected to each other.
   * Undefined for a composite/harmonic chart (those have no real angles to aspect) and empty when
   * the houses have no solution.
   */
  readonly angleAspects?: readonly AngleAspect[];
  /**
   * The Ascendant, Midheaven, Vertex and the two lots' own instantaneous rate, in degrees/day, by
   * finite difference (#546) — the same rates `angleAspects` was found with. Exposed so a
   * cross-chart consumer that cannot itself resample the ephemeris (`relationship-themes.ts`'s
   * synastry angle contacts, which stay deliberately synchronous and pure over an already-
   * computed `ChartData`) can reuse this chart's own rates rather than falling back to a stand-in
   * constant. Same undefined-when-houses-aren't-usable condition as `angleAspects`.
   */
  readonly anglePointSpeeds?:
    | {
        readonly ascendant: Degrees;
        readonly midheaven: Degrees;
        readonly vertex: Degrees;
        readonly partOfFortune: Degrees;
        readonly partOfSpirit: Degrees;
      }
    | undefined;
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
 * only. Consulted (2026-10-11, #516) to check that convention, since no classical source gives lots or the Vertex
 * orbs of their own: the Solar Fire 9 User Guide (Esoteric Technologies, 2014), "Editing an Aspect Set" — luminary
 * orbs apply whenever one of the two points is the Sun or Moon, other orbs otherwise, and its Arabic Parts report
 * lists aspects to chart points with those same orbs. The manual is copyrighted and is not kept in the repo; it says
 * nothing about orbs coming from "the aspecting planet". Applying/separating is the
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
 * Extracts chart enrichments (declinations, fixedStars, obliquity) for a computed chart.
 * These are optional fields that can be lazy-loaded after the core chart is already computed (#589).
 * Useful for performance when enrichments aren't needed immediately.
 */
export async function enrichChartData(
  jd: JulianDayUT,
  provider: EphemerisProvider,
  positions: readonly BodyPosition[],
  positionOptions?: PositionOptions,
): Promise<{
  readonly declinations: ReadonlyMap<BodyId, Degrees>;
  readonly obliquity: Degrees;
  readonly fixedStars: ReadonlyMap<string, Degrees>;
}> {
  const bodyIds = Array.from(positions, (p) => p.body) as readonly number[];
  const [equatorialPositions, obliquity, fixedStarPositions] = await Promise.all([
    provider.positions(jd, bodyIds, { equatorial: true }),
    provider.obliquity(jd),
    Promise.all(NATAL_FIXED_STARS.map((name) => provider.fixedStar(jd, name, positionOptions))),
  ]);

  const declinations = new Map<BodyId, Degrees>(
    equatorialPositions.map((position) => [position.body, position.latitude]),
  );

  const fixedStars = new Map<string, Degrees>(
    fixedStarPositions.map((star, index) => [NATAL_FIXED_STARS[index] ?? '', star.longitude]),
  );

  return { declinations, obliquity, fixedStars };
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
    if (!isAspectParticipant(body.id, aspectsTo)) return [];
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
  const plusOfFortune = sect === 'day' ? moon.id : sun.id;
  const plusOfSpirit = sect === 'day' ? sun.id : moon.id;

  // None of the Ascendant, Midheaven, Vertex or the two lots is a body with its own analytic
  // speed — sampling a second time a short time later gives each its own real motion by finite
  // difference instead of assuming a fixed sidereal-day rotation rate for all of them alike
  // (#546). Only done when houses are usable at all: `angleAspects` is `[]` otherwise regardless.
  const housesUsable = housesAreDefined(houses);
  const after = housesUsable
    ? await anglePointLongitudesAfter(
        jd,
        place,
        provider,
        options.houseSystem ?? DEFAULT_HOUSE_SYSTEM,
        options.zodiac,
        positionOptions,
        sun.id,
        moon.id,
        sect,
      )
    : undefined;
  // Named once so both `points` (below) and `ChartData.anglePointSpeeds` (returned at the bottom,
  // for a cross-chart consumer like `relationship-themes.ts`'s synastry angle contacts to reuse
  // rather than re-deriving, or falling back to its own stand-in constant) read the same rates.
  const anglePointSpeeds =
    after === undefined
      ? undefined
      : {
          ascendant: finiteDifferenceRate(houses.ascendant, after.ascendant, FINITE_DIFFERENCE_DT_DAYS),
          midheaven: finiteDifferenceRate(houses.midheaven, after.midheaven, FINITE_DIFFERENCE_DT_DAYS),
          vertex: finiteDifferenceRate(houses.vertex, after.vertex, FINITE_DIFFERENCE_DT_DAYS),
          partOfFortune: finiteDifferenceRate(partOfFortuneLongitude, after.partOfFortune, FINITE_DIFFERENCE_DT_DAYS),
          partOfSpirit: finiteDifferenceRate(partOfSpiritLongitude, after.partOfSpirit, FINITE_DIFFERENCE_DT_DAYS),
        };
  const points: AspectPoint[] =
    anglePointSpeeds === undefined
      ? []
      : [
          { id: 'asc', longitude: houses.ascendant, speed: anglePointSpeeds.ascendant },
          { id: 'mc', longitude: houses.midheaven, speed: anglePointSpeeds.midheaven },
          ...(aspectsTo.vertex === true
            ? [{ id: 'vertex', longitude: houses.vertex, speed: anglePointSpeeds.vertex } as const]
            : []),
          ...(aspectsTo.partOfFortune === true
            ? [
                {
                  id: 'partOfFortune',
                  longitude: partOfFortuneLongitude,
                  speed: anglePointSpeeds.partOfFortune,
                  redundantLuminary: plusOfFortune,
                } as const,
              ]
            : []),
          ...(aspectsTo.partOfSpirit === true
            ? [
                {
                  id: 'partOfSpirit',
                  longitude: partOfSpiritLongitude,
                  speed: anglePointSpeeds.partOfSpirit,
                  redundantLuminary: plusOfSpirit,
                } as const,
              ]
            : []),
        ];
  const angleAspects = housesUsable ? findPointAspects(points, subjects, orbConfig) : [];

  const baseData: ChartData = {
    positions,
    houses,
    aspects,
    angleAspects,
    anglePointSpeeds,
    dignities,
    sect,
    partOfFortune: partOfFortuneLongitude,
    partOfSpirit: partOfSpiritLongitude,
    declinations,
    obliquity,
    fixedStars,
  };
  const customPoints = materializeCustomPoints(baseData, options.customPoints);
  if (customPoints.length === 0) return baseData;

  const customSubjects: AspectSubject[] = customPoints.map((point) => ({
    body: point.body,
    position: point.position,
    // A constructed point is neither a luminary nor an ephemeris body with a bespoke orb tier.
    // It therefore receives the standard non-luminary orb rules already used for ordinary points.
    category: 'asteroid',
  }));
  const customBodyIds = new Set(customPoints.map((point) => point.body));
  const customAspects = findAspects([...subjects, ...customSubjects], orbConfig).filter(
    (aspect) => customBodyIds.has(aspect.bodyA) || customBodyIds.has(aspect.bodyB),
  );
  return {
    ...baseData,
    positions: [...positions, ...customPoints.map((point) => point.position)],
    aspects: [...aspects, ...customAspects],
    customPoints,
  };
}
