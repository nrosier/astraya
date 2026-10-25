/**
 * @module report-placement-badges
 * @purpose Pure placement badges (sign and degree, house, retrograde label) for one body or point of a chart, shown under each placement title in the report (#802).
 * @conventions Bodies get all three badges; angles (Ascendant, Midheaven) and the lots get sign and degree only, never a house badge. Retrograde is true only when the body's own position is retrograde, read the same way as `bi-wheel-selection.ts`. Words come from `report-placement-badges.messages`, sign and body names from `astro-names.messages`.
 * @exports PlacementBadges, placementBadges
 */
import type { ChartData } from '../domain/chart-compute.js';
import { housesAreDefined } from '../domain/chart-compute.js';
import { houseOf } from '../astrology/emphasis.js';
import { signOf } from '../astrology/signs.js';
import { bodyByKey } from '../astrology/bodies.js';
import type { Degrees } from '../ephemeris/types.js';
import type { Locale } from '../interpretation/schema.js';
import { signDisplayName } from './astro-names.messages.js';
import { formatSignDegree } from './format.js';
import { ordinal } from './placement-label.js';
import { reportPlacementBadgeMessages } from './report-placement-badges.messages.js';

export interface PlacementBadges {
  /** Sign name and position within the sign, e.g. `Taurus · 5°12′`. */
  readonly signDegree: string;
  /** House number (1-12) the body falls in. Undefined for angles, lots and points, and when the houses have no solution. */
  readonly house: number | undefined;
  /** Badge text such as `9th house` or `9e huis`. Undefined when `house` is undefined. */
  readonly houseBadge: string | undefined;
  /** True only when the body itself is retrograde. */
  readonly retrograde: boolean;
  /** The retrograde label when `retrograde` is true, otherwise undefined. */
  readonly retrogradeLabel: string | undefined;
}

/** Keys of the angles and the lots that are not bodies in `positions`, mapped to their longitude. */
function pointLongitude(data: ChartData, key: string): Degrees | undefined {
  if (key === 'asc') return data.houses.ascendant;
  if (key === 'mc') return data.houses.midheaven;
  if (key === 'part-of-fortune') return data.partOfFortune;
  if (key === 'part-of-spirit') return data.partOfSpirit;
  return undefined;
}

/**
 * The badges for one placement of a chart, or `undefined` when the key names no body, angle or lot in it.
 * `bodyKey` is a `BodyDefinition.key` (e.g. `sun`), or `asc`, `mc`, `part-of-fortune`, `part-of-spirit`.
 */
export function placementBadges(data: ChartData, bodyKey: string, locale: Locale): PlacementBadges | undefined {
  const messages = reportPlacementBadgeMessages[locale];
  const body = bodyByKey(bodyKey);
  const position = body === undefined ? undefined : data.positions.find((candidate) => candidate.body === body.id);

  if (position === undefined) {
    const longitude = pointLongitude(data, bodyKey);
    if (longitude === undefined) return undefined;
    return {
      signDegree: `${signDisplayName(signOf(longitude).name, locale)} · ${formatSignDegree(longitude)}`,
      house: undefined,
      houseBadge: undefined,
      retrograde: false,
      retrogradeLabel: undefined,
    };
  }

  const house = housesAreDefined(data.houses) ? houseOf(position.longitude, data.houses.cusps) : undefined;
  return {
    signDegree: `${signDisplayName(signOf(position.longitude).name, locale)} · ${formatSignDegree(position.longitude)}`,
    house,
    houseBadge: house === undefined ? undefined : `${ordinal(house, locale)} ${messages.houseWord}`,
    retrograde: position.retrograde,
    retrogradeLabel: position.retrograde ? messages.retrograde : undefined,
  };
}
