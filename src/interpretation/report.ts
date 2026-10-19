/**
 * Report section assembly (#61): turns one already-computed `ChartData` into
 * an ordered set of named sections, each a list of non-empty paragraphs —
 * the shape a report screen actually renders, instead of every caller having
 * to know which placements matter and how to look their text up itself.
 *
 * Built entirely on prior interpretation pieces: #60's rule engine picks
 * which placements the "Aspect patterns" section shows and in what order,
 * and #59's corpus lookup guarantees every paragraph that comes from a
 * placement is non-empty, corpus or no corpus. The handful of paragraphs
 * that aren't placement text (temperament, sect, dispositor chain, chart
 * shape) are plain locale-templated sentences over data this module already
 * has, so they can't be empty either.
 *
 * A pure, synchronous function of one `ChartData`: no ephemeris access, no
 * "now". That was a deliberate scope cut on this issue's last checklist item,
 * "current timing from progressions and the year's solar return" —
 * `SecondaryProgressionData`/a solar-return chart is not itself a
 * `ChartData` (no `dignities` or `sect`, and its cross-chart contacts aren't
 * the intra-chart `aspects` an `aspect-pair` placement models), and deciding
 * what a "current timing" placement even keys off was a real design question
 * of its own.
 *
 * **Resolved by #207, not carried forward**: rather than forcing a solar
 * return into this module's `ChartData`-shaped world, `domain/periodic-
 * transit.ts` is a separate pipeline that ties directly into
 * `computeSolarReturn` for its yearly tier, plus its own daily/weekly/monthly
 * tiers of exact transit-to-natal aspects (`astrology/transit-events.ts`) and
 * fast-planet stations (`astrology/stations.ts`). "Progressions" half of the
 * old note is computed (`domain/secondary-progression.ts`'s own doc comment
 * says so explicitly) but — per #398's audit — has no dedicated screen yet;
 * `SecondaryProgressionView.tsx` does not exist. This module (`report.ts`)
 * stays exactly the pure, `ChartData`-only function its own doc above
 * describes regardless of when/whether that view gets built.
 *
 * "Nodes and Chiron axis" covers the True Node and Chiron, each with their
 * own `BODIES` entry and computed position. The South Node does not: it has
 * no `BodyDefinition` of its own (it's always exactly 180° from the North
 * Node — `southNode()` in `bodies.ts`), so it has no `CorpusPlacement` body
 * key to resolve text for, and isn't given its own paragraph here. That's a
 * scoping note, not a bug: nothing currently feeding this module treats the
 * South Node as an independent placement.
 *
 * #62 extends every paragraph with its own provenance: the placement it
 * resolves (if any), whether its text came from the corpus or the mechanical
 * fallback (#59), and the salience factors that explain why it's here, when
 * the section that produced it ranks by salience rather than simply
 * enumerating. "Aspect patterns" is the only section that ranks — #60's rule
 * engine is what picks and orders its placements — so it's the only section
 * whose paragraphs carry a non-empty `factors` list from that engine. The
 * temperament, chart-ruler and sect paragraphs still carry `factors`, but a
 * locally-built list describing the tallies/steps behind that one sentence,
 * not a ranking rationale — there's nothing to rank when a section always
 * says the same handful of things. Houses, dignities and the nodes/Chiron
 * axis paragraphs carry no factors at all: they're enumerated in full, not
 * selected, so there is nothing a factor would explain.
 */
/**
 * @module interpretation/report
 * @purpose Composes one already-computed ChartData into an ordered set of named report sections, each a list of non-empty paragraphs, ready for a report screen to render.
 * @conventions A pure, synchronous function of one ChartData only — no ephemeris access, no "now"; current-timing (progressions/solar return) reporting lives in a separate domain/periodic-transit.ts pipeline instead of being forced into this module's ChartData-shaped world. "Aspect patterns" is the only section ranked by the salience rule engine; other sections enumerate in full. Every paragraph carries provenance (its placement, whether its text is corpus or mechanical-fallback, and its salience factors where ranking applies).
 * @exports ReportSectionId, ParagraphSource, ReportParagraph, ReportSection, Report, assembleReport, reportPlacementKeys
 */
