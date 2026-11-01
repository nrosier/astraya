/**
 * Shapes a computed chart into the flat rows its data tables render (#44).
 *
 * Pure and framework-free, like everything under `src/domain`: no React, no
 * ephemeris call, just arithmetic over the `ChartData` `chart-compute.ts`
 * already produced. Kept separate from that module so the (slow, real-engine)
 * integration test for computing a chart and the (fast, pure) test for
 * shaping one into rows can run independently.
 */
/**
 * @module chart-tables
 * @purpose Shapes a computed `ChartData` into the flat rows a chart's data tables, wheel ring and sheet actually render (#44).
 * @conventions Pure and framework-free; kept separate from `chart-compute.ts` so the slow real-engine chart test and the fast pure row-shaping test can run independently; longitude is rounded to the nearest arcsecond before sign-splitting (`degreeParts`) to avoid a seconds rounding bumping the sign; the wheel's aspect web is limited to major aspects, tables show every aspect found.
 * @exports positionRows, houseCuspRows, angleRows, aspectRows, crossAspectRows, dignityRows, conditionRows, receptionRows, dispositorRows, declinationContactRows, antisciaRows, midpointTreeRows, allMidpointsRows, fixedStarRows, chartShapeOf, derivedPointRows, chartWheelRing, chartSheetMetaLines, chartSheetInput, degreeParts, visiblePositions, visibleAspects, visibleAngleAspects, almutenOfAscendant, AlmutenCandidateRow
 */
import { almutenOf, essentialDignityScoreOf } from '../astrology/almuten.js';
import { antiscialContacts, type AntiscialContact } from '../astrology/antiscia.js';
import { bodyById, bodyByKey } from '../astrology/bodies.js';
import { customPointByBody } from './custom-point.js';
import type { BoundsScheme } from '../astrology/bounds.js';
import { declinationContacts, isOutOfBounds } from '../astrology/declinations.js';
import { dispositorChain, isMutualReception } from '../astrology/dispositors.js';
import { elementBalance, houseOf, modalityBalance } from '../astrology/emphasis.js';
import { fixedStarConjunctions } from '../astrology/fixed-stars.js';
import { jonesBodyPositions, jonesShapeOf, type JonesShapeResult } from '../astrology/jones-shapes.js';
import { derivedPointByKey, type DerivedPointKey } from '../astrology/derived-points.js';
import { allMidpoints, midpointOf, midpointTree, oppositeMidpointOf } from '../astrology/midpoints.js';
import { mutualReceptionBetween, type DignityType } from '../astrology/reception.js';
import {
  angularityOfHouse,
  besiegementRescuesOf,
  isBesieged,
  isInHayz,
  motionOf,
  motionScoreOf,
  sectAlignmentOf,
  TRADITIONAL_PLANET_IDS,
  type Angularity,
  type BesiegementRescue,
  type Motion,
  type SectAlignment,
  type StationType,
} from '../astrology/planetary-condition.js';
import { DEFAULT_RULERSHIP_CHOICE, primaryRulerOf, rulersOf, type RulershipChoice } from '../astrology/rulership.js';
import { solarConditionOf, solarPhaseOf, type SolarCondition, type SolarPhase } from '../astrology/sect.js';
import { signIndex, signOf, type Element, type Modality } from '../astrology/signs.js';
import { formatCoordinate } from '../ui/format.js';
import { degreeParts, type DegreeParts } from './degree-parts.js';
import { housesAreDefined, type AngleAspect, type ChartData } from './chart-compute.js';
import { derivedPointLongitude } from './derived-point-position.js';
import { aspectHarmonicFamily, DEFAULT_ORB_CONFIG, type Aspect, type OrbConfig } from '../astrology/aspects.js';
import type { Locale } from '../interpretation/schema.js';
import type { BodyId, BodyPosition, Degrees } from '../ephemeris/types.js';
import type { BirthMomentInput } from '../time/types.js';
import type { WheelRingInput } from '../chart/multi-wheel.js';
import type { ChartSheetInput } from '../chart/chart-sheet.js';
import { filterAspectsForDisplay } from '../chart/aspect-web.js';

/**
 * Text glyphs for the Positions table's leftmost column, keyed by `BodyDefinition.key`
 * (see `bodies.ts`). Plain Unicode rather than the SVG paths `chart/glyphs.ts` draws on the
 * wheel: a table cell is plain text, round-tripped through Copy/CSV export (`table-sort.ts`),
 * so an inline `<svg>` per row isn't an option here. The three Lilith variants and both node
 * variants share their un-suffixed symbol — there's no widely used Unicode glyph that
 * distinguishes mean from true/osculating for either pair, only the body name does.
 */
const BODY_SYMBOLS: Readonly<Record<string, string>> = {
  sun: '☉',
  moon: '☽',
  mercury: '☿',
  venus: '♀',
  mars: '♂',
  jupiter: '♃',
  saturn: '♄',
  uranus: '♅',
  neptune: '♆',
  pluto: '♇',
  meanNode: '☊',
  trueNode: '☊',
  meanLilith: '⚸',
  osculatingLilith: '⚸',
  interpolatedLilith: '⚸',
  chiron: '⚷',
  pholus: '⯛',
  ceres: '⚳',
  pallas: '⚴',
  juno: '⚵',
  vesta: '⚶',
};

function bodySymbol(key: string): string {
  return BODY_SYMBOLS[key] ?? '';
}

export { degreeParts, type DegreeParts } from './degree-parts.js';

/**
 * Which computed points a chart's tables, wheel and matrix actually show (#542).
 *
 * `ChartCalculationOptions.aspectsTo` is still the compute-layer decision for whether a point
 * is a candidate for an aspect at all — a point this policy hides is never put back into
 * contention there. But hiding a point here is the single, final word on whether it can be
 * *seen* anywhere a user-facing surface draws from already-computed `ChartData`: the wheel, the
 * position/derived-point tables, the aspect matrix, and the aspect list all run their aspects
 * through `visibleAspects`/`visibleAngleAspects` below before rendering, so a point hidden here
 * cannot still "speak" through an aspect to something else on any of those four surfaces, even
 * though `ChartData.aspects`/`.angleAspects` themselves are untouched (the raw computed data
 * still carries it — only these filtered views omit it). Hiding an object is display-only and
 * never changes the interpretation: interpretation follows `ObjectPolicy.interpreted` instead,
 * via `interpretationExclusions` in `src/chart/object-policy.ts` (#721).
 */
export interface PointVisibilityOptions {
  /**
   * Per-object visibility (#585), keyed the same way `chart/object-policy.ts`'s `ObjectKey`
   * is: every body plus `'vertex'`/`'partOfFortune'`/`'partOfSpirit'`. A body key omitted here
   * stays visible (`isBodyVisible`'s own default); the three point keys default to hidden
   * instead (`pointVisible`'s own default) — the same asymmetry this file had before #585,
   * just both read from one map now instead of four separate named fields.
   */
  readonly bodyVisibility?: Readonly<Record<string, boolean>>;
  readonly midpointsVisible?: boolean; // default false
  readonly antisciaVisible?: boolean; // default false
  readonly antisciaMaxOrb?: Degrees; // default 1
  readonly declinationVisible?: boolean; // default false
  readonly declinationMaxOrb?: Degrees; // default 1
  /** The 90°-dial midpoint-tree table's own visibility (#556) — previously computed and even rendered by `chart/dial90.ts`, but with no setting or UI surface reaching it at all. */
  readonly dial90Visible?: boolean; // default false
  readonly midpointTreeOrb?: Degrees; // default 1
  /** The motion score column on the condition table (#724), a display-only option: off by default, and it changes no calculated value. */
  readonly motionScoreVisible?: boolean; // default false
}

