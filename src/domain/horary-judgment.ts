/**
 * Horary judgment (#552): significator selection, perfection by direct aspect, reception,
 * translation of light, collection of light, prohibition, frustration, and refranation — the apparatus a horary question
 * needs beyond `horary.ts`'s existing "considerations before judgment" (#406), which only checks
 * whether a chart is fit to be judged at all, not what it says once it is.
 *
 * Built entirely on this project's existing engines — rulership (`dignities.ts`'s `rulerOf`),
 * aspects (`aspects.ts`, already computed on `ChartData.aspects`), and reception (`reception.ts`'s
 * `mutualReceptionBetween`) — nothing here is new spherical trigonometry, only a horary-specific
 * composition of what already exists.
 *
 * Scoped to the seven classical planets throughout (significators, translators, collectors,
 * prohibitors): horary's own tradition never uses the outer planets, nodes, or asteroids in this
 * role, matching the same scope `planetary-condition.ts`/`reception.ts` already use.
 *
 * Prohibition uses relative-motion estimates when positions are supplied. Frustration is reported
 * when a significator changes sign before that estimate can perfect; refranation is reported when
 * a supplied station forecast turns a significator retrograde/direct before perfection.
 */
/**
 * @module domain/horary-judgment
 * @purpose Horary significator selection, perfection and impediment detection, reception, and relative-motion timing.
 * @conventions Scoped to the seven classical planets; forward station forecasts are supplied by the caller because ChartData has no future ephemeris context.
 * @exports HORARY_PLANET_IDS, Significator, significatorOf, PerfectionKind, PerfectionResult, HoraryMotionForecast, judgePerfection, HoraryJudgmentOptions, HoraryMoonInput, HoraryJudgment, receptionAidsPerfection, judgeHorary
 */
import { bodyById, bodyByKey } from '../astrology/bodies.js';
import type { Aspect } from '../astrology/aspects.js';
import { rulerOf, type RulershipScheme } from '../astrology/dignities.js';
import { horaryConsiderations, isRadical, type HoraryConsideration, type HoraryInput } from '../astrology/horary.js';
import { mutualReceptionBetween, type MutualReceptionResult } from '../astrology/reception.js';
import { signIndex } from '../astrology/signs.js';
import { findStations } from '../astrology/stations.js';
import type { BodyId, BodyPosition, Degrees, EphemerisProvider, JulianDayUT } from '../ephemeris/types.js';
import type { ChartData } from './chart-compute.js';
import { houseOf } from '../astrology/emphasis.js';

function idOf(key: string): BodyId {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`unreachable: "${key}" is always in BODIES`);
  return body.id;
}

/** The seven classical planets — the only bodies horary tradition uses as significator, translator, collector, or prohibitor. */
export const HORARY_PLANET_IDS: readonly BodyId[] = (
  ['saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon'] as const
)
  .map((key) => bodyByKey(key)?.id)
  .filter((id): id is BodyId => id !== undefined);

export interface Significator {
  readonly house: number;
  readonly ruler: BodyId;
  readonly rulerKey: string;
}

/** The ruler of a house's own cusp sign — a querent's or quesited's significator. */
export function significatorOf(
  house: number,
  cusps: readonly Degrees[],
  scheme: RulershipScheme = 'traditional',
): Significator {
  const cusp = cusps[house];
  if (cusp === undefined) throw new RangeError(`house ${house} has no cusp in a 13-entry cusps array`);
  const ruler = rulerOf(signIndex(cusp), scheme);
  return { house, ruler, rulerKey: bodyById(ruler)?.key ?? String(ruler) };
}

function aspectBetween(aspects: readonly Aspect[], a: BodyId, b: BodyId): Aspect | undefined {
  return aspects.find(
    (aspect) => (aspect.bodyA === a && aspect.bodyB === b) || (aspect.bodyA === b && aspect.bodyB === a),
  );
}

export type PerfectionKind =
  'directAspect' | 'translation' | 'collection' | 'prohibition' | 'frustration' | 'refranation' | 'none';

export interface PerfectionResult {
  readonly kind: PerfectionKind;
  /** Set for `'directAspect'`. */
  readonly aspect?: Aspect;
  /** The carrying/collecting/prohibiting body, set for every kind but `'directAspect'`/`'none'`. */
  readonly thirdBody?: BodyId;
  readonly thirdBodyKey?: string;
  /** Linear relative-motion estimate from the current chart to exactness, in days. */
  readonly timeToPerfectDays?: number;
  readonly impedimentBody?: BodyId;
}

export interface HoraryMotionForecast {
  /** Days from the question moment to a significator's next station, if one occurs in the search window. */
  readonly stationDays?: ReadonlyMap<BodyId, number>;
  /** Days from the question moment to a significator's next sign change under its current motion. */
  readonly signChangeDays?: ReadonlyMap<BodyId, number>;
}