import { bodyById, bodyByKey, type BodyDefinition } from '../astrology/bodies.js';
import { DEFAULT_RULERSHIP_CHOICE, primaryRulerOf, rulersOf, type RulershipChoice } from '../astrology/rulership.js';
import { dispositorChain, type DispositorChain } from '../astrology/dispositors.js';
import { houseOf } from '../astrology/emphasis.js';
import { jonesBodyPositions, jonesShapeOf, type JonesShape } from '../astrology/jones-shapes.js';
import type { Element, Modality } from '../astrology/signs.js';
import { degreeSymbolNumber, signIndex } from '../astrology/signs.js';
import type { ChartData } from '../domain/chart-compute.js';
import { chartOverview, ELEMENT_ORDER, MODALITY_ORDER, type Temperament } from '../domain/chart-overview.js';
import type { BodyId, Degrees } from '../ephemeris/types.js';
import { composeFallbackText, findCorpusEntry } from './compose.js';
import {
  derivePlacements,
  NO_EXCLUSIONS,
  rankPlacements,
  type InterpretationExclusions,
  type SalienceFactor,
} from './rules.js';
import { dignityState, placementKey, type CorpusEntry, type CorpusPlacement, type Locale } from './schema.js';

export type ReportSectionId =
  | 'composite-intro'
  | 'core-identity'
  | 'temperament'
  | 'chart-ruler'
  | 'houses'
  | 'aspect-patterns'
  | 'dignities-sect'
  | 'nodes-chiron';

/**
 * Where a paragraph's text came from. `'corpus'` carries the matching entry
 * itself, so a viewer (#62's provenance view) can show its `provenance`
 * (model, prompt version, generation date) without a second lookup.
 * `'fallback'` is #59's mechanical sentence — no corpus entry existed for
 * this placement yet. `'derived'` is neither: a sentence synthesized
 * directly from chart data (temperament, sect, dispositor chain, chart
 * shape), with no corpus placement of its own to look up.
 */
export type ParagraphSource =
  | { readonly kind: 'corpus'; readonly entry: CorpusEntry }
  | { readonly kind: 'fallback' }
  | { readonly kind: 'derived' };

export interface ReportParagraph {
  readonly text: string;
  /**
   * The ecliptic longitude the placement stands at, for a paragraph about a point on the chart (a planet or angle in
   * a sign, a cusp). It lets the reader see the degree beside the sign (#654); absent where there is no single point
   * (a house placement, an aspect, a derived paragraph).
   */
  readonly longitude?: Degrees;
  /** The placement this text resolves. Absent for a `'derived'` paragraph, which has no `CorpusPlacement` of its own. */
  readonly placement?: CorpusPlacement;
  readonly source: ParagraphSource;
  /** Why this paragraph is here, when that's a rank rather than a foregone conclusion. Empty for enumerated (not selected) paragraphs. */
  readonly factors: readonly SalienceFactor[];
}

export interface ReportSection {
  readonly id: ReportSectionId;
  readonly title: string;
  /** Ordered, each already guaranteed non-empty text. */
  readonly paragraphs: readonly ReportParagraph[];
}

export interface Report {
  readonly sections: readonly ReportSection[];
}

const SECTION_TITLES: Readonly<Record<ReportSectionId, Readonly<Record<Locale, string>>>> = {
  'composite-intro': { en: 'About this chart', nl: 'Over deze horoscoop' },
  'core-identity': { en: 'Core identity: Sun, Moon, Ascendant', nl: 'Kernidentiteit: Zon, Maan, Ascendant' },
  temperament: { en: 'Temperament and elemental balance', nl: 'Temperament en elementenbalans' },
  'chart-ruler': { en: 'Chart ruler and dispositor chain', nl: 'Horoscoopheerser en dispositorketen' },
  houses: { en: 'Houses and life areas', nl: 'Huizen en levensgebieden' },
  'aspect-patterns': { en: 'Aspect patterns', nl: 'Aspectpatronen' },
  'dignities-sect': { en: 'Dignities and sect', nl: 'Waardigheden en sect' },
  'nodes-chiron': { en: 'Nodes and Chiron axis', nl: 'Maansknopen en Chiron-as' },
};

/** How many of the chart's most salient aspects "Aspect patterns" shows, so a busy chart doesn't dump all of them. */
const ASPECT_PATTERNS_LIMIT = 8;

