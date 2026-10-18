/**
 * The facts a reader takes in first about a chart (#691), as one model for every place that shows them: the
 * consultation page's at-a-glance block, the top of the Report and the PDF's summary. Built once from `ChartData`, so
 * the three can never disagree.
 *
 * Nothing here is new astrology: each fact is an existing calculation (`emphasis.ts`, `dispositors.ts`,
 * `rulership.ts`, the chart's own sect). Temperament is the classical Hippocratic–Galenic humour of the dominant
 * element (fire choleric, earth melancholic, air sanguine, water phlegmatic), as the Report has always stated it.
 */
/**
 * @module domain/chart-overview
 * @purpose One model of a chart's headline facts (big three, chart ruler, sect, element and modality balance, temperament, dominant planet, dispositor chain) shared by the consultation page, the Report and the PDF (#691).
 * @conventions Pure. Element and modality tallies count every computed position, one each, with ties going to the earlier element (fire, earth, air, water) or modality (cardinal, fixed, mutable). The angle-dependent facts (Ascendant, chart ruler, sect, dispositor chain) are undefined without a usable birth time.
 * @exports Temperament, OverviewPlacement, ChartOverview, ELEMENT_ORDER, MODALITY_ORDER, ELEMENT_TEMPERAMENT, dominantOf, chartOverview
 */
import { bodyById } from '../astrology/bodies.js';
import { dispositorChain } from '../astrology/dispositors.js';
import {
  dominantPlanet,
  elementBalance,
  modalityBalance,
  type ElementBalance,
  type ModalityBalance,
} from '../astrology/emphasis.js';
import { primaryRulerOf, rulersOf, type RulershipChoice } from '../astrology/rulership.js';
import type { Sect } from '../astrology/sect.js';
import { signIndex, type Element, type Modality } from '../astrology/signs.js';
import type { BodyId, Degrees } from '../ephemeris/types.js';
import { housesAreDefined, type ChartData } from './chart-compute.js';

export type Temperament = 'choleric' | 'melancholic' | 'sanguine' | 'phlegmatic';

export const ELEMENT_ORDER: readonly Element[] = ['fire', 'earth', 'air', 'water'];
export const MODALITY_ORDER: readonly Modality[] = ['cardinal', 'fixed', 'mutable'];

/** The classical Hippocratic–Galenic correspondence of element and humour. */
export const ELEMENT_TEMPERAMENT: Readonly<Record<Element, Temperament>> = {
  fire: 'choleric',
  earth: 'melancholic',
  air: 'sanguine',
  water: 'phlegmatic',
};

/** The key with the highest tally in `balance`; a tie goes to the earliest in `order`. */
export function dominantOf<K extends string>(balance: Readonly<Record<K, number>>, order: readonly K[]): K {
  let best = order[0];
  if (best === undefined) throw new Error('unreachable: order is never empty');
  for (const key of order) {
    if (balance[key] > balance[best]) best = key;
  }
  return best;
}

/** A body's or angle's place: its sign index and longitude. */
export interface OverviewPlacement {
  readonly sign: number;
  readonly longitude: Degrees;
}

export interface ChartOverview {
  readonly sun: OverviewPlacement | undefined;
  readonly moon: OverviewPlacement | undefined;
  /** Undefined without a usable birth time, as are the chart ruler, sect and dispositor chain. */
  readonly ascendant: OverviewPlacement | undefined;
  /** Body keys of the Ascendant's ruler, by the reader's rulership: two under Both for a co-ruled sign. */
  readonly chartRulers: readonly string[];
  readonly sect: Sect | undefined;
  readonly elements: ElementBalance;
  readonly dominantElement: Element;
  readonly modalities: ModalityBalance;
  readonly dominantModality: Modality;
  readonly temperament: Temperament;
  /** The traditional ruler of the sign holding the most bodies (`emphasis.ts`). */
  readonly dominantPlanet: string | undefined;
  /** From the chart ruler (its primary ruler, as the Report's chain): body keys, then the final dispositor or none for a cycle. */
  readonly dispositors: { readonly chain: readonly string[]; readonly finalDispositor: string | undefined } | undefined;
}

const keyOf = (id: BodyId): string => bodyById(id)?.key ?? String(id);

export function chartOverview(chart: ChartData, rulership: RulershipChoice): ChartOverview {
  const positions = new Map(chart.positions.map((position) => [position.body, position.longitude]));
  const placementOf = (key: string): OverviewPlacement | undefined => {
    const position = chart.positions.find((candidate) => keyOf(candidate.body) === key);
    return position === undefined ? undefined : { sign: signIndex(position.longitude), longitude: position.longitude };
  };
  const elements = elementBalance(positions);
  const modalities = modalityBalance(positions);
  const dominantElement = dominantOf(elements, ELEMENT_ORDER);
  const dominant = dominantPlanet(positions);
  const timed = housesAreDefined(chart.houses);
  const ascendantSign = signIndex(chart.houses.ascendant);
  const chain = timed ? dispositorChain(primaryRulerOf(ascendantSign, rulership), positions, rulership) : undefined;

  return {
    sun: placementOf('sun'),
    moon: placementOf('moon'),
    ascendant: timed ? { sign: ascendantSign, longitude: chart.houses.ascendant } : undefined,
    chartRulers: timed ? rulersOf(ascendantSign, rulership).map(keyOf) : [],
    sect: timed ? chart.sect : undefined,
    elements,
    dominantElement,
    modalities,
    dominantModality: dominantOf(modalities, MODALITY_ORDER),
    temperament: ELEMENT_TEMPERAMENT[dominantElement],
    dominantPlanet: dominant === undefined ? undefined : keyOf(dominant),
    dispositors:
      chain === undefined
        ? undefined
        : {
            chain: chain.chain.map(keyOf),
            finalDispositor: chain.finalDispositor === undefined ? undefined : keyOf(chain.finalDispositor),
          },
  };
}