function timeToPerfect(aspect: Aspect, positions: readonly BodyPosition[] | undefined): number | undefined {
  if (positions === undefined) return undefined;
  const a = positions.find((position) => position.body === aspect.bodyA);
  const b = positions.find((position) => position.body === aspect.bodyB);
  if (a === undefined || b === undefined) return undefined;
  const relativeSpeed = Math.abs(a.longitudeSpeed - b.longitudeSpeed);
  return relativeSpeed === 0 ? undefined : aspect.orb / relativeSpeed;
}

/**
 * Whether and how the question perfects. A direct applying aspect between the significators is
 * the base case, but it is checked for prohibition first — a third body applying to either
 * significator with a tighter orb reaches its own perfection first and prevents the direct
 * aspect from completing, so `'prohibition'` outranks `'directAspect'` precisely when there was
 * a direct aspect to prohibit in the first place. Without a (forming) direct aspect at all,
 * translation of light is checked next, then collection; otherwise no perfection is found among
 * the seven classical planets.
 */
export function judgePerfection(
  aspects: readonly Aspect[],
  querent: BodyId,
  quesited: BodyId,
  positions?: readonly BodyPosition[],
  motionForecast?: HoraryMotionForecast,
): PerfectionResult {
  const direct = aspectBetween(aspects, querent, quesited);
  const others = HORARY_PLANET_IDS.filter((id) => id !== querent && id !== quesited);

  if (direct?.applying === true) {
    const directTiming = timeToPerfect(direct, positions);
    // Prohibition (simplification — see the module's own header): a third body's applying
    // aspect to either significator with a tighter orb reaches its own perfection first.
    for (const third of others) {
      for (const target of [querent, quesited]) {
        const toThird = aspectBetween(aspects, third, target);
        const interferenceTiming = toThird === undefined ? undefined : timeToPerfect(toThird, positions);
        const perfectsFirst =
          interferenceTiming !== undefined && directTiming !== undefined
            ? interferenceTiming < directTiming
            : toThird?.orb !== undefined && toThird.orb < direct.orb;
        if (toThird?.applying === true && perfectsFirst) {
          return {
            kind: 'prohibition',
            thirdBody: third,
            thirdBodyKey: bodyById(third)?.key ?? String(third),
            ...(interferenceTiming === undefined ? {} : { timeToPerfectDays: interferenceTiming }),
          };
        }
      }
    }
    const significatorIds = [querent, quesited];
    for (const body of significatorIds) {
      const stationDays = motionForecast?.stationDays?.get(body);
      if (stationDays !== undefined && (directTiming === undefined || stationDays < directTiming)) {
        return {
          kind: 'refranation',
          aspect: direct,
          ...(directTiming === undefined ? {} : { timeToPerfectDays: directTiming }),
          impedimentBody: body,
        };
      }
      const signChangeDays = motionForecast?.signChangeDays?.get(body);
      if (signChangeDays !== undefined && (directTiming === undefined || signChangeDays < directTiming)) {
        return {
          kind: 'frustration',
          aspect: direct,
          ...(directTiming === undefined ? {} : { timeToPerfectDays: directTiming }),
          impedimentBody: body,
        };
      }
    }
    return {
      kind: 'directAspect',
      aspect: direct,
      ...(directTiming === undefined ? {} : { timeToPerfectDays: directTiming }),
    };
  }

  // Translation: a third body separating from one significator, applying to the other.
  for (const third of others) {
    const toQuerent = aspectBetween(aspects, third, querent);
    const toQuesited = aspectBetween(aspects, third, quesited);
    const carriesFromQuerent = toQuerent !== undefined && !toQuerent.applying && toQuesited?.applying === true;
    const carriesFromQuesited = toQuesited !== undefined && !toQuesited.applying && toQuerent?.applying === true;
    if (carriesFromQuerent || carriesFromQuesited) {
      return { kind: 'translation', thirdBody: third, thirdBodyKey: bodyById(third)?.key ?? String(third) };
    }
  }

  // Collection: a third body applying from both significators at once.
  for (const third of others) {
    const toQuerent = aspectBetween(aspects, third, querent);
    const toQuesited = aspectBetween(aspects, third, quesited);
    if (toQuerent?.applying === true && toQuesited?.applying === true) {
      return { kind: 'collection', thirdBody: third, thirdBodyKey: bodyById(third)?.key ?? String(third) };
    }
  }

  return { kind: 'none' };
}

export interface HoraryJudgmentOptions {
  readonly rulershipScheme?: RulershipScheme;
  readonly motionForecast?: HoraryMotionForecast;
}

/**
 * Whether the Moon is void of course — `void-of-course.ts`'s own concern, which needs an
 * ephemeris provider to search forward for the Moon's next aspect and so cannot be computed from
 * an already-built `ChartData` alone. `judgeHorary` therefore takes it as a required input
 * rather than silently defaulting it (to `false`, say) and reporting a consideration that was
 * never actually checked.
 */