function positionsMap(chart: ChartData): ReadonlyMap<BodyId, Degrees> {
  return new Map(chart.positions.map((position) => [position.body, position.longitude]));
}

function bodyPosition(chart: ChartData, key: string): { readonly body: BodyDefinition; readonly longitude: Degrees } {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`unreachable: unknown body key "${key}"`);
  const position = chart.positions.find((candidate) => candidate.body === body.id);
  if (position === undefined) throw new Error(`unreachable: chart has no position for "${key}"`);
  return { body, longitude: position.longitude };
}

function section(id: ReportSectionId, locale: Locale, paragraphs: readonly ReportParagraph[]): ReportSection {
  return { id, title: SECTION_TITLES[id][locale], paragraphs };
}

/** A paragraph for a real placement: corpus text if the corpus has an entry for it, `composeFallbackText`'s sentence otherwise. */
function resolveParagraph(
  placement: CorpusPlacement,
  locale: Locale,
  corpus: readonly CorpusEntry[],
  factors: readonly SalienceFactor[] = [],
  longitude?: Degrees,
): ReportParagraph {
  const entry = findCorpusEntry(placement, locale, corpus);
  const text = entry !== undefined ? entry.text : composeFallbackText(placement, locale);
  const source: ParagraphSource = entry !== undefined ? { kind: 'corpus', entry } : { kind: 'fallback' };
  return { text, placement, source, factors, ...(longitude === undefined ? {} : { longitude }) };
}

/**
 * The one framing paragraph a composite chart's report gets that a natal chart's never does
 * (#450): every other section below reads a composite's placements through the exact same
 * corpus categories a natal chart uses (`planet-in-sign`, `aspect-pair`, etc. — composite has
 * no dedicated category of its own yet, see #451), so without this paragraph the report reads
 * as a natal account of a fictional third person instead of saying what it actually is.
 */
const COMPOSITE_INTRO_TEXT: Readonly<Record<Locale, string>> = {
  en: "This is a composite chart: a single synthetic chart derived from the midpoints of two people's own charts, describing their relationship or combination as its own entity. The placements below describe that combination, not either person individually.",
  nl: 'Dit is een composietkaart: één synthetische horoscoop afgeleid van de middelpunten van de horoscopen van twee personen, die hun relatie of combinatie als een eigen geheel beschrijft. De plaatsingen hieronder beschrijven die combinatie, niet een van beide personen afzonderlijk.',
};

function compositeIntroSection(locale: Locale): ReportSection {
  return section('composite-intro', locale, [derivedParagraph(COMPOSITE_INTRO_TEXT[locale])]);
}

/** A paragraph synthesized directly from chart data, with no corpus placement of its own. */
function derivedParagraph(text: string, factors: readonly SalienceFactor[] = []): ReportParagraph {
  return { text, source: { kind: 'derived' }, factors };
}

/** Which corpus category a planet-in-sign/-house paragraph resolves against (#451): a composite
 * chart's placements need the composite-aware category, never the plain natal one, since the
 * natal text speaks as "you" about an individual and a composite describes the pairing itself. */
function planetInSignParagraph(
  chart: ChartData,
  key: string,
  locale: Locale,
  corpus: readonly CorpusEntry[],
  chartKind: 'natal' | 'composite',
): ReportParagraph {
  const { longitude } = bodyPosition(chart, key);
  const category = chartKind === 'composite' ? 'composite-planet-in-sign' : 'planet-in-sign';
  return resolveParagraph({ category, body: key, sign: signIndex(longitude) }, locale, corpus, [], longitude);
}

function planetInHouseParagraph(
  chart: ChartData,
  key: string,
  locale: Locale,
  corpus: readonly CorpusEntry[],
  chartKind: 'natal' | 'composite',
): ReportParagraph {
  const { longitude } = bodyPosition(chart, key);
  const house = houseOf(longitude, chart.houses.cusps);
  const category = chartKind === 'composite' ? 'composite-planet-in-house' : 'planet-in-house';
  return resolveParagraph({ category, body: key, house }, locale, corpus);
}

/** A degree-symbol paragraph for a body's own longitude (#405/#484) — the traditional per-degree image/quality, independent of which body occupies it. */
function degreeSymbolParagraph(longitude: Degrees, locale: Locale, corpus: readonly CorpusEntry[]): ReportParagraph {
  return resolveParagraph({ category: 'degree-symbol', degree: degreeSymbolNumber(longitude) }, locale, corpus);
}

