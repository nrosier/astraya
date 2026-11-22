/**
 * The hyleg (Arabic hilaj, "giver of life") and the alcocoden (al-kadukhadah, "giver of years"), identified by the
 * procedure Bonatti gives in Liber astronomiae, Tr. 9, part 2, chs. 1-2 (translated by B. N. Dykes, Cazimi Press, 2010;
 * held text `bonatti-liber-astronomiae-tr-9-2010`, which has no page map, so no printed page is cited). Bonatti follows
 * 'Umar al-Tabari (TBN) and Abu 'Ali (JN). Identification only: no length of life and no death timing (owner decision,
 * #1799, 2026-11-19).
 *
 * The search, in order (the owner's answers of 2026-11-22 on #1799 fix the four doctrinal points):
 *
 * 1. Day chart: the Sun, then the Moon. Ch. 1, "you would seek it from the Sun in diurnal nativities". The Sun is fit in
 *    the 1st, 11th or 10th "(whether it is in a masculine or feminine sign)" and in the 7th, 8th or 9th only "in a
 *    masculine sign". The Moon, "if the Sun were not fit", must be "in an angle or in a succeedent, and in a feminine
 *    sign". Owner point 1: the Moon needs a feminine sign (ch. 1). Ch. 2 says "nor will you care about the sex of the
 *    signs" for her, and says she may be in women's nativities "more useful in a feminine sign"; that reading is
 *    recorded here and not applied.
 * 2. Night chart: the Moon, then the Sun. Ch. 1 spells out only "in diurnal nativities"; the night order is Astraya's
 *    reading of the text (owner point 2), the mirror of the day order. Each luminary keeps its own test.
 * 3. A preventional nativity (the syzygy was a Full Moon) seeks the Part of Fortune, then the Ascendant; a conjunctional
 *    one the Ascendant, then the Part of Fortune (ch. 1, "if the nativity were preventional ... Part of Fortune ... if
 *    however it were conjunctional, seek it from the ascending degree"; ch. 2, "you will put the degree of the
 *    Ascendant last" for a prevention). The Part of Fortune must be in an angle or a succeedent, whatever the sex of its
 *    sign (ch. 2). The Ascendant needs no house.
 * 4. The degree of the syzygy itself (ch. 1, "seek it then from the degree of the conjunction ... or from the degree of
 *    the prevention"). 'Umar wants the Moon's degree at a prevention; the degree used here is `PrenatalSyzygy.degree`,
 *    the owner's #1798 decision (the luminary above the earth). Ch. 2: look at the conjunction or the prevention "to
 *    see [if] it were in an angle or a succeedent to an angle ... (nor will you care whether the sign is masculine or
 *    feminine)", so the degree must be in an angle or a succeedent in whole-sign houses, in any sign; the same test as
 *    for the Part of Fortune.
 * 5. Otherwise "the hilaj will be made useless": no hyleg.
 *
 * Fitness of a candidate: "could not be a hilaj unless the Lords of the domiciles (or exaltations or triplicities or
 * bounds ...) were to aspect them". 'Umar does not use the Lord of the face (translator's note 92), so the four lords
 * used are the domicile, exaltation, bound and the sect's triplicity lord (the same triplicity lord the almuten uses).
 * Owner point 3: an aspect is a whole-sign Ptolemaic one (the same sign, sextile, square, trine or opposition), with no
 * orb. Owner point 4: houses are whole-sign houses counted from the Ascendant's sign, as the translator reads Bonatti
 * (notes 87 and 107), whatever the chart's own house setting.
 *
 * The alcocoden (ch. 1; ch. 2 "On the knowledge of the al-kadukhadah"): among the four lords of the hyleg's degree that
 * aspect it, the order is dignities first (owner decision, #1799, 2026-11-23). Ch. 1: a lord with more dignities in the
 * degree "will be called stronger than the rest, and he will have to be preferred to all, provided that he aspects the
 * aforesaid degree, even if the distance between the degree of the hilaj and the other one ... were the lesser one".
 * Only then, among lords with equal dignities, the one "closer to the degree by aspect or by conjunction", measured in
 * degrees from the exact aspect (owner point 3), no orb. Then, in order, ch. 2's tie-breaks: in an angle or a
 * succeedent; closer to the cusp; in his own dignity rather than peregrine; oriental; closer to the Sun and not
 * combust. The Lord of the face is the last resort in ch. 2, but every hyleg here already has an aspecting lord among
 * the four, so the face lord never decides and is not used.
 *
 * A luminary is never the lord of its own degree: the Sun as hyleg does not count as its own aspecting lord, nor the
 * Moon (owner decision, #1799, 2026-11-23).
 *
 * Divergences kept as comments, not options (ch. 2): Ptolemy does not seek the hyleg in the 8th, and does not mention
 * the sex of the signs; Dorotheus allows the Sun in the 7th and 8th only in masculine signs, and Bonatti advises "observe
 * the opinion of Dorotheus if you can, for it is safer". This module follows Dorotheus's masculine-sign rule, as the
 * brief and the issue state.
 *
 * Night Sun: in a night chart the Sun is tested with the same masculine-sign rule as by day. Dorotheus gives the night
 * Sun "in places opposite these masculine signs" (ch. 2, with the translator's note that 'Umar is confusing on this
 * point); that divergence is recorded here and not applied.
 *
 * Still open, for the owner: (c) the whole-sign cusp of a house is taken as its first degree, used only for the
 * "closer to the cusp" tie-break; (d) the "impeded" Ascendant of ch. 2 ("nor were the Ascendant impeded") is not
 * applied.
 *
 * @module domain/hyleg
 * @purpose Identifies the hyleg and the alcocoden of a nativity, each with the rule that chose it, per Bonatti Tr. 9 part 2 chs. 1-2 (#1799).
 * @conventions Pure and total. Whole-sign houses and whole-sign Ptolemaic aspects with no orb (owner answers, #1799). Lords are traditional (domicile, exaltation, sect triplicity, bound under the chart's `boundsScheme`). A lord whose position is missing is skipped. With no `syzygy` the Fortune, Ascendant and syzygy steps are skipped, since the branch depends on its kind. `pickAlcocoden` is exported as an internal so the tie-breaks can be tested on hand-made rows.
 * @exports HylegPoint, HylegRule, AlcocodenRule, HylegInput, HylegResult, AlcocodenCandidate, findHyleg, pickAlcocoden
 */