/** Stable display/selection key for an ephemeris body or a materialized user formula point. */
export function chartBodyKey(data: ChartData, body: BodyId): string {
  return customPointByBody(data, body)?.name ?? bodyById(body)?.key ?? String(body);
}

/** Reader-facing name for an ephemeris body or a materialized user formula point. */
export function chartBodyName(data: ChartData, body: BodyId): string {
  return customPointByBody(data, body)?.name ?? bodyById(body)?.name ?? String(body);
}

function isBodyVisible(body: BodyId, options: PointVisibilityOptions): boolean {
  const definition = bodyById(body);
  return options.bodyVisibility?.[definition?.key ?? String(body)] ?? true;
}

/** The Vertex/Part of Fortune/Part of Spirit counterpart to `isBodyVisible` — these three default hidden, not visible, matching their pre-#585 defaults. */
function pointVisible(key: 'vertex' | 'partOfFortune' | 'partOfSpirit', options: PointVisibilityOptions): boolean {
  return options.bodyVisibility?.[key] ?? false;
}

/** Drops an independently-hidden modern point from a position list before every visible surface consumes it. */
export function visiblePositions(
  positions: readonly BodyPosition[],
  options: PointVisibilityOptions = {},
): readonly BodyPosition[] {
  return positions.filter((position) => isBodyVisible(position.body, options));
}

/**
 * Drops any body-to-body aspect touching a currently-hidden body. The single filter
 * `aspectRows`, `chartWheelRing` and `chartSheetInput` all apply before rendering an aspect
 * list, so an opted-out modern point cannot still appear through a contact elsewhere.
 */
export function visibleAspects(aspects: readonly Aspect[], options: PointVisibilityOptions = {}): readonly Aspect[] {
  return aspects.filter((aspect) => isBodyVisible(aspect.bodyA, options) && isBodyVisible(aspect.bodyB, options));
}

/**
 * The angle/lot-side counterpart to `visibleAspects` (#542): drops an `AngleAspect` whose point
 * side (Vertex/Fortune/Spirit) is currently hidden, or whose body side is a hidden Chiron. The
 * Ascendant and Midheaven have no visibility flag — they are never filtered out. This is the
 * fix for the matrix's old `aspectedPoints` workaround (`chartSheetInput`, below), which decided
 * whether Vertex/Fortune/Spirit appeared at all by whether they *had* an aspect, never by
 * whether the user had actually asked to see them.
 */
export function visibleAngleAspects(
  angleAspects: readonly AngleAspect[] | undefined,
  options: PointVisibilityOptions = {},
): readonly AngleAspect[] {
  if (angleAspects === undefined) return [];
  return angleAspects.filter((aspect) => {
    if (aspect.angle === 'vertex' && !pointVisible('vertex', options)) return false;
    if (aspect.angle === 'partOfFortune' && !pointVisible('partOfFortune', options)) return false;
    if (aspect.angle === 'partOfSpirit' && !pointVisible('partOfSpirit', options)) return false;
    if (!isBodyVisible(aspect.body, options)) return false;
    return true;
  });
}

/** The elements in the conventional order, warm to cold, and the modalities across them: the same as the exported grid. */
export const EMPHASIS_ELEMENTS: readonly Element[] = ['fire', 'earth', 'air', 'water'];
export const EMPHASIS_MODALITIES: readonly Modality[] = ['cardinal', 'fixed', 'mutable'];

/**
 * One row of the element x modality table (#511): the bodies standing in each of the row's three signs, and the
 * row's total. The `total` row (`rowKey: 'total'`) holds no bodies: its counts are the modality totals.
 */
export interface EmphasisRow {
  readonly rowKey: Element | 'total';
  readonly bodies: Readonly<Record<Modality, readonly string[]>>;
  readonly counts: Readonly<Record<Modality, number>>;
  readonly total: number;
}

export interface PositionRow extends DegreeParts {
  readonly bodyKey: string;
  readonly bodyName: string;
  readonly glyph: string;
  readonly longitude: Degrees;
  /** Undefined for the Ascendant/Midheaven rows `includeAngles` adds — they have no daily motion tracked. */
  readonly speed?: number;
  readonly retrograde?: boolean;
  /** Undefined for the Ascendant/Midheaven rows `includeAngles` adds — they define houses rather than sit in one. */
  readonly house?: number;
  /** True in the sign's final degree (29°) — the classical "anaretic" degree (#398). */
  readonly anaretic: boolean;
  /**
   * True when this body's declination is more extreme than the Sun's own maximum
   * (`declinations.ts`'s `isOutOfBounds`) — `undefined` for the Ascendant/Midheaven rows
   * `includeAngles` adds, and whenever `ChartData.declinations`/`.obliquity` aren't available
   * (a composite/harmonic chart — see `ChartData.declinations`'s own doc comment) (#398).
   */
  readonly outOfBounds?: boolean;
  /** Only with the station window on (#724): true when the planet is inside it, so it is stationary. */
  readonly stationary?: boolean;
  /** Only with the station window on (#724), and only for a stationary planet whose station type can be told. */
  readonly stationType?: StationType;
}

/**
 * The station fields of a position row (#724): `stationary` and, when it can be told, `stationType`. Empty when the
 * station window is off, or the planet is outside it, so an unchanged chart's rows are unchanged.
 */
function stationFieldsOf(data: ChartData, body: BodyId): { stationary?: boolean; stationType?: StationType } {
  const stationType = data.stationStates?.get(body);
  if (data.stationStates?.has(body) !== true) return {};
  return stationType === undefined ? { stationary: true } : { stationary: true, stationType };
}

/**
 * One row per visible body, in `ChartData.positions`' own order, plus — when `includeAngles`
 * is true — the Ascendant and Midheaven, matching Astro-Seek's combined layout rather than
 * Astraya's own previous split (a separate Angles table in the Houses tab, where the rest of
 * `angleRows`' angles still live). The caller passes `includeAngles` rather than this function
 * reading it off `ChartData` itself, since `data.houses` is always populated regardless of
 * whether the birth time is known — it's `ChartView`'s `showHouses` that decides whether the
 * Ascendant/Midheaven are actually meaningful to show.
 */