function coreIdentitySection(
  chart: ChartData,
  locale: Locale,
  corpus: readonly CorpusEntry[],
  chartKind: 'natal' | 'composite',
  exclude: InterpretationExclusions,
): ReportSection {
  const ascendantSign = signIndex(chart.houses.ascendant);
  // degree-symbol has no composite sibling (schema.ts: it isn't personal the way a placement
  // is) — natal only, woven right after the placement paragraph it supplements, a flat
  // enumerated extra never scored into rules.ts's salience ranking (that engine has nothing to
  // weigh a bare degree against: no dignity, sect, angularity or aspect orb to key off).
  const degreeSymbol = (longitude: Degrees): readonly ReportParagraph[] =>
    chartKind === 'natal' ? [degreeSymbolParagraph(longitude, locale, corpus)] : [];
  // A body left out of the reading (#721) contributes nothing here: not its sign, house or degree.
  const bodyParagraphs = (key: 'sun' | 'moon'): readonly ReportParagraph[] =>
    exclude.has(key)
      ? []
      : [
          planetInSignParagraph(chart, key, locale, corpus, chartKind),
          planetInHouseParagraph(chart, key, locale, corpus, chartKind),
          ...degreeSymbol(bodyPosition(chart, key).longitude),
        ];
  return section('core-identity', locale, [
    ...bodyParagraphs('sun'),
    ...bodyParagraphs('moon'),
    resolveParagraph(
      { category: 'sign-on-cusp', sign: ascendantSign, house: 1 },
      locale,
      corpus,
      [],
      chart.houses.ascendant,
    ),
    ...degreeSymbol(chart.houses.ascendant),
    ...degreeSymbol(chart.houses.midheaven),
  ]);
}

/** The temperament names; which element gives which is `chart-overview.ts`'s `ELEMENT_TEMPERAMENT` (#691). */
const TEMPERAMENT_NAMES: Readonly<Record<Temperament, Readonly<Record<Locale, string>>>> = {
  choleric: { en: 'choleric', nl: 'cholerisch' },
  melancholic: { en: 'melancholic', nl: 'melancholisch' },
  sanguine: { en: 'sanguine', nl: 'sanguinisch' },
  phlegmatic: { en: 'phlegmatic', nl: 'flegmatisch' },
};

const ELEMENT_NAMES: Readonly<Record<Element, Readonly<Record<Locale, string>>>> = {
  fire: { en: 'Fire', nl: 'Vuur' },
  earth: { en: 'Earth', nl: 'Aarde' },
  air: { en: 'Air', nl: 'Lucht' },
  water: { en: 'Water', nl: 'Water' },
};

const MODALITY_NAMES: Readonly<Record<Modality, Readonly<Record<Locale, string>>>> = {
  cardinal: { en: 'Cardinal', nl: 'Kardinaal' },
  fixed: { en: 'Fixed', nl: 'Vast' },
  mutable: { en: 'Mutable', nl: 'Beweeglijk' },
};

function tallyFactors<K extends string>(
  rule: string,
  balance: Readonly<Record<K, number>>,
  order: readonly K[],
): SalienceFactor[] {
  return order.map((key) => ({ rule, weight: balance[key], detail: `${key}: ${String(balance[key])}` }));
}

function temperamentSection(chart: ChartData, locale: Locale, rulership: RulershipChoice): ReportSection {
  // The same tallies and temperament the consultation page and the PDF summary show (#691).
  const { elements, modalities, dominantElement, dominantModality, temperament } = chartOverview(chart, rulership);

  const elementSentence =
    locale === 'nl'
      ? `Vuur ${String(elements.fire)}, aarde ${String(elements.earth)}, lucht ${String(elements.air)} en water ${String(elements.water)} — ${ELEMENT_NAMES[dominantElement].nl.toLowerCase()} overheerst.`
      : `Fire ${String(elements.fire)}, earth ${String(elements.earth)}, air ${String(elements.air)}, water ${String(elements.water)} — ${ELEMENT_NAMES[dominantElement].en.toLowerCase()} dominates.`;

  const temperamentSentence =
    locale === 'nl'
      ? `Dat wijst op een ${TEMPERAMENT_NAMES[temperament].nl} temperament, met een ${MODALITY_NAMES[dominantModality].nl.toLowerCase()} inslag.`
      : `That points to a ${TEMPERAMENT_NAMES[temperament].en} temperament, with a ${MODALITY_NAMES[dominantModality].en.toLowerCase()} bent.`;

  const elementFactors = tallyFactors('element-balance', elements, ELEMENT_ORDER);
  const modalityFactors = tallyFactors('modality-balance', modalities, MODALITY_ORDER);

  return section('temperament', locale, [
    derivedParagraph(elementSentence, elementFactors),
    derivedParagraph(temperamentSentence, [...elementFactors, ...modalityFactors]),
  ]);
}

