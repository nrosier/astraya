/**
 * House overlays (#422): which of the *other* chart's houses each of a pair's real bodies
 * falls into — the staple of a synastry reading alongside the cross-aspects
 * (`relationship-themes.ts`) `SynastryData.aspects` already covers. Pure structured data, no
 * text: the actual sentence is templated in `src/ui/RelationshipSummary.messages.ts`, the same
 * split every other domain module here keeps from its `.messages.ts` counterpart.
 */
import { bodyById } from '../astrology/bodies.js';
import { housesAreDefined } from './chart-compute.js';
import type { SynastryData } from './synastry.js';
import { houseOf } from '../astrology/emphasis.js';
import type { BodyPosition, HousePositions } from '../ephemeris/types.js';

export interface HouseOverlay {
  readonly bodyKey: string;
  readonly house: number;
  /** `'a-in-b'`: A's body falls in B's house. `'b-in-a'`: the reverse. */
  readonly direction: 'a-in-b' | 'b-in-a';
}

function overlaysOf(
  bodies: readonly BodyPosition[],
  intoHouses: HousePositions,
  direction: HouseOverlay['direction'],
): readonly HouseOverlay[] {
  if (!housesAreDefined(intoHouses)) return [];
  const overlays: HouseOverlay[] = [];
  for (const position of bodies) {
    const body = bodyById(position.body);
    if (body === undefined) continue;
    overlays.push({ bodyKey: body.key, house: houseOf(position.longitude, intoHouses.cusps), direction });
  }
  return overlays;
}

/**
 * Every real body's house overlay, both directions. A side whose houses have no solution (an
 * unknown-time person) is simply omitted for the direction that would need them — not an
 * error, the same convention `relationshipAngleContacts` uses.
 */
export function houseOverlays(data: SynastryData): readonly HouseOverlay[] {
  return [
    ...overlaysOf(data.chartA.positions, data.chartB.houses, 'a-in-b'),
    ...overlaysOf(data.chartB.positions, data.chartA.houses, 'b-in-a'),
  ];
}