export function positionRows(
  data: ChartData,
  options: PointVisibilityOptions = {},
  includeAngles = false,
): readonly PositionRow[] {
  // #378: `data.houses` is always populated (see this function's own doc comment below) but not
  // always geometrically valid — a known birth time at a latitude the chosen house system has no
  // solution for still produces cusps, just `NaN` ones. `houseOf` throws on those (no finite cusp
  // ever compares as containing anything), so skip it rather than let every row crash the whole
  // table; omitting `house` entirely (not setting it to `undefined` — `exactOptionalPropertyTypes`
  // treats those differently) renders as "—", the same as the Ascendant/Midheaven rows.
  const housesUsable = housesAreDefined(data.houses);
  const bodyRows = visiblePositions(data.positions, options).map((position) => {
    const key = chartBodyKey(data, position.body);
    const parts = degreeParts(position.longitude);
    const declination = data.declinations?.get(position.body);
    return {
      bodyKey: key,
      bodyName: chartBodyName(data, position.body),
      glyph: bodySymbol(key),
      longitude: position.longitude,
      speed: position.longitudeSpeed,
      retrograde: position.retrograde,
      ...(housesUsable ? { house: houseOf(position.longitude, data.houses.cusps) } : {}),
      ...parts,
      anaretic: parts.degree === 29,
      ...(declination === undefined || data.obliquity === undefined
        ? {}
        : { outOfBounds: isOutOfBounds(declination, data.obliquity) }),
      // Only with the station window on (#724): absent entirely otherwise, so the row is unchanged.
      ...stationFieldsOf(data, position.body),
    };
  });
  if (!includeAngles) return bodyRows;
  const angles: readonly (readonly [string, string, string, Degrees])[] = [
    ['asc', 'Ascendant', 'AC', data.houses.ascendant],
    ['mc', 'Midheaven', 'MC', data.houses.midheaven],
  ];
  return [
    ...bodyRows,
    ...angles.map(([bodyKey, bodyName, glyph, longitude]) => {
      const parts = degreeParts(longitude);
      return {
        bodyKey,
        bodyName,
        glyph,
        longitude,
        ...parts,
        anaretic: parts.degree === 29,
      };
    }),
  ];
}

export interface HouseCuspRow extends DegreeParts {
  readonly house: number;
  readonly longitude: Degrees;
}

/** One row per house cusp (skipping the unused index 0). */
export function houseCuspRows(data: ChartData): readonly HouseCuspRow[] {
  const { cusps } = data.houses;
  const rows: HouseCuspRow[] = [];
  for (let house = 1; house < cusps.length; house++) {
    const longitude = cusps[house];
    if (longitude === undefined) continue;
    rows.push({ house, longitude, ...degreeParts(longitude) });
  }
  return rows;
}

export interface AngleRow extends DegreeParts {
  readonly label: string;
  readonly longitude: Degrees;
}

/**
 * The angles `HousePositions` carries alongside the cusps themselves, other than the
 * Ascendant and Midheaven — those two now live in the Positions table instead (see
 * `positionRows`' `includeAngles`), matching Astro-Seek's combined layout. The Vertex is
 * dropped unless its `bodyVisibility` entry (#585) is true.
 *
 * These `label`s are deliberately left untranslated by #158's glossary (`astro-names.messages.ts`):
 * unlike signs/bodies/aspects, there's no established Dutch astrological vocabulary for ARMC,
 * the Equatorial/Polar Ascendant, or the Co-Ascendant variants — the same out-of-scope treatment
 * house-system names already get.
 */
export function angleRows(data: ChartData, options: PointVisibilityOptions = {}): readonly AngleRow[] {
  const angles: readonly (readonly [string, Degrees])[] = [
    ['ARMC', data.houses.armc],
    ...(pointVisible('vertex', options) ? [['Vertex', data.houses.vertex] as const] : []),
    ['Equatorial Ascendant', data.houses.equatorialAscendant],
    ['Co-Ascendant (Koch)', data.houses.coAscendantKoch],
    ['Co-Ascendant (Munkasey)', data.houses.coAscendantMunkasey],
    ['Polar Ascendant', data.houses.polarAscendant],
  ];
  return angles.map(([label, longitude]) => ({ label, longitude, ...degreeParts(longitude) }));
}

export interface AspectRow {
  readonly bodyAKey: string;
  readonly bodyAName: string;
  readonly bodyBKey: string;
  readonly bodyBName: string;
  readonly aspect: string;
  readonly aspectKey: string;
  readonly angle: Degrees;
  readonly separation: Degrees;
  readonly orb: Degrees;
  readonly applying: boolean;
}

function basicAspectRow(aspect: Aspect): AspectRow {
  const bodyA = bodyById(aspect.bodyA);
  const bodyB = bodyById(aspect.bodyB);
  return {
    bodyAKey: bodyA?.key ?? String(aspect.bodyA),
    bodyAName: bodyA?.name ?? String(aspect.bodyA),
    bodyBKey: bodyB?.key ?? String(aspect.bodyB),
    bodyBName: bodyB?.name ?? String(aspect.bodyB),
    aspect: aspect.aspect.name,
    aspectKey: aspect.aspect.key,
    angle: aspect.aspect.angle,
    separation: aspect.separation,
    orb: aspect.orb,
    applying: aspect.applying,
  };
}

function aspectRow(data: ChartData, aspect: Aspect): AspectRow {
  return {
    bodyAKey: chartBodyKey(data, aspect.bodyA),
    bodyAName: chartBodyName(data, aspect.bodyA),
    bodyBKey: chartBodyKey(data, aspect.bodyB),
    bodyBName: chartBodyName(data, aspect.bodyB),
    aspect: aspect.aspect.name,
    aspectKey: aspect.aspect.key,
    angle: aspect.aspect.angle,
    separation: aspect.separation,
    orb: aspect.orb,
    applying: aspect.applying,
  };
}

/**
 * One row per aspect found, in `ChartData.aspects`' own order — minus any aspect touching a
 * currently-hidden point (`visibleAspects`, #542), so a hidden-but-still-aspecting Chiron can't
 * appear here even if it was a candidate at compute time.
 */
export function aspectRows(data: ChartData, options: PointVisibilityOptions = {}): readonly AspectRow[] {
  return visibleAspects(data.aspects, options).map((aspect) => aspectRow(data, aspect));
}

/** Keeps only rows from one of Addey’s aspect harmonic families, or every row when no family is chosen. */
export function filterAspectRowsByHarmonicFamily(
  rows: readonly AspectRow[],
  harmonicFamily: number | undefined,
): readonly AspectRow[] {
  if (harmonicFamily === undefined) return rows;
  return rows.filter((row) => aspectHarmonicFamily(row.aspectKey) === harmonicFamily);
}

/**
 * The same row shape as `aspectRows`, for a cross-chart aspect list (`findCrossAspects`) that
 * has no single `ChartData` to hang off of — the synastry aspect grid and the transit contacts
 * table (#172) both need this rather than `aspectRows`, since their aspects come from two
 * charts, not one.
 */
export function crossAspectRows(aspects: readonly Aspect[]): readonly AspectRow[] {
  return aspects.map(basicAspectRow);
}

export interface DignityRow {
  readonly bodyKey: string;
  readonly bodyName: string;
  readonly ruler: boolean;
  readonly exalted: boolean;
  readonly detriment: boolean;
  readonly fall: boolean;
  /** Day, night, or participating triplicity ruler of this body's own sign, for the chart's own sect (#398). */
  readonly triplicity: boolean;
  /** Egyptian bound ruler of this body's own degree (#398). */
  readonly bound: boolean;
  /** Chaldean face/decan ruler of this body's own degree (#398). */
  readonly face: boolean;
  /** Essential-dignity point score (ruler 5, exaltation 4, triplicity 3, bound 2, face 1) — `almuten.ts`'s own weights (#398). */
  readonly points: number;
  /** True exactly when `points` is 0 — holds no essential dignity at all here (#398). */
  readonly peregrine: boolean;
}

