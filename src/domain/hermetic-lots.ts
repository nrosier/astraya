/**
 * @module domain/hermetic-lots
 * @purpose Computes Paulus's five Hermetic lots (Eros, Necessity, Courage, Victory, Nemesis) for a chart (#1797), with the house each falls in.
 * @conventions Pure and total: a lot whose planet position is missing from the chart is dropped, never thrown. Rows follow Paulus's order. House is `undefined` when the chart has no defined houses. Fortune and Spirit are not rows here; they stay in the Derived points table, and these lots stay outside `DerivedPointKey` on purpose.
 * @exports HermeticLotKey, HermeticLotRow, hermeticLots
 */
import { bodyByKey } from '../astrology/bodies.js';
import {
  lotOfCourage,
  lotOfEros,
  lotOfNecessity,
  lotOfNemesis,
  lotOfVictory,
  type LotKey,
} from '../astrology/arabic-parts.js';
import { houseOf } from '../astrology/emphasis.js';
import type { Sect } from '../astrology/sect.js';
import type { Degrees } from '../ephemeris/types.js';
import { housesAreDefined, type ChartData } from './chart-compute.js';

/** The five Hermetic lots shown in the Hermetic lots table (Fortune and Spirit are excluded). */
export type HermeticLotKey = Exclude<LotKey, 'part-of-fortune' | 'part-of-spirit'>;

export interface HermeticLotRow {
  readonly key: HermeticLotKey;
  readonly longitude: Degrees;
  /** One-based; `undefined` when the chart has no defined houses. */
  readonly house: number | undefined;
}

/** Longitude of a body in the chart, or `undefined` when that body has no position. */
function longitudeOfBody(data: ChartData, key: string): Degrees | undefined {
  const id = bodyByKey(key)?.id;
  if (id === undefined) return undefined;
  return data.positions.find((position) => position.body === id)?.longitude;
}

/** Each lot's own formula, applied to the chart's sect, Ascendant, planet and Fortune/Spirit longitude. */
function lotLongitude(
  key: HermeticLotKey,
  sect: Sect,
  ascendant: Degrees,
  planet: Degrees,
  fortune: Degrees,
  spirit: Degrees,
): Degrees {
  switch (key) {
    case 'lot-of-eros':
      return lotOfEros(sect, ascendant, planet, spirit);
    case 'lot-of-necessity':
      return lotOfNecessity(sect, ascendant, planet, fortune);
    case 'lot-of-courage':
      return lotOfCourage(sect, ascendant, planet, fortune);
    case 'lot-of-victory':
      return lotOfVictory(sect, ascendant, planet, spirit);
    case 'lot-of-nemesis':
      return lotOfNemesis(sect, ascendant, planet, fortune);
  }
}

/** Paulus's order, with the planet each lot is built from. */
const LOT_PLANETS: readonly { key: HermeticLotKey; planet: string }[] = [
  { key: 'lot-of-eros', planet: 'venus' },
  { key: 'lot-of-necessity', planet: 'mercury' },
  { key: 'lot-of-courage', planet: 'mars' },
  { key: 'lot-of-victory', planet: 'jupiter' },
  { key: 'lot-of-nemesis', planet: 'saturn' },
];

export function hermeticLots(data: ChartData): readonly HermeticLotRow[] {
  const definedHouses = housesAreDefined(data.houses);
  const rows: HermeticLotRow[] = [];
  for (const { key, planet } of LOT_PLANETS) {
    const planetLongitude = longitudeOfBody(data, planet);
    if (planetLongitude === undefined) continue;
    const longitude = lotLongitude(
      key,
      data.sect,
      data.houses.ascendant,
      planetLongitude,
      data.partOfFortune,
      data.partOfSpirit,
    );
    const house = definedHouses ? houseOf(longitude, data.houses.cusps) : undefined;
    rows.push({ key, longitude, house });
  }
  return rows;
}