import { exaltationRulerOf, rulerOf } from '../astrology/dignities.js';
import { essentialDignityScoreOf } from '../astrology/almuten.js';
import { angularSeparation } from '../astrology/aspects.js';
import { bodyByKey } from '../astrology/bodies.js';
import { boundRulerOf, type BoundsScheme } from '../astrology/bounds.js';
import { solarConditionOf, solarPhaseOf, type Sect } from '../astrology/sect.js';
import { degreesInSign, signIndex, signOf } from '../astrology/signs.js';
import { triplicityRulersAt } from '../astrology/triplicity.js';
import type { BodyId, BodyPosition, Degrees } from '../ephemeris/types.js';
import type { PrenatalSyzygy } from './prenatal-syzygy.js';

/** Which point is the hyleg. */
export type HylegPoint = 'sun' | 'moon' | 'fortune' | 'ascendant' | 'syzygy';

/** The step of the search that chose the hyleg, so the screen can explain it. */
export type HylegRule =
  | 'sun-houses-1-10-11'
  | 'sun-houses-7-8-9-masculine'
  | 'moon-angular-succeedent-feminine'
  | 'fortune-angular-succeedent'
  | 'ascendant'
  | 'syzygy-degree';

/** The step that chose the alcocoden among the lords aspecting the hyleg's degree. */
export type AlcocodenRule =
  | 'only-aspecting'
  | 'more-dignities'
  | 'closest-aspect'
  | 'angular-or-succeedent'
  | 'closer-to-cusp'
  | 'own-dignity'
  | 'oriental'
  | 'closer-to-sun'
  | 'lord-order';