/**
 * One row per visible body, in `ChartData.positions`' own order — every body, not only ones holding a dignity.
 *
 * The point-scored `triplicity`/`bound`/`face`/`points`/`peregrine` fields are always scored under the
 * traditional rulership scheme (#545) — essential dignity and peregrine status are a historical-technique
 * question, not a cosmetic one, and must not change when a user toggles their modern/traditional/both
 * *display* rulership preference. Only the boolean `ruler`/`exalted`/`detriment`/`fall` fields (read from
 * `data.dignities`, built from that display preference in `chart-compute.ts`) are meant to vary with it.
 */
export function dignityRows(
  data: ChartData,
  options: PointVisibilityOptions = {},
  boundsScheme: BoundsScheme = 'egyptian',
): readonly DignityRow[] {
  return visiblePositions(data.positions, options).map((position) => {
    const body = bodyById(position.body);
    const dignities = data.dignities.get(position.body);
    // The same rulers as the chart's own `dignities`, so a planet in its own sign is never "peregrine".
    // Always traditional (#545) — see the function's own doc comment. `boundsScheme` is the one
    // axis a scheme bundle (#549) actually varies here.
    const score = essentialDignityScoreOf(position.body, position.longitude, data.sect, {
      rulershipScheme: 'traditional',
      boundsScheme,
    });
    return {
      bodyKey: body?.key ?? String(position.body),
      bodyName: body?.name ?? String(position.body),
      ruler: dignities?.ruler ?? false,
      exalted: dignities?.exalted ?? false,
      detriment: dignities?.detriment ?? false,
      fall: dignities?.fall ?? false,
      triplicity: score.triplicity,
      bound: score.bound,
      face: score.face,
      points: score.points,
      peregrine: score.peregrine,
    };
  });
}

export interface ConditionRow {
  readonly bodyKey: string;
  readonly bodyName: string;
  /** Essential-dignity point score, same scale and traditional-only scoring as `DignityRow.points` (#398, #545). */
  readonly points: number;
  readonly peregrine: boolean;
  readonly sectAlignment: SectAlignment;
  /** `undefined` when houses aren't usable (`housesAreDefined`). */
  readonly angularity?: Angularity;
  readonly motion: Motion;
  /** `undefined` when houses aren't usable — hayz needs the Ascendant. */
  readonly inHayz?: boolean;
  readonly besieged: boolean;
  /**
   * The fortunes (Sun, Jupiter, Venus) easing a besiegement (#724), each with the trine or sextile it casts
   * within 7 degrees (Bonatti, Part 3, Ch. XXI). Present only when `besieged` is true and at least one fortune
   * eases it; the planet stays `besieged: true` either way. Bodily insertion is not modelled.
   */
  readonly besiegementRescuedBy?: readonly BesiegementRescue[];
  /** `undefined` for the Sun itself (no phase/proximity relative to itself), or when exactly conjunct/opposite the Sun, where orientality is not a meaningful distinction (`solarPhaseOf`'s own doc comment). */
  readonly solarPhase?: SolarPhase | undefined;
  readonly solarCondition?: SolarCondition;
  /** Only with the station window on (#724), and only for a stationary planet whose station type can be told: its first or second station. */
  readonly stationType?: StationType;
  /** Only with the motion score on (#724): the points from `planetary-condition.ts`'s `motionScoreOf`. Absent for a stationary planet whose station type is unknown, which gets no score rather than a guessed one. */
  readonly motionScore?: number;
}

/**
 * The traditional planetary-condition table (#547): sect alignment, accidental dignity
 * (angularity, hayz), motion, besiegement, and solar phase/proximity, for each of the seven
 * traditional (Chaldean) planets — the standard first read of a traditional chart alongside
 * essential dignity (`dignityRows`, not duplicated here). Scoped to those seven: sect, hayz and
 * besiegement have no established reading for the outer planets, nodes, or asteroids
 * (`planetary-condition.ts`'s own doc comment).
 */
export function conditionRows(
  data: ChartData,
  orbConfig: OrbConfig = DEFAULT_ORB_CONFIG,
  boundsScheme: BoundsScheme = 'egyptian',
  options: { readonly motionScore?: boolean } = {},
): readonly ConditionRow[] {
  const housesUsable = housesAreDefined(data.houses);
  const sunBody = bodyByKey('sun');
  const marsBody = bodyByKey('mars');
  const saturnBody = bodyByKey('saturn');
  const sunPosition = sunBody === undefined ? undefined : data.positions.find((p) => p.body === sunBody.id);
  const marsPosition = marsBody === undefined ? undefined : data.positions.find((p) => p.body === marsBody.id);
  const saturnPosition = saturnBody === undefined ? undefined : data.positions.find((p) => p.body === saturnBody.id);

  const rows: ConditionRow[] = [];
  const stationStates = data.stationStates;
  for (const bodyId of TRADITIONAL_PLANET_IDS) {
    const position = data.positions.find((p) => p.body === bodyId);
    const body = bodyById(bodyId);
    if (position === undefined || body === undefined) continue;
    const score = essentialDignityScoreOf(bodyId, position.longitude, data.sect, {
      rulershipScheme: 'traditional',
      boundsScheme,
    });
    const isSun = sunBody?.id === bodyId;
    // Inside the station window (#724) the planet is stationary, with its own station type when that can be told.
    const stationary = stationStates?.has(bodyId) === true;
    const stationState = stationStates?.get(bodyId);
    const motionScore = motionScoreOf(bodyId, position.longitudeSpeed, stationary, stationState);
    const besieged =
      marsPosition !== undefined && saturnPosition !== undefined && !isSun
        ? isBesieged(position.longitude, marsPosition.longitude, saturnPosition.longitude, orbConfig)
        : false;
    // A besieged planet may be eased by a fortune's trine or sextile (#724); the planet itself never eases itself.
    const besiegementRescuedBy = besieged
      ? besiegementRescuesOf(
          position.longitude,
          data.positions
            .filter((other) => other.body !== bodyId)
            .flatMap((other) => {
              const key = bodyById(other.body)?.key;
              return key === undefined ? [] : [{ key, longitude: other.longitude }];
            }),
        )
      : [];
    rows.push({
      bodyKey: body.key,
      bodyName: body.name,
      points: score.points,
      peregrine: score.peregrine,
      sectAlignment: sectAlignmentOf(bodyId, data.sect),
      ...(housesUsable ? { angularity: angularityOfHouse(houseOf(position.longitude, data.houses.cusps)) } : {}),
      // With the station window off, `stationStates` is absent and the motion is as it always was (#724).
      motion: stationary ? 'stationary' : motionOf(position.longitudeSpeed),
      ...(stationary && stationState !== undefined ? { stationType: stationState } : {}),
      ...(options.motionScore === true && motionScore !== undefined ? { motionScore } : {}),
      ...(housesUsable ? { inHayz: isInHayz(bodyId, position.longitude, data.houses.ascendant, data.sect) } : {}),
      besieged,
      ...(besiegementRescuedBy.length > 0 ? { besiegementRescuedBy } : {}),
      ...(isSun || sunPosition === undefined
        ? {}
        : {
            solarPhase: solarPhaseOf(position.longitude, sunPosition.longitude),
            solarCondition: solarConditionOf(position.longitude, sunPosition.longitude),
          }),
    });
  }
  return rows;
}