function chainBodyName(id: BodyId): string {
  const body = bodyById(id);
  if (body === undefined) throw new Error(`unreachable: dispositorChain only ever returns known body ids`);
  return body.name;
}

function describeDispositorChain(chain: DispositorChain, locale: Locale): string {
  const path = chain.chain.map(chainBodyName).join(' → ');
  if (chain.cycle) {
    return locale === 'nl'
      ? `Dispositorketen: ${path} — sluit in een kringloop in plaats van bij een uiteindelijke heerser.`
      : `Dispositor chain: ${path} — closes in a cycle rather than at a final dispositor.`;
  }
  return locale === 'nl'
    ? `Dispositorketen: ${path} — komt uiteindelijk uit bij zijn eigen heerserschap.`
    : `Dispositor chain: ${path} — ultimately terminates at its own rulership.`;
}

function chartRulerSection(
  chart: ChartData,
  locale: Locale,
  corpus: readonly CorpusEntry[],
  rulership: RulershipChoice,
  chartKind: 'natal' | 'composite',
  exclude: InterpretationExclusions,
): ReportSection {
  const ascendantSign = signIndex(chart.houses.ascendant);
  // Under Both the Ascendant has two rulers (Scorpio: Mars and Pluto); each gets its own sign paragraph.
  const rulerIds = rulersOf(ascendantSign, rulership);
  const rulerSignCategory = chartKind === 'composite' ? 'composite-planet-in-sign' : 'planet-in-sign';
  const rulerSignParagraphs = rulerIds.flatMap((rulerId) => {
    const ruler = bodyById(rulerId);
    const rulerPosition = chart.positions.find((position) => position.body === rulerId);
    if (ruler === undefined || rulerPosition === undefined) {
      throw new Error('unreachable: the ascendant ruler is always one of BODIES with a computed position');
    }
    // The ruler's own sign reading is a placement of that body (#721); the chain below stays a whole-chart fact.
    if (exclude.has(ruler.key)) return [];
    return [
      resolveParagraph(
        { category: rulerSignCategory, body: ruler.key, sign: signIndex(rulerPosition.longitude) },
        locale,
        corpus,
        [],
        rulerPosition.longitude,
      ),
    ];
  });

  // A chain needs one path: the traditional ruler under Traditional, the modern one otherwise.
  const chain = dispositorChain(primaryRulerOf(ascendantSign, rulership), positionsMap(chart), rulership);
  const chainFactors: SalienceFactor[] = chain.chain.map((id, index) => ({
    rule: 'dispositor-step',
    weight: index,
    detail: chainBodyName(id),
  }));

  const coRulerNote =
    rulerIds.length > 1
      ? [
          derivedParagraph(
            locale === 'nl'
              ? `De Ascendant heeft hier twee heersers: ${rulerIds.map(chainBodyName).join(' en ')}. De keten hieronder volgt de moderne heerser.`
              : `The Ascendant has two rulers here: ${rulerIds.map(chainBodyName).join(' and ')}. The chain below follows the modern ruler.`,
            rulerIds.map((id, index) => ({ rule: 'dispositor-step', weight: index, detail: chainBodyName(id) })),
          ),
        ]
      : [];

  return section('chart-ruler', locale, [
    ...rulerSignParagraphs,
    ...coRulerNote,
    derivedParagraph(describeDispositorChain(chain, locale), chainFactors),
  ]);
}

