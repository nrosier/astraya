/**
 * @module domain/transit-wheel
 * @purpose Shapes the two rings of the Transits bi-wheel (natal inner, transit outer) so each ring's own aspect chords follow the aspects-shown filter, as the transit-to-natal lines and the table already do (#1508).
 * @conventions Pure; builds on `chartWheelRing`, so the wheel's major-family rule, body visibility and labels are unchanged and the filter can only remove chords, never add minor ones; the screen and the PDF both call this so they cannot drift (#719).
 * @exports transitWheelInput, TransitWheelLabels, TransitWheelRings
 */
import type { TransitFilter } from '../astrology/transit-importance.js';
import { filterAspectsForDisplay } from '../chart/aspect-web.js';
import type { WheelRingInput } from '../chart/multi-wheel.js';
import { chartWheelRing } from './chart-tables.js';
import type { TransitData } from './transit.js';

export interface TransitWheelLabels {
  readonly natal: string;
  readonly transit: string;
}

export interface TransitWheelRings {
  /** Ring 0, innermost. */
  readonly natalRing: WheelRingInput;
  /** Ring 1, outer. */
  readonly transitRing: WheelRingInput;
}

/** The natal and transit rings, each limited to the aspect types the filter shows. */
export function transitWheelInput(
  data: Pick<TransitData, 'natal' | 'transit'>,
  filter: Pick<TransitFilter, 'aspects'>,
  labels: TransitWheelLabels,
): TransitWheelRings {
  const follow = (ring: WheelRingInput): WheelRingInput => ({
    ...ring,
    aspects: filterAspectsForDisplay(ring.aspects ?? [], { visibleAspectKeys: filter.aspects }),
  });
  return {
    natalRing: follow(chartWheelRing(data.natal, labels.natal)),
    transitRing: follow(chartWheelRing(data.transit, labels.transit)),
  };
}