export interface HylegInput {
  readonly sect: Sect;
  /** Positions of at least the Sun, the Moon and the lords' planets (the seven traditional planets). */
  readonly positions: readonly Pick<BodyPosition, 'body' | 'longitude'>[];
  readonly ascendant: Degrees;
  readonly partOfFortune: Degrees;
  /** The prenatal syzygy (#1798); undefined when it could not be found, which skips the steps that depend on its kind. */
  readonly syzygy: PrenatalSyzygy | undefined;
  readonly boundsScheme?: BoundsScheme;
}

export interface HylegResult {
  readonly hyleg: { readonly point: HylegPoint; readonly longitude: Degrees; readonly rule: HylegRule } | undefined;
  readonly alcocoden: { readonly planet: BodyId; readonly rule: AlcocodenRule } | undefined;
}

/** One lord that aspects the hyleg's degree, with what the tie-breaks compare. Lower is better unless noted. */
export interface AlcocodenCandidate {
  readonly body: BodyId;
  /** Degrees from the nearest exact Ptolemaic aspect (0 for a conjunction in the same degree). */
  readonly deviation: number;
  /** Of the four lords' dignities, how many this planet holds in the hyleg's degree (higher is better). */
  readonly dignities: number;
  readonly angularOrSucceedent: boolean;
  /** Degrees from the first degree of its sign, the whole-sign cusp. */
  readonly cuspDistance: number;
  /** Of the five dignities, how many it holds where it stands (0 is peregrine; higher is better). */
  readonly ownDignities: number;
  readonly oriental: boolean;
  readonly combust: boolean;
  readonly sunSeparation: number;
  /** Position in ch. 2's order of lords: bound, domicile, exaltation, triplicity. */
  readonly order: number;
}

/** Two closenesses within this many degrees are equal: a floating-point guard, not an astrological orb. */
const EQUAL_WITHIN = 1e-6;

const ASPECT_ANGLES: readonly number[] = [0, 60, 90, 120, 180];

/** Sign distances, counted forward, at which two signs aspect: same, sextile, square, trine, opposition. */
const ASPECTING_SIGN_DISTANCES: readonly number[] = [0, 2, 3, 4, 6, 8, 9, 10];

const ANGLES: readonly number[] = [1, 4, 7, 10];
const SUCCEEDENTS: readonly number[] = [2, 5, 8, 11];

type LordRole = 'bound' | 'domicile' | 'exaltation' | 'triplicity';

/** Ch. 2's order of the lords. */
const LORD_ORDER: readonly LordRole[] = ['bound', 'domicile', 'exaltation', 'triplicity'];

function idOf(key: string): BodyId {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`unreachable: "${key}" is always in BODIES`);
  return body.id;
}

const SUN = idOf('sun');
const MOON = idOf('moon');

/** The whole-sign house (1-12) of a longitude, counted from the Ascendant's sign. */
function wholeSignHouse(longitude: Degrees, ascendant: Degrees): number {
  return ((signIndex(longitude) - signIndex(ascendant) + 12) % 12) + 1;
}

function isMasculine(longitude: Degrees): boolean {
  const element = signOf(longitude).element;
  return element === 'fire' || element === 'air';
}

function isAngularOrSucceedent(house: number): boolean {
  return ANGLES.includes(house) || SUCCEEDENTS.includes(house);
}

/** True when two longitudes' signs are in the same sign or a whole-sign sextile, square, trine or opposition. */
function signsAspect(a: Degrees, b: Degrees): boolean {
  return ASPECTING_SIGN_DISTANCES.includes((signIndex(a) - signIndex(b) + 12) % 12);
}

/** Degrees between two longitudes' separation and the nearest exact Ptolemaic aspect. */
function deviationFromExactAspect(a: Degrees, b: Degrees): number {
  const separation = angularSeparation(a, b);
  return Math.min(...ASPECT_ANGLES.map((angle) => Math.abs(separation - angle)));
}