export interface ReceptionRow {
  readonly bodyAKey: string;
  readonly bodyAName: string;
  readonly bodyBKey: string;
  readonly bodyBName: string;
  /** Never `'none'` — a pair with no reception at all is simply not a row. */
  readonly kind: 'oneWay' | 'mutual';
  /** Every dignity type A receives from B. */
  readonly aFromBTypes: readonly DignityType[];
  /** Every dignity type B receives from A. */
  readonly bFromATypes: readonly DignityType[];
  /** True for mutual reception of the *same* dignity type on both sides (e.g. both by domicile); false for mixed reception or a one-way pair. */
  readonly sameDignityType: boolean;
  /** Whether A and B are also in aspect to each other (#548) — reception "by aspect", traditionally the stronger, more immediately active case. */
  readonly aspectLinked: boolean;
}

/**
 * Every receiving pair among the seven traditional planets (#548) — one row per pair that has
 * at least a one-way reception; a pair with none at all is simply absent, not a zeroed-out row.
 * `data.aspects` is cross-referenced only to flag `aspectLinked`; this function never recomputes
 * aspects itself.
 */
export function receptionRows(data: ChartData, boundsScheme: BoundsScheme = 'egyptian'): readonly ReceptionRow[] {
  const rows: ReceptionRow[] = [];
  for (let i = 0; i < TRADITIONAL_PLANET_IDS.length; i++) {
    for (let j = i + 1; j < TRADITIONAL_PLANET_IDS.length; j++) {
      const bodyAId = TRADITIONAL_PLANET_IDS[i];
      const bodyBId = TRADITIONAL_PLANET_IDS[j];
      if (bodyAId === undefined || bodyBId === undefined) continue;
      const positionA = data.positions.find((p) => p.body === bodyAId);
      const positionB = data.positions.find((p) => p.body === bodyBId);
      if (positionA === undefined || positionB === undefined) continue;
      const result = mutualReceptionBetween(
        bodyAId,
        positionA.longitude,
        bodyBId,
        positionB.longitude,
        data.sect,
        'traditional',
        boundsScheme,
      );
      if (result.kind === 'none') continue;
      const bodyA = bodyById(bodyAId);
      const bodyB = bodyById(bodyBId);
      const aspectLinked = data.aspects.some(
        (aspect) =>
          (aspect.bodyA === bodyAId && aspect.bodyB === bodyBId) ||
          (aspect.bodyA === bodyBId && aspect.bodyB === bodyAId),
      );
      rows.push({
        bodyAKey: bodyA?.key ?? String(bodyAId),
        bodyAName: bodyA?.name ?? String(bodyAId),
        bodyBKey: bodyB?.key ?? String(bodyBId),
        bodyBName: bodyB?.name ?? String(bodyBId),
        kind: result.kind,
        aFromBTypes: result.aFromB.map((r) => r.dignityType),
        bFromATypes: result.bFromA.map((r) => r.dignityType),
        sameDignityType: result.sameDignityType,
        aspectLinked,
      });
    }
  }
  return rows;
}

export interface AlmutenCandidateRow {
  readonly bodyKey: string;
  readonly bodyName: string;
  readonly ruler: boolean;
  readonly exalted: boolean;
  readonly triplicity: boolean;
  readonly bound: boolean;
  readonly face: boolean;
  readonly points: number;
  readonly peregrine: boolean;
}

/**
 * "Almuten of the Ascendant" summary (#398, #551): which traditional planet holds the most
 * essential dignity at the Ascendant's own degree, and — unlike the original version of this
 * function — every candidate's own score breakdown, not only the winner's name. More than one
 * body can tie — `almutens` carries all of them, same as `almuten.ts`'s own `AlmutenResult`.
 * `undefined` when houses aren't usable (`housesAreDefined`), the same gate `ChartView`'s own
 * houses-dependent sections use.
 *
 * Always scored under the traditional rulership scheme (#545), never the user's modern/traditional/both
 * *display* preference — the Almuten is a historical-technique result, not a cosmetic one. There is
 * deliberately no `rulership` parameter here: forwarding the ambient display choice is exactly the leak
 * #545 fixed, so don't reintroduce one.
 */
export function almutenOfAscendant(
  data: ChartData,
  boundsScheme: BoundsScheme = 'egyptian',
): { readonly almutens: readonly string[]; readonly candidates: readonly AlmutenCandidateRow[] } | undefined {
  if (!housesAreDefined(data.houses)) return undefined;
  const result = almutenOf(data.houses.ascendant, data.sect, { rulershipScheme: 'traditional', boundsScheme });
  return {
    almutens: result.almutens.map((id) => bodyById(id)?.key ?? String(id)),
    candidates: result.scores.map((score) => {
      const body = bodyById(score.body);
      return {
        bodyKey: body?.key ?? String(score.body),
        bodyName: body?.name ?? String(score.body),
        ruler: score.ruler,
        exalted: score.exalted,
        triplicity: score.triplicity,
        bound: score.bound,
        face: score.face,
        points: score.points,
        peregrine: score.peregrine,
      };
    }),
  };
}

export interface DispositorRow {
  readonly bodyKey: string;
  readonly bodyName: string;
  /** Body keys from the queried body through to its final dispositor, or the body that closed a cycle. */
  readonly chain: readonly string[];
  readonly finalDispositorKey?: string;
  readonly finalDispositorName?: string;
  /** True when the chain looped back onto an earlier body instead of reaching a final dispositor. */
  readonly cycle: boolean;
  /** True when this body and its immediate dispositor rule each other's sign (#398). */
  readonly mutualReception: boolean;
  /** Under `both` (#426), the other ruler of the sign this body is in; the chain follows `chain[1]`, the modern one. */
  readonly coDispositorKey?: string;
}

/**
 * One row per visible luminary/planet (the ten bodies that can meaningfully rule a sign) —
 * asteroids, Chiron, the Lunar Nodes and Lilith are never a sign ruler themselves, so a
 * dispositor chain for one of them would only restate another body's own row (#398).
 */
export function dispositorRows(
  data: ChartData,
  options: PointVisibilityOptions = {},
  rulership: RulershipChoice = DEFAULT_RULERSHIP_CHOICE,
): readonly DispositorRow[] {
  const positions = new Map<BodyId, Degrees>(data.positions.map((position) => [position.body, position.longitude]));
  const classical = visiblePositions(data.positions, options).filter((position) => {
    const category = bodyById(position.body)?.category;
    return category === 'luminary' || category === 'planet';
  });
  return classical.map((position) => {
    const body = bodyById(position.body);
    const result = dispositorChain(position.body, positions, rulership);
    const immediateDispositor = result.chain[1];
    const immediateDispositorLongitude =
      immediateDispositor === undefined ? undefined : positions.get(immediateDispositor);
    const mutualReception =
      immediateDispositor !== undefined &&
      immediateDispositorLongitude !== undefined &&
      isMutualReception(
        position.body,
        position.longitude,
        immediateDispositor,
        immediateDispositorLongitude,
        rulership,
      );
    // The ruler the chain does not follow: only under Both, and only where the sign has two.
    const sign = signIndex(position.longitude);
    const coDispositor = rulersOf(sign, rulership).find((id) => id !== primaryRulerOf(sign, rulership));
    const finalBody = result.finalDispositor === undefined ? undefined : bodyById(result.finalDispositor);
    return {
      bodyKey: body?.key ?? String(position.body),
      bodyName: body?.name ?? String(position.body),
      chain: result.chain.map((id) => bodyById(id)?.key ?? String(id)),
      ...(finalBody === undefined ? {} : { finalDispositorKey: finalBody.key, finalDispositorName: finalBody.name }),
      cycle: result.cycle,
      mutualReception,
      ...(coDispositor === undefined ? {} : { coDispositorKey: bodyById(coDispositor)?.key ?? String(coDispositor) }),
    };
  });
}

