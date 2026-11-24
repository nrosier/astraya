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
 * Frustration follows Lilly (Christian Astrology, 1647, Book I, p. 72): a swift planet would join a more ponderous one, but a third planet
 * reaches the ponderous one first, so the swift planet is frustrated of its perfection. A sign change of a significator before perfection is
 * reported separately as `'signChange'`, not as frustration (#798).
 */
/**
 * @module domain/horary-judgment
 * @purpose Horary significator selection, perfection and impediment detection, reception, and relative-motion timing.
 * @conventions Scoped to the seven classical planets; forward station forecasts are supplied by the caller because ChartData has no future ephemeris context.
 * @exports HORARY_PLANET_IDS, Significator, significatorOf, PerfectionKind, PerfectionResult, HoraryMotionForecast, judgePerfection, HoraryJudgmentOptions, HoraryMoonInput, HoraryJudgment, receptionAidsPerfection, judgeHorary, HORARY_PRACTITIONER_KEYS, HoraryPractitionerKey, HoraryPractitionerInput, HORARY_PRACTITIONER_REASON_MAX_CHARACTERS, HORARY_PRACTITIONER_REASONS, practitionerInputFor
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

/**
 * The Ptolemaic aspect (conjunction, sextile, square, trine, opposition) between two bodies, if any. Only the major
 * family perfects in horary (#1960): a minor or higher-harmonic aspect is never returned, however exact. Each
 * aspect in `aspects` was admitted within its own `allowedOrb`, which for a horary chart is Lilly's moiety sum.
 */
function aspectBetween(aspects: readonly Aspect[], a: BodyId, b: BodyId): Aspect | undefined {
  return aspects.find(
    (aspect) =>
      aspect.aspect.family === 'major' &&
      ((aspect.bodyA === a && aspect.bodyB === b) || (aspect.bodyA === b && aspect.bodyB === a)),
  );
}

/**
 * Whether a third body's longitude lies on the shorter arc between the two significators (Lilly, p. 71:
 * a planet that interposes its body or aspect). Undefined when positions are not supplied, because the
 * answer cannot be read from the aspects alone (#798).
 */
function interposes(
  third: BodyId,
  querent: BodyId,
  quesited: BodyId,
  positions: readonly BodyPosition[] | undefined,
): boolean | undefined {
  if (positions === undefined) return undefined;
  const at = (body: BodyId): number | undefined => positions.find((position) => position.body === body)?.longitude;
  const t = at(third);
  const a = at(querent);
  const b = at(quesited);
  if (t === undefined || a === undefined || b === undefined) return undefined;
  const norm = (x: number): number => ((x % 360) + 360) % 360;
  const fromA = norm(t - a);
  const span = norm(b - a);
  // The shorter arc from querent to quesited; the third body is between them if it lies on that arc.
  if (span <= 180) return fromA > 0 && fromA < span;
  return fromA > span && fromA < 360;
}

export type PerfectionKind =
  'directAspect' | 'translation' | 'collection' | 'prohibition' | 'frustration' | 'signChange' | 'refranation' | 'none';

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
  /**
   * Other rules that also held, in the code's fixed order, never the chosen kind (#1960). Absent when none. It only
   * feeds the practitioner note: the kind above is unchanged by it.
   */
  readonly alsoApplies?: readonly PerfectionKind[];
}

/** The first third body applying from both significators at once, if any (collection of light). */
function collectorOf(
  aspects: readonly Aspect[],
  others: readonly BodyId[],
  querent: BodyId,
  quesited: BodyId,
): BodyId | undefined {
  return others.find(
    (third) =>
      aspectBetween(aspects, third, querent)?.applying === true &&
      aspectBetween(aspects, third, quesited)?.applying === true,
  );
}

function collectionHolds(
  aspects: readonly Aspect[],
  others: readonly BodyId[],
  querent: BodyId,
  quesited: BodyId,
): boolean {
  return collectorOf(aspects, others, querent, quesited) !== undefined;
}

