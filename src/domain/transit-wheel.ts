/**
 * @module domain/transit-wheel
 * @purpose Shapes the two rings of the Transits bi-wheel (natal inner, transit outer) so each ring's bodies and own aspect chords follow the filter's selected bodies and aspect types, as the transit-to-natal lines and the table already do (#1508, #1641).
 * @conventions Pure; builds on `chartWheelRing`, so the wheel's major-family rule, body visibility and labels are unchanged and the filter can only remove chords, never add minor ones; the screen and the PDF both call this so they cannot drift (#719).
 * @exports transitWheelInput, TransitWheelLabels, TransitWheelRings
 */
import { bodyById } from '../astrology/bodies.js';
import type { TransitFilter } from '../astrology/transit-importance.js';
import { filterAspectsForDisplay } from '../chart/aspect-web.js';
import type { BodyId } from '../ephemeris/types.js';
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

const keyOf = (body: BodyId): string => bodyById(body)?.key ?? '';

/**
 * The natal and transit rings, strictly limited to the filter (#1641): a ring draws only the bodies
 * selected for it (`filter.natal` for the natal ring, `filter.transiting` for the transit ring), and
 * only the chords of an aspect type in `filter.aspects` whose two ends are both such bodies.
 */
export function transitWheelInput(
  data: Pick<TransitData, 'natal' | 'transit'>,
  filter: Pick<TransitFilter, 'aspects' | 'natal' | 'transiting'>,
  labels: TransitWheelLabels,
): TransitWheelRings {
  const follow = (ring: WheelRingInput, selected: readonly string[]): WheelRingInput => {
    const shown = (body: BodyId): boolean => selected.includes(keyOf(body));
    return {
      ...ring,
      bodies: ring.bodies.filter((entry) => shown(entry.body)),
      aspects: filterAspectsForDisplay(
        (ring.aspects ?? []).filter((aspect) => shown(aspect.bodyA) && shown(aspect.bodyB)),
        { visibleAspectKeys: filter.aspects },
      ),
    };
  };
  return {
    natalRing: { ...follow(chartWheelRing(data.natal, labels.natal), filter.natal), role: 'natal' },
    transitRing: { ...follow(chartWheelRing(data.transit, labels.transit), filter.transiting), role: 'transit' },
  };
}