function housesSection(
  chart: ChartData,
  locale: Locale,
  corpus: readonly CorpusEntry[],
  chartKind: 'natal' | 'composite',
  exclude: InterpretationExclusions,
): ReportSection {
  const houseCount = chart.houses.cusps.length - 1;
  const bodiesByHouse = new Map<number, BodyId[]>();
  for (const position of chart.positions) {
    const key = bodyById(position.body)?.key;
    if (key !== undefined && exclude.has(key)) continue;
    const house = houseOf(position.longitude, chart.houses.cusps);
    const list = bodiesByHouse.get(house);
    if (list) list.push(position.body);
    else bodiesByHouse.set(house, [position.body]);
  }

  // sign-on-cusp has no composite sibling (#451 only asked for the three categories above) — a
  // house cusp's sign is a fact about the chart's own structure, not a trait attributed to "you".
  const planetInHouseCategory = chartKind === 'composite' ? 'composite-planet-in-house' : 'planet-in-house';
  const paragraphs: ReportParagraph[] = [];
  for (let house = 1; house <= houseCount; house++) {
    const cusp = chart.houses.cusps[house];
    if (cusp === undefined) continue;
    paragraphs.push(
      resolveParagraph({ category: 'sign-on-cusp', sign: signIndex(cusp), house }, locale, corpus, [], cusp),
    );
    for (const bodyId of bodiesByHouse.get(house) ?? []) {
      const body = bodyById(bodyId);
      if (body === undefined) continue;
      paragraphs.push(resolveParagraph({ category: planetInHouseCategory, body: body.key, house }, locale, corpus));
    }
  }
  return section('houses', locale, paragraphs);
}

const JONES_SHAPE_NAMES: Readonly<Record<JonesShape, Readonly<Record<Locale, string>>>> = {
  bundle: { en: 'Bundle', nl: 'Bundel' },
  bowl: { en: 'Bowl', nl: 'Schaal' },
  locomotive: { en: 'Locomotive', nl: 'Locomotief' },
  bucket: { en: 'Bucket', nl: 'Emmer' },
  seesaw: { en: 'Seesaw', nl: 'Wip' },
  splay: { en: 'Splay', nl: 'Waaier' },
  splash: { en: 'Splash', nl: 'Spreiding' },
};

function jonesShapeSentence(chart: ChartData, locale: Locale): string {
  const shape = jonesShapeOf(jonesBodyPositions(chart.positions)).shape;
  const name = JONES_SHAPE_NAMES[shape][locale];
  return locale === 'nl' ? `Je horoscoop vormt een ${name}-patroon.` : `Your chart forms a ${name} pattern.`;
}

function aspectPatternsSection(
  chart: ChartData,
  locale: Locale,
  corpus: readonly CorpusEntry[],
  chartKind: 'natal' | 'composite',
  exclude: InterpretationExclusions,
): ReportSection {
  const aspectPlacements = rankPlacements(derivePlacements(chart, exclude))
    .filter((placement) => placement.placement.category === 'aspect-pair')
    .slice(0, ASPECT_PATTERNS_LIMIT);
  // `derivePlacements` always tags its own output 'aspect-pair' regardless of chart kind (it's
  // shared with the natal wheel's own click-to-isolate interpretation, out of scope for #451) —
  // remapped to the composite category here, the one place a composite's report actually reads it.
  const paragraphs = aspectPlacements.map((placement) => {
    const { placement: aspectPlacement, factors } = placement;
    const corpusPlacement: CorpusPlacement =
      chartKind === 'composite' && aspectPlacement.category === 'aspect-pair'
        ? {
            category: 'composite-aspect-pair',
            aspect: aspectPlacement.aspect,
            bodyA: aspectPlacement.bodyA,
            bodyB: aspectPlacement.bodyB,
          }
        : aspectPlacement;
    return resolveParagraph(corpusPlacement, locale, corpus, factors);
  });

  // jonesShapeOf needs at least 2 of the ten planets; every real ChartData has them all, but a minimal fixture might not.
  const shape =
    jonesBodyPositions(chart.positions).size >= 2 ? [derivedParagraph(jonesShapeSentence(chart, locale))] : [];

  return section('aspect-patterns', locale, [...shape, ...paragraphs]);
}