export interface DeclinationContactRow {
  readonly bodyAKey: string;
  readonly bodyAName: string;
  readonly bodyBKey: string;
  readonly bodyBName: string;
  readonly kind: 'parallel' | 'contraparallel';
  readonly orb: Degrees;
}

/** Default parallel/contraparallel orb (#398) — tighter than a longitude aspect's, matching the convention most sources use for this equatorial contact. */
const DEFAULT_DECLINATION_ORB: Degrees = 1;

/**
 * Every parallel/contraparallel contact within `orb` (default 1°) — `undefined` (returns an
 * empty list) when `ChartData.declinations` isn't available, i.e. a composite/harmonic chart
 * (see that field's own doc comment) (#398).
 */
export function declinationContactRows(
  data: ChartData,
  orb: Degrees = DEFAULT_DECLINATION_ORB,
): readonly DeclinationContactRow[] {
  if (data.declinations === undefined) return [];
  return declinationContacts(data.declinations, orb).map((contact) => {
    const bodyA = bodyById(contact.a);
    const bodyB = bodyById(contact.b);
    return {
      bodyAKey: bodyA?.key ?? String(contact.a),
      bodyAName: bodyA?.name ?? String(contact.a),
      bodyBKey: bodyB?.key ?? String(contact.b),
      bodyBName: bodyB?.name ?? String(contact.b),
      kind: contact.kind,
      orb: contact.orb,
    };
  });
}

export interface AntisciaRow {
  readonly bodyKey: string;
  readonly bodyName: string;
  readonly contactKey: string;
  readonly contactName: string;
  readonly kind: AntiscialContact['kind'];
  readonly orb: Degrees;
}

/** Default antiscial contact orb (#398) — matches `declinationContactRows`' own default, both tighter than a longitude aspect's. */
const DEFAULT_ANTISCIA_ORB: Degrees = 1;

/**
 * Every antiscion/contra-antiscion contact within `orb` (default 1°), one row per body pair
 * (deduplicated — `antiscialContacts` otherwise reports each pair from both sides of the
 * mirror, the same duplication `chart/antiscia-overlay.ts`'s own `filterAntisciaForDisplay`
 * exists to drop for the wheel overlay; this table needs the identical dedupe) (#398).
 */