/** The result with the other rules that also held, in order and without the chosen kind. Absent when there are none. */
function withAlsoApplies(result: PerfectionResult, kinds: readonly PerfectionKind[]): PerfectionResult {
  const also = kinds.filter((kind, index) => kind !== result.kind && kinds.indexOf(kind) === index);
  return also.length === 0 ? result : { ...result, alsoApplies: also };
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
    // Every impediment that holds for the direct aspect is collected in the fixed order below; the first is the
    // reported kind and the rest are `alsoApplies` (#1960, practitioner note). The order is the code's own choice.
    const held: PerfectionResult[] = [];
    // Prohibition (simplification — see the module's own header): a third body's applying
    // aspect to either significator with a tighter orb reaches its own perfection first.
    prohibition: for (const third of others) {
      for (const target of [querent, quesited]) {
        const toThird = aspectBetween(aspects, third, target);
        const interferenceTiming = toThird === undefined ? undefined : timeToPerfect(toThird, positions);
        const perfectsFirst =
          interferenceTiming !== undefined && directTiming !== undefined
            ? interferenceTiming < directTiming
            : toThird?.orb !== undefined && toThird.orb < direct.orb;
        if (toThird?.applying === true && perfectsFirst) {
          // Lilly, p. 71: prohibition is a planet that interposes between the significators. A planet
          // that reaches only one significator, without interposing, frustrates it (p. 72, handled below).
          // Without positions the interposition cannot be read, so it is reported as prohibition as before.
          if (interposes(third, querent, quesited, positions) === false) continue;
          held.push({
            kind: 'prohibition',
            thirdBody: third,
            thirdBodyKey: bodyById(third)?.key ?? String(third),
            ...(interferenceTiming === undefined ? {} : { timeToPerfectDays: interferenceTiming }),
          });
          break prohibition;
        }
      }
    }
    // Frustration (Lilly, p. 72): a third body reaches one significator before the direct aspect
    // perfects, so the matter is frustrated of its perfection. Only a third body that is not a
    // significator itself counts. This is the rule the prohibition check above was approximating.
    frustration: for (const third of others) {
      for (const target of [querent, quesited]) {
        const toTarget = aspectBetween(aspects, third, target);
        if (toTarget?.applying !== true) continue;
        const reachTiming = timeToPerfect(toTarget, positions);
        const reachesFirst =
          reachTiming !== undefined && directTiming !== undefined
            ? reachTiming < directTiming
            : toTarget.orb < direct.orb;
        if (reachesFirst) {
          held.push({
            kind: 'frustration',
            aspect: direct,
            thirdBody: third,
            thirdBodyKey: bodyById(third)?.key ?? String(third),
            impedimentBody: target,
            ...(reachTiming === undefined ? {} : { timeToPerfectDays: reachTiming }),
          });
          break frustration;
        }
      }
    }
    const significatorIds = [querent, quesited];
    for (const body of significatorIds) {
      const stationDays = motionForecast?.stationDays?.get(body);
      if (stationDays !== undefined && (directTiming === undefined || stationDays < directTiming)) {
        held.push({
          kind: 'refranation',
          aspect: direct,
          ...(directTiming === undefined ? {} : { timeToPerfectDays: directTiming }),
          impedimentBody: body,
        });
      }
      const signChangeDays = motionForecast?.signChangeDays?.get(body);
      if (signChangeDays !== undefined && (directTiming === undefined || signChangeDays < directTiming)) {
        held.push({
          kind: 'signChange',
          aspect: direct,
          ...(directTiming === undefined ? {} : { timeToPerfectDays: directTiming }),
          impedimentBody: body,
        });
      }
    }
    const [chosen, ...rest] = held;
    if (chosen === undefined) {
      return {
        kind: 'directAspect',
        aspect: direct,
        ...(directTiming === undefined ? {} : { timeToPerfectDays: directTiming }),
      };
    }
    return withAlsoApplies(
      chosen,
      rest.map((result) => result.kind),
    );
  }

  // Translation: a third body separating from one significator, applying to the other.
  for (const third of others) {
    const toQuerent = aspectBetween(aspects, third, querent);
    const toQuesited = aspectBetween(aspects, third, quesited);
    const carriesFromQuerent = toQuerent !== undefined && !toQuerent.applying && toQuesited?.applying === true;
    const carriesFromQuesited = toQuesited !== undefined && !toQuesited.applying && toQuerent?.applying === true;
    if (carriesFromQuerent || carriesFromQuesited) {
      return withAlsoApplies(
        { kind: 'translation', thirdBody: third, thirdBodyKey: bodyById(third)?.key ?? String(third) },
        collectionHolds(aspects, others, querent, quesited) ? ['collection'] : [],
      );
    }
  }

  // Collection: a third body applying from both significators at once.
  const collector = collectorOf(aspects, others, querent, quesited);
  if (collector !== undefined) {
    return { kind: 'collection', thirdBody: collector, thirdBodyKey: bodyById(collector)?.key ?? String(collector) };
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

/**
 * The points where horary practice differs and this code made a choice (#1960, owner decisions, Part 3). A closed list:
 * a key cannot be added inside record version 2 without older builds reading the record as unknown.
 */
export const HORARY_PRACTITIONER_KEYS = [
  'non-radical-chart',
  'late-ascendant-limit',
  'house-by-exact-cusp',
  'perfection-orbs',
  'rule-order',
  'sign-change',
] as const;
export type HoraryPractitionerKey = (typeof HORARY_PRACTITIONER_KEYS)[number];

/** One practitioner note on a judgment: the key and its reason, the canonical English text frozen at save time. */
export interface HoraryPractitionerInput {
  readonly key: HoraryPractitionerKey;
  readonly reason: string;
}

/** The longest a stored reason may be, in code points. */
export const HORARY_PRACTITIONER_REASON_MAX_CHARACTERS = 120;

/**
 * The canonical English reason per key, stored on the record and frozen at save time, so the store can check a stored
 * reason against its key. The en and nl display text lives in `ui/HoraryView.messages`, and a test keeps its en equal
 * to this table.
 */
export const HORARY_PRACTITIONER_REASONS: Readonly<Record<HoraryPractitionerKey, string>> = {
  'non-radical-chart': 'The chart is not radical. It is judged anyway; some practitioners would not judge it.',
  'late-ascendant-limit':
    "Lilly's late Ascendant (27, 28 or 29 degrees) is read here as from 27°00′; readings of the limit differ.",
  'house-by-exact-cusp':
    'A planet is in the house its degree falls in, by exact cusp, with no 5-degree rule; practitioners differ.',
  'perfection-orbs':
    "Perfection counts only the five Ptolemaic aspects within Lilly's moieties; orb tables differ by author.",
  'rule-order':
    'More than one rule applies. The code reports the first in its own fixed order, not an order from the texts.',
  'sign-change':
    'A significator changes sign before the aspect perfects; practitioners differ on whether it still counts.',
};

/**
 * The practitioner notes for one judgment, in the closed list's order. Pure, and it changes no verdict: a sign change
 * stays an impediment, and the note never says it counts as perfection.
 *
 * `saturnHouse` is Saturn's house by exact cusp (`judgeHorary` reads it for the considerations but does not keep it);
 * it is `undefined` when the houses could not be cast. A rule-order note needs two rules that held for one aspect
 * (`alsoApplies`), so it never appears for a judgment that perfects one way only.
 */
export function practitionerInputFor(
  judgment: HoraryJudgment,
  saturnHouse: number | undefined,
): readonly HoraryPractitionerInput[] {
  const { perfection } = judgment;
  const kind = perfection.kind;
  const held = new Set<PerfectionKind>([kind, ...(perfection.alsoApplies ?? [])]);
  const directRules: readonly PerfectionKind[] = ['prohibition', 'frustration', 'refranation', 'signChange'];
  const directHeld = directRules.filter((rule) => held.has(rule)).length;
  const lateAscendant = judgment.considerations.some((c) => c.key === 'ascendant-too-late' && c.applies);
  const applies: Readonly<Record<HoraryPractitionerKey, boolean>> = {
    'non-radical-chart': !judgment.radical,
    'late-ascendant-limit': lateAscendant,
    'house-by-exact-cusp': saturnHouse === 6 || saturnHouse === 7,
    'perfection-orbs': kind !== 'none',
    'rule-order': directHeld >= 2 || (held.has('translation') && held.has('collection')),
    'sign-change': kind === 'signChange',
  };
  return HORARY_PRACTITIONER_KEYS.filter((key) => applies[key]).map((key) => ({
    key,
    reason: HORARY_PRACTITIONER_REASONS[key],
  }));
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