function dignitiesSectSection(
  chart: ChartData,
  locale: Locale,
  corpus: readonly CorpusEntry[],
  exclude: InterpretationExclusions,
): ReportSection {
  const sectSentence =
    locale === 'nl'
      ? chart.sect === 'day'
        ? 'Dit is een daghoroscoop: de Zon staat boven de horizon.'
        : 'Dit is een nachthoroscoop: de Zon staat onder de horizon.'
      : chart.sect === 'day'
        ? 'This is a day chart: the Sun is above the horizon.'
        : 'This is a night chart: the Sun is below the horizon.';
  const sectParagraph = derivedParagraph(sectSentence, [
    { rule: 'sect', weight: chart.sect === 'day' ? 1 : 0, detail: `${chart.sect} chart` },
  ]);

  const dignityParagraphs = Array.from(chart.dignities.entries()).flatMap(([id, dignities]) => {
    const state = dignityState(dignities);
    if (state === undefined) return [];
    const body = bodyById(id);
    if (body === undefined || exclude.has(body.key)) return [];
    return [resolveParagraph({ category: 'dignity-state', body: body.key, state }, locale, corpus)];
  });

  return section('dignities-sect', locale, [sectParagraph, ...dignityParagraphs]);
}

const NODE_CHIRON_KEYS = ['trueNode', 'chiron'] as const;

function nodesChironSection(
  chart: ChartData,
  locale: Locale,
  corpus: readonly CorpusEntry[],
  chartKind: 'natal' | 'composite',
  exclude: InterpretationExclusions,
): ReportSection {
  const paragraphs = NODE_CHIRON_KEYS.flatMap((key) => {
    const body = bodyByKey(key);
    if (exclude.has(key)) return [];
    if (body === undefined || !chart.positions.some((position) => position.body === body.id)) return [];
    return [
      planetInSignParagraph(chart, key, locale, corpus, chartKind),
      planetInHouseParagraph(chart, key, locale, corpus, chartKind),
    ];
  });
  return section('nodes-chiron', locale, paragraphs);
}

export function assembleReport(
  chart: ChartData,
  locale: Locale,
  corpus: readonly CorpusEntry[],
  rulership: RulershipChoice = DEFAULT_RULERSHIP_CHOICE,
  /**
   * What kind of chart `chart` is (#450); defaults to `'natal'`, which every caller except
   * `CompositeView.tsx` (via `ReportView.tsx`) is. `'composite'` prepends a framing paragraph and
   * (#451) reads the planet-in-sign/-house/aspect-pair sections through their composite-aware
   * sibling categories instead — `sign-on-cusp` and `dignity-state` have no composite sibling
   * (see those sections' own comments) and stay on the plain natal category either way.
   */
  chartKind: 'natal' | 'composite' = 'natal',
  /**
   * Body keys the reading must not speak about (#721), from the chart's object policy
   * (`interpretationExclusions`). They are left out of every paragraph that names them — placements,
   * contacts, dignities, the nodes/Chiron section and the Sun/Moon opening — and nothing is substituted.
   * Whole-chart facts (element balance, chart shape, the dispositor chain) deliberately stay: they are
   * statements about the whole calculation, not about one object, and `reportScope` says as much.
   */
  exclude: InterpretationExclusions = NO_EXCLUSIONS,
): Report {
  return {
    sections: [
      ...(chartKind === 'composite' ? [compositeIntroSection(locale)] : []),
      coreIdentitySection(chart, locale, corpus, chartKind, exclude),
      temperamentSection(chart, locale, rulership),
      chartRulerSection(chart, locale, corpus, rulership, chartKind, exclude),
      housesSection(chart, locale, corpus, chartKind, exclude),
      aspectPatternsSection(chart, locale, corpus, chartKind, exclude),
      dignitiesSectSection(chart, locale, corpus, exclude),
      nodesChironSection(chart, locale, corpus, chartKind, exclude),
    ],
  };
}

/**
 * The placement keys an already-assembled report covers, deduplicated —
 * exactly the de-identified data #360's Tier 2 is allowed to send a model
 * (never the underlying chart). A `'derived'` paragraph (temperament, sect,
 * dispositor chain) has no `CorpusPlacement` of its own and is skipped.
 */
export function reportPlacementKeys(report: Report): readonly string[] {
  const keys = new Set<string>();
  for (const reportSection of report.sections) {
    for (const paragraph of reportSection.paragraphs) {
      if (paragraph.placement) keys.add(placementKey(paragraph.placement));
    }
  }
  return [...keys];
}