export function antisciaRows(data: ChartData, orb: Degrees = DEFAULT_ANTISCIA_ORB): readonly AntisciaRow[] {
  const positions = new Map<BodyId, Degrees>(data.positions.map((position) => [position.body, position.longitude]));
  const seen = new Set<string>();
  const rows: AntisciaRow[] = [];
  for (const contact of antiscialContacts(positions, orb)) {
    const [x, y] = contact.body <= contact.contact ? [contact.body, contact.contact] : [contact.contact, contact.body];
    const key = `${contact.kind}:${String(x)}:${String(y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const body = bodyById(contact.body);
    const contactBody = bodyById(contact.contact);
    rows.push({
      bodyKey: body?.key ?? String(contact.body),
      bodyName: body?.name ?? String(contact.body),
      contactKey: contactBody?.key ?? String(contact.contact),
      contactName: contactBody?.name ?? String(contact.contact),
      kind: contact.kind,
      orb: contact.orb,
    });
  }
  return rows;
}

export interface MidpointTreeRow extends DegreeParts {
  readonly bodyKey: string;
  readonly bodyName: string;
  readonly pairAKey: string;
  readonly pairAName: string;
  readonly pairBKey: string;
  readonly pairBName: string;
  readonly midpoint: Degrees;
  readonly orb: Degrees;
}

/** Default 90°-dial midpoint-tree orb (#556) — matches `overlay-options.ts`'s own `DEFAULT_MAX_ORB`. */
const DEFAULT_MIDPOINT_TREE_ORB: Degrees = 1;

/**
 * Every "hit" in `astrology/midpoints.ts`'s dial midpoint tree (#556, #555): a body sitting
 * within `orb` of another pair's midpoint, collapsed onto the dial (default 90°, optionally 45°
 * for the finer Uranian-school reading — see `midpoints.ts`'s own doc comment) so
 * conjunction/square/opposition (and, at 45°, semisquare/sesquiquadrate too) hits are all
 * caught, not just exact conjunctions to the raw midpoint longitude.
 */
export function midpointTreeRows(
  data: ChartData,
  orb: Degrees = DEFAULT_MIDPOINT_TREE_ORB,
  divisor: Degrees = 90,
): readonly MidpointTreeRow[] {
  const positions = new Map<BodyId, Degrees>(data.positions.map((position) => [position.body, position.longitude]));
  return midpointTree(positions, orb, divisor).map((hit) => {
    const body = bodyById(hit.body);
    const pairA = bodyById(hit.a);
    const pairB = bodyById(hit.b);
    return {
      bodyKey: body?.key ?? String(hit.body),
      bodyName: body?.name ?? String(hit.body),
      pairAKey: pairA?.key ?? String(hit.a),
      pairAName: pairA?.name ?? String(hit.a),
      pairBKey: pairB?.key ?? String(hit.b),
      pairBName: pairB?.name ?? String(hit.b),
      midpoint: hit.midpoint,
      orb: hit.orb,
      ...degreeParts(hit.midpoint),
    };
  });
}

export interface AllMidpointsRow extends DegreeParts {
  readonly bodyAKey: string;
  readonly bodyAName: string;
  readonly bodyBKey: string;
  readonly bodyBName: string;
  readonly kind: 'direct' | 'indirect';
  readonly midpoint: Degrees;
}

/**
 * Every body-pair midpoint (#555) — not just the two fixed pairs `derivedPointRows` has always
 * shown (ASC/MC, Sun/Moon) — both the conventional near/"direct" midpoint (half the shorter
 * arc, Ebertin's convention) and the far/"indirect" one (its antipode), one row each, so a
 * caller sorting or filtering by `kind` sees both without a second call. Angles (ASC/MC/Vertex)
 * are deliberately excluded: `astrology/midpoints.ts`'s `BodyId`-keyed functions only accept
 * real Swiss Ephemeris body ids, and angles have none — see that module's own doc comment;
 * `derivedPointRows`' existing hand-rolled ASC/MC midpoint row is unaffected and still the only
 * angle-involving midpoint this codebase computes.
 */
export function allMidpointsRows(data: ChartData): readonly AllMidpointsRow[] {
  const positions = new Map<BodyId, Degrees>(data.positions.map((position) => [position.body, position.longitude]));
  const rows: AllMidpointsRow[] = [];
  for (const pair of allMidpoints(positions)) {
    const bodyA = bodyById(pair.a);
    const bodyB = bodyById(pair.b);
    const shared = {
      bodyAKey: bodyA?.key ?? String(pair.a),
      bodyAName: bodyA?.name ?? String(pair.a),
      bodyBKey: bodyB?.key ?? String(pair.b),
      bodyBName: bodyB?.name ?? String(pair.b),
    };
    rows.push({ ...shared, kind: 'direct', midpoint: pair.midpoint, ...degreeParts(pair.midpoint) });
    const indirect = oppositeMidpointOf(positions.get(pair.a) ?? 0, positions.get(pair.b) ?? 0);
    rows.push({ ...shared, kind: 'indirect', midpoint: indirect, ...degreeParts(indirect) });
  }
  return rows;
}

export interface FixedStarRow {
  readonly star: string;
  readonly bodyKey: string;
  readonly bodyName: string;
  readonly orb: Degrees;
  /** Stored designation of a chosen star (#803); absent for the preset. */
  readonly designation?: string;
  /** Lowercase hex SHA-256 of the catalogue file the star was chosen from (#803); absent for the preset. */
  readonly sourceSha256?: string;
}

/** Default fixed-star conjunction orb (#398) — the same tight 1° convention as antiscia/declination contacts. */
const DEFAULT_FIXED_STAR_ORB: Degrees = 1;

/**
 * Every conjunction within `orb` (default 1°) between a visible body and one of
 * `NATAL_FIXED_STARS` (#398). An empty list, not an error, when `ChartData.fixedStars` isn't
 * available (a composite/harmonic chart — see that field's own doc comment).
 */
export function fixedStarRows(
  data: ChartData,
  options: PointVisibilityOptions = {},
  orb: Degrees = DEFAULT_FIXED_STAR_ORB,
): readonly FixedStarRow[] {
  if (data.fixedStars === undefined) return [];
  const positions = new Map<BodyId, Degrees>(
    visiblePositions(data.positions, options).map((position) => [position.body, position.longitude]),
  );
  return fixedStarConjunctions(data.fixedStars, positions, orb).map((contact) => {
    const body = bodyById(contact.body);
    const source = data.fixedStarSources?.get(contact.star);
    return {
      star: contact.star,
      bodyKey: body?.key ?? String(contact.body),
      bodyName: body?.name ?? String(contact.body),
      orb: contact.orb,
      ...(source === undefined ? {} : { designation: source.designation, sourceSha256: source.sourceSha256 }),
    };
  });
}

/**
 * The chart's overall Jones shape (#35, #398) — worked out from the ten planets only (`jonesBodyPositions`,
 * #430), whatever points the chart displays, and `undefined` only when fewer than two of them are
 * present, where `jonesShapeOf` would otherwise throw.
 */
export function chartShapeOf(data: ChartData): JonesShapeResult | undefined {
  const positions = jonesBodyPositions(data.positions);
  return positions.size < 2 ? undefined : jonesShapeOf(positions);
}

export interface DerivedPointRow extends DegreeParts {
  /** The corpus vocabulary's key for this point (`part-of-fortune`/`part-of-spirit`), what a selection and its meaning are keyed by; absent for the midpoints, which have neither (#511). */
  readonly pointKey?: DerivedPointKey | undefined;
  readonly label: string;
  readonly longitude: Degrees;
}

/**
 * Part of Fortune and Part of Spirit (sect-corrected in `computeChartData` already), each
 * dropped unless its own `bodyVisibility` entry (#585, formerly separate `fortuneVisible`/
 * `spiritVisible` flags) is true, and — when `midpointsVisible` is true — the ASC/MC and
 * Sun/Moon midpoints Astro-Seek shows by default.
 *
 * Same as `angleRows`, these `label`s stay untranslated — no vetted Dutch term exists for these
 * compound derived-point names, so #158's glossary treats them as out of scope.
 */
export function derivedPointRows(data: ChartData, options: PointVisibilityOptions = {}): readonly DerivedPointRow[] {
  const keyed = (pointKey: DerivedPointKey): DerivedPointRow => {
    const longitude = derivedPointLongitude(data, pointKey);
    return { pointKey, label: derivedPointByKey(pointKey)?.label ?? pointKey, longitude, ...degreeParts(longitude) };
  };

  // The midpoints are a display option only: no corpus entry or selection exists for them (#511), so no `pointKey`.
  const midpointRows: DerivedPointRow[] = [];
  if (options.midpointsVisible === true) {
    const ascMc = midpointOf(data.houses.ascendant, data.houses.midheaven);
    midpointRows.push({ label: 'ASC/MC Midpoint', longitude: ascMc, ...degreeParts(ascMc) });

    const sunBody = bodyByKey('sun');
    const moonBody = bodyByKey('moon');
    const sunPosition = sunBody && data.positions.find((position) => position.body === sunBody.id);
    const moonPosition = moonBody && data.positions.find((position) => position.body === moonBody.id);
    if (sunPosition && moonPosition) {
      const sunMoon = midpointOf(sunPosition.longitude, moonPosition.longitude);
      midpointRows.push({ label: 'Sun/Moon Midpoint', longitude: sunMoon, ...degreeParts(sunMoon) });
    }
  }

  return [
    ...(pointVisible('partOfFortune', options) ? [keyed('part-of-fortune')] : []),
    // Spirit has its own visibility entry too (#542) — it used to be shown unconditionally,
    // unlike its sibling Fortune, which could already be hidden.
    ...(pointVisible('partOfSpirit', options) ? [keyed('part-of-spirit')] : []),
    ...midpointRows,
  ];
}

/**
 * Shapes a computed chart as the single ring `renderMultiWheelSvg` (#52) needs to draw it.
 *
 * The wheel's aspect web is limited to the five major (Ptolemaic) aspects — conjunction,
 * sextile, square, trine, opposition — the same default nearly every astrology tool ships
 * with. Astraya computes six minor aspects too (semisextile, semisquare, quintile,
 * sesquiquadrate, biquintile, quincunx), but drawing all eleven as chords turns the wheel
 * into a knot; the Aspects tab and the sheet's aspect matrix still show every aspect Astraya
 * finds, minor ones included, so nothing is actually hidden — only the wheel's chords are.
 */
export function chartWheelRing(data: ChartData, label = 'Natal', options: PointVisibilityOptions = {}): WheelRingInput {
  // Saved formula points are shown on the Bodies tab and in the tables only, never on the wheel (#817, moved to #824).
  const isWheelBody = (body: BodyId): boolean => customPointByBody(data, body) === undefined;
  return {
    label,
    houses: data.houses,
    bodies: visiblePositions(data.positions, options)
      .filter((position) => isWheelBody(position.body))
      .map((position) => ({
        body: position.body,
        key: chartBodyKey(data, position.body),
        longitude: position.longitude,
        retrograde: position.retrograde,
      })),
    aspects: filterAspectsForDisplay(
      visibleAspects(data.aspects, options).filter((aspect) => isWheelBody(aspect.bodyA) && isWheelBody(aspect.bodyB)),
      { visibleFamilies: ['major'] },
    ),
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The header lines a chart sheet is titled with: who, when, where.
 *
 * The civil date and time are printed exactly as the user entered them, with no
 * zone conversion — a chart's header states the birth record, and a reader
 * checking the sheet against a birth certificate needs the figures on the
 * certificate, not the UTC instant derived from them. Coordinates are given in
 * decimal degrees with a hemisphere letter, which is unambiguous at any
 * precision (unlike a signed number, whose sign convention differs by source).
 *
 * `displayName` is printed as given, empty string included — a fallback for that case (as
 * `chartSheetInput`'s own call site already resolves via `t.chartFallback`) is the caller's
 * job, not this pure function's, since only the caller has a `t` to translate it with.
 */
export function chartSheetMetaLines(displayName: string, moment: BirthMomentInput, locale: Locale): readonly string[] {
  const { civil, coordinates } = moment;
  const date = `${String(civil.year)}-${pad2(civil.month)}-${pad2(civil.day)}`;
  const time = `${pad2(civil.hour)}:${pad2(civil.minute)}`;
  const latitude = formatCoordinate(coordinates.latitude, 'lat', locale);
  const longitude = formatCoordinate(coordinates.longitude, 'lon', locale);
  const zone = moment.zoneOverride ?? (moment.offsetOverrideMinutes === undefined ? undefined : 'stated offset');
  return [
    displayName,
    zone === undefined ? `${date} ${time}` : `${date} ${time} (${zone})`,
    `${latitude} ${longitude}`,
  ];
}

/**
 * Shapes a computed chart as the whole sheet `renderChartSheetSvg` draws.
 *
 * All three data panels take their bodies from `data.positions` in its own
 * order, so a chart computed with the asteroids switched on grows every panel
 * together, and the aspect grid's rows line up with the Positions table above
 * it. Aspects are passed through rather than re-derived, which is what keeps
 * the grid from ever disagreeing with the Aspects table on the same screen.
 */
export function chartSheetInput(
  data: ChartData,
  metaLines: readonly string[] = [],
  label = 'Natal',
  options: PointVisibilityOptions = {},
  /** Localized body name for the grid's positions table; the English `BodyDefinition.name` when omitted. */
  nameOf: (bodyKey: string) => string = (bodyKey) => bodyByKey(bodyKey)?.name ?? bodyKey,
): ChartSheetInput {
  const bodies = visiblePositions(data.positions, options).map((position) => {
    return {
      body: position.body,
      key: chartBodyKey(data, position.body),
      label: chartBodyName(data, position.body),
      longitude: position.longitude,
      retrograde: position.retrograde,
    };
  });
  const rows = new Map(positionRows(data, options, true).map((row) => [row.bodyKey, row]));
  const angleBodies = [
    { key: 'asc', label: 'AC', name: 'ASC', longitude: data.houses.ascendant },
    { key: 'mc', label: 'MC', name: 'MC', longitude: data.houses.midheaven },
  ];
  // The Vertex and the two parts get a matrix row exactly when the user has made them visible
  // (#542) — previously this was driven by whether the point happened to have an aspect at all
  // (`data.angleAspects`), which meant a visible point with no aspects never got a row (unlike
  // every ordinary body, which always gets one), and a hidden point *with* an aspect still did.
  const extraPoints = [
    ...(pointVisible('vertex', options)
      ? [{ key: 'vertex', label: 'VX', name: 'Vertex', longitude: data.houses.vertex }]
      : []),
    ...(pointVisible('partOfFortune', options)
      ? [{ key: 'partOfFortune', label: 'PF', name: 'Fortune', longitude: data.partOfFortune }]
      : []),
    ...(pointVisible('partOfSpirit', options)
      ? [{ key: 'partOfSpirit', label: 'PS', name: 'Spirit', longitude: data.partOfSpirit }]
      : []),
  ];
  const keyOf = (body: BodyId): string => bodyById(body)?.key ?? String(body);
  return {
    metaLines,
    rings: [chartWheelRing(data, label, options)],
    overlays: {
      positions: bodies,
      ...(options.antisciaVisible === true
        ? {
            antiscia: antiscialContacts(
              new Map(bodies.map((body) => [body.body, body.longitude])),
              options.antisciaMaxOrb ?? DEFAULT_ANTISCIA_ORB,
            ),
          }
        : {}),
      ...(options.declinationVisible === true && data.declinations !== undefined
        ? {
            declinations: declinationContacts(
              new Map(
                bodies.flatMap((body) => {
                  const declination = data.declinations?.get(body.body);
                  return declination === undefined ? [] : [[body.body, declination] as const];
                }),
              ),
              options.declinationMaxOrb ?? DEFAULT_DECLINATION_ORB,
            ),
          }
        : {}),
      ...(options.dial90Visible === true
        ? {
            midpointHits: midpointTree(
              new Map(bodies.map((body) => [body.body, body.longitude])),
              options.midpointTreeOrb ?? DEFAULT_MIDPOINT_TREE_ORB,
            ),
          }
        : {}),
    },
    matrix: {
      bodies: [
        ...bodies.map((body) => {
          const house = rows.get(body.key)?.house;
          return {
            key: body.key,
            label: body.label,
            name: nameOf(body.key),
            longitude: body.longitude,
            retrograde: body.retrograde,
            ...(house === undefined ? {} : { house }),
          };
        }),
        ...angleBodies,
        ...extraPoints,
      ],
      aspects: [
        ...visibleAspects(data.aspects, options).map((aspect) => ({
          aKey: keyOf(aspect.bodyA),
          bKey: keyOf(aspect.bodyB),
          aspectKey: aspect.aspect.key,
          orb: aspect.orb,
          signedOrb: aspect.separation - aspect.aspect.angle,
          applying: aspect.applying,
        })),
        ...visibleAngleAspects(data.angleAspects, options).map((aspect) => ({
          aKey: aspect.angle,
          bKey: keyOf(aspect.body),
          aspectKey: aspect.aspect.key,
          orb: aspect.orb,
          signedOrb: aspect.separation - aspect.aspect.angle,
          applying: aspect.applying,
          orbRule: aspect.orbRule,
        })),
      ],
    },
    emphasis: { bodies: bodies.map(({ body, key, longitude }) => ({ body, key, longitude })) },
    strip: { bodies: bodies.map(({ key, longitude }) => ({ key, longitude })) },
  };
}

/**
 * The element x modality table, the same twelve cells the exported sheet's grid draws, as rows a reader can sort,
 * copy and export: each element's bodies by modality and the totals, then a closing row of modality totals. The
 * margins come from `elementBalance`/`modalityBalance`, as the drawing's do.
 */
export function emphasisRows(data: ChartData, options: PointVisibilityOptions = {}): readonly EmphasisRow[] {
  const visible = visiblePositions(data.positions, options);
  const positions = new Map(visible.map((position) => [position.body, position.longitude]));
  const elements = elementBalance(positions);
  const modalities = modalityBalance(positions);
  const keyOf = (body: BodyId): string => bodyById(body)?.key ?? String(body);
  const rows: EmphasisRow[] = EMPHASIS_ELEMENTS.map((element) => {
    const bodies = { cardinal: [] as string[], fixed: [] as string[], mutable: [] as string[] };
    for (const position of visible) {
      const sign = signOf(position.longitude);
      if (sign.element === element) bodies[sign.modality].push(keyOf(position.body));
    }
    return {
      rowKey: element,
      bodies,
      counts: { cardinal: bodies.cardinal.length, fixed: bodies.fixed.length, mutable: bodies.mutable.length },
      total: elements[element],
    };
  });
  rows.push({
    rowKey: 'total',
    bodies: { cardinal: [], fixed: [], mutable: [] },
    counts: { cardinal: modalities.cardinal, fixed: modalities.fixed, mutable: modalities.mutable },
    total: visible.length,
  });
  return rows;
}