interface Lord {
  readonly body: BodyId;
  readonly roles: readonly LordRole[];
}

/** The lords of a degree: domicile, exaltation, bound and the sect's triplicity lord, one entry per planet. */
function lordsOf(longitude: Degrees, sect: Sect, boundsScheme: BoundsScheme): readonly Lord[] {
  const sign = signIndex(longitude);
  const exaltation = exaltationRulerOf(sign);
  const roles: readonly (readonly [LordRole, BodyId | undefined])[] = [
    ['bound', boundRulerOf(longitude, boundsScheme)],
    ['domicile', rulerOf(sign, 'traditional')],
    ['exaltation', exaltation],
    ['triplicity', triplicityRulersAt(longitude)[sect]],
  ];
  const byBody = new Map<BodyId, LordRole[]>();
  for (const [role, body] of roles) {
    if (body === undefined) continue;
    byBody.set(body, [...(byBody.get(body) ?? []), role]);
  }
  return [...byBody].map(([body, held]) => ({ body, roles: held }));
}

interface Located {
  readonly lord: Lord;
  readonly longitude: Degrees;
}

/** The lords of `longitude` that aspect it. `self` (the candidate's own body, if any) does not count as aspecting itself. */
function aspectingLords(
  longitude: Degrees,
  self: BodyId | undefined,
  input: HylegInput,
  boundsScheme: BoundsScheme,
): readonly Located[] {
  const located: Located[] = [];
  for (const lord of lordsOf(longitude, input.sect, boundsScheme)) {
    if (lord.body === self) continue;
    const position = input.positions.find((p) => p.body === lord.body);
    if (position === undefined) continue;
    if (signsAspect(position.longitude, longitude)) located.push({ lord, longitude: position.longitude });
  }
  return located;
}

interface Found {
  readonly point: HylegPoint;
  readonly longitude: Degrees;
  readonly rule: HylegRule;
  readonly self: BodyId | undefined;
}

/** Picks the alcocoden among candidate rows; the stage that leaves one row names the rule. Exported to test the tie-breaks. @internal */
export function pickAlcocoden(
  candidates: readonly AlcocodenCandidate[],
): { readonly planet: BodyId; readonly rule: AlcocodenRule } | undefined {
  const first = candidates[0];
  if (first === undefined) return undefined;
  if (candidates.length === 1) return { planet: first.body, rule: 'only-aspecting' };
  // Each stage scores a candidate; the lowest scores stay. A stage that scores everyone alike changes nothing.
  const stages: readonly (readonly [AlcocodenRule, (c: AlcocodenCandidate) => number])[] = [
    ['more-dignities', (c) => -c.dignities],
    ['closest-aspect', (c) => c.deviation],
    ['angular-or-succeedent', (c) => (c.angularOrSucceedent ? 0 : 1)],
    ['closer-to-cusp', (c) => c.cuspDistance],
    ['own-dignity', (c) => -c.ownDignities],
    ['oriental', (c) => (c.oriental ? 0 : 1)],
    ['closer-to-sun', (c) => (c.combust ? 1000 : 0) + c.sunSeparation],
    ['lord-order', (c) => c.order],
  ];
  let remaining = candidates;
  for (const [rule, score] of stages) {
    const best = Math.min(...remaining.map(score));
    remaining = remaining.filter((c) => score(c) - best <= EQUAL_WITHIN);
    const only = remaining[0];
    if (remaining.length === 1 && only !== undefined) return { planet: only.body, rule };
  }
  const fallback = remaining[0];
  return fallback === undefined ? undefined : { planet: fallback.body, rule: 'lord-order' };
}