export interface HoraryMoonInput {
  readonly isVoidOfCourse: boolean;
}

export interface HoraryJudgment {
  readonly querent: Significator;
  readonly quesited: Significator;
  readonly perfection: PerfectionResult;
  readonly reception: MutualReceptionResult;
  /** Reception can strengthen an otherwise-applying perfection; it never becomes a verdict by itself. */
  readonly receptionAidsPerfection: boolean;
  readonly considerations: readonly HoraryConsideration[];
  readonly radical: boolean;
}

/** Whether reception accompanies a method of perfection rather than merely describing the two significators' condition. */
export function receptionAidsPerfection(perfection: PerfectionResult, reception: MutualReceptionResult): boolean {
  return (
    reception.kind !== 'none' &&
    (perfection.kind === 'directAspect' || perfection.kind === 'translation' || perfection.kind === 'collection')
  );
}

/**
 * The full judgment for one horary question: the querent's own significator (always house 1)
 * and the quesited's (`quesitedHouse`, the caller's own assignment of which house the matter
 * asked about belongs to — no chart alone can know that), whether and how it perfects, whether
 * the two significators receive each other, and whether the chart is radical at all
 * (`horary.ts`'s existing considerations).
 */
export function judgeHorary(
  data: ChartData,
  quesitedHouse: number,
  moon: HoraryMoonInput,
  options: HoraryJudgmentOptions = {},
): HoraryJudgment {
  const scheme = options.rulershipScheme ?? 'traditional';
  const querent = significatorOf(1, data.houses.cusps, scheme);
  const quesited = significatorOf(quesitedHouse, data.houses.cusps, scheme);
  const perfection = judgePerfection(
    data.aspects,
    querent.ruler,
    quesited.ruler,
    data.positions,
    options.motionForecast,
  );

  const querentPosition = data.positions.find((p) => p.body === querent.ruler);
  const quesitedPosition = data.positions.find((p) => p.body === quesited.ruler);
  const reception =
    querentPosition === undefined || quesitedPosition === undefined
      ? { kind: 'none' as const, aFromB: [], bFromA: [], sameDignityType: false }
      : mutualReceptionBetween(
          querent.ruler,
          querentPosition.longitude,
          quesited.ruler,
          quesitedPosition.longitude,
          data.sect,
          scheme,
        );

  const moonPosition = data.positions.find((p) => p.body === idOf('moon'));
  const saturnPosition = data.positions.find((p) => p.body === idOf('saturn'));
  const considerations = horaryConsiderations({
    ascendant: data.houses.ascendant,
    moonLongitude: moonPosition?.longitude ?? 0,
    saturnHouse: saturnPosition === undefined ? undefined : houseOf(saturnPosition.longitude, data.houses.cusps),
    moonIsVoid: moon.isVoidOfCourse,
  } satisfies HoraryInput);

  return {
    querent,
    quesited,
    perfection,
    reception,
    receptionAidsPerfection: receptionAidsPerfection(perfection, reception),
    considerations,
    radical: isRadical(considerations),
  };
}

function signChangeDays(position: BodyPosition): number | undefined {
  if (position.longitudeSpeed === 0) return undefined;
  const sign = signIndex(position.longitude);
  const boundary = position.longitudeSpeed > 0 ? (sign + 1) * 30 : sign * 30;
  const distance =
    position.longitudeSpeed > 0
      ? (boundary - position.longitude + 360) % 360
      : (position.longitude - boundary + 360) % 360;
  return distance === 0 ? 0 : distance / Math.abs(position.longitudeSpeed);
}

/** Runs a short real-ephemeris station search, then judges with frustration/refranation enabled. */
export async function judgeHoraryWithMotion(
  data: ChartData,
  questionJd: JulianDayUT,
  provider: EphemerisProvider,
  quesitedHouse: number,
  moon: HoraryMoonInput,
  options: HoraryJudgmentOptions = {},
): Promise<HoraryJudgment> {
  const initial = judgeHorary(data, quesitedHouse, moon, options);
  const directTiming = initial.perfection.timeToPerfectDays ?? 30;
  const bodies = [initial.querent.ruler, initial.quesited.ruler];
  const stations = await findStations(provider, bodies, questionJd, questionJd + Math.max(30, directTiming * 2));
  const stationDays = new Map<BodyId, number>();
  for (const station of stations) {
    if (!stationDays.has(station.body)) stationDays.set(station.body, station.jd - questionJd);
  }
  const signChanges = new Map<BodyId, number>();
  for (const body of bodies) {
    const position = data.positions.find((candidate) => candidate.body === body);
    const days = position === undefined ? undefined : signChangeDays(position);
    if (days !== undefined) signChanges.set(body, days);
  }
  return judgeHorary(data, quesitedHouse, moon, {
    ...options,
    motionForecast: { stationDays, signChangeDays: signChanges },
  });
}