function alcocodenOf(found: Found, input: HylegInput, boundsScheme: BoundsScheme): HylegResult['alcocoden'] {
  const sun = input.positions.find((p) => p.body === SUN)?.longitude;
  const rows = aspectingLords(found.longitude, found.self, input, boundsScheme).map(
    ({ lord, longitude }): AlcocodenCandidate => {
      const own = essentialDignityScoreOf(lord.body, longitude, input.sect, {
        rulershipScheme: 'traditional',
        boundsScheme,
      });
      return {
        body: lord.body,
        deviation: deviationFromExactAspect(longitude, found.longitude),
        dignities: lord.roles.length,
        angularOrSucceedent: isAngularOrSucceedent(wholeSignHouse(longitude, input.ascendant)),
        cuspDistance: degreesInSign(longitude),
        ownDignities: [own.ruler, own.exalted, own.triplicity, own.bound, own.face].filter(Boolean).length,
        oriental: sun !== undefined && lord.body !== SUN && solarPhaseOf(longitude, sun) === 'oriental',
        combust: sun !== undefined && lord.body !== SUN && solarConditionOf(longitude, sun) === 'combust',
        sunSeparation: sun === undefined ? 0 : angularSeparation(longitude, sun),
        order: Math.min(...lord.roles.map((role) => LORD_ORDER.indexOf(role))),
      };
    },
  );
  return pickAlcocoden(rows);
}

/** Finds the hyleg by the search order in the file doc, then the alcocoden among the lords aspecting its degree. */
export function findHyleg(input: HylegInput): HylegResult {
  const boundsScheme = input.boundsScheme ?? 'egyptian';
  const sun = input.positions.find((p) => p.body === SUN)?.longitude;
  const moon = input.positions.find((p) => p.body === MOON)?.longitude;

  const aspected = (found: Found): Found | undefined =>
    aspectingLords(found.longitude, found.self, input, boundsScheme).length > 0 ? found : undefined;

  const sunStep = (): Found | undefined => {
    if (sun === undefined) return undefined;
    const house = wholeSignHouse(sun, input.ascendant);
    const base = { point: 'sun', longitude: sun, self: SUN } as const;
    if ([1, 10, 11].includes(house)) return aspected({ ...base, rule: 'sun-houses-1-10-11' });
    if ([7, 8, 9].includes(house) && isMasculine(sun)) return aspected({ ...base, rule: 'sun-houses-7-8-9-masculine' });
    return undefined;
  };
  const moonStep = (): Found | undefined => {
    if (moon === undefined) return undefined;
    if (!isAngularOrSucceedent(wholeSignHouse(moon, input.ascendant)) || isMasculine(moon)) return undefined;
    return aspected({ point: 'moon', longitude: moon, rule: 'moon-angular-succeedent-feminine', self: MOON });
  };
  const fortuneStep = (): Found | undefined =>
    isAngularOrSucceedent(wholeSignHouse(input.partOfFortune, input.ascendant))
      ? aspected({
          point: 'fortune',
          longitude: input.partOfFortune,
          rule: 'fortune-angular-succeedent',
          self: undefined,
        })
      : undefined;
  const ascendantStep = (): Found | undefined =>
    aspected({ point: 'ascendant', longitude: input.ascendant, rule: 'ascendant', self: undefined });
  const syzygyStep = (): Found | undefined => {
    const degree = input.syzygy?.degree;
    return degree === undefined || !isAngularOrSucceedent(wholeSignHouse(degree, input.ascendant))
      ? undefined
      : aspected({ point: 'syzygy', longitude: degree, rule: 'syzygy-degree', self: undefined });
  };

  const luminaries = input.sect === 'day' ? [sunStep, moonStep] : [moonStep, sunStep];
  const syzygySteps =
    input.syzygy === undefined
      ? []
      : [
          ...(input.syzygy.kind === 'prevention' ? [fortuneStep, ascendantStep] : [ascendantStep, fortuneStep]),
          syzygyStep,
        ];

  for (const step of [...luminaries, ...syzygySteps]) {
    const found = step();
    if (found !== undefined) {
      return {
        hyleg: { point: found.point, longitude: found.longitude, rule: found.rule },
        alcocoden: alcocodenOf(found, input, boundsScheme),
      };
    }
  }
  return { hyleg: undefined, alcocoden: undefined };
}
