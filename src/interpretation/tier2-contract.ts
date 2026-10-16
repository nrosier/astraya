/**
 * Tier 2's wire shapes and their closed-set validators (#588), defined exactly once and imported
 * verbatim by both `src/interpretation/tier2-client.ts` (the browser) and
 * `server/interpretation-routes.ts`/`server/interpretation/llm-client.ts` (the server) — the same
 * "define once under `src/interpretation/`, import from both sides" pattern this file's own
 * `focus-context-schema.ts` and `schema.ts` already use for `FocusContext`/`validateFocusContext`
 * and `Locale`/`validateKey`. Before this file existed, each side hand-declared its own copy of
 * these shapes with a `/** Hand-mirrors ... *\/` comment pointing at the other — nothing enforced
 * the two stayed aligned, which is exactly the gap #588 (ARCH-01) flagged: a future server-side
 * validation change could silently diverge from what the client builds, with no compiler error.
 *
 * The validators here only use static astrology reference tables (`bodyById`/`aspectByKey`), the
 * same reason `focus-context-schema.ts` imports only those — no chart-computing modules, no
 * server-only concerns (DB, auth, env, request/reply), so the server can use this without pulling
 * in anything heavier, and `src/` stays free to import it too.
 */
/**
 * @module interpretation/tier2-contract
 * @purpose Defines Tier 2's freeform-chart and relationship-mode wire shapes, plus the model's own section shape, and the closed-set validators the server runs on untrusted client input before it reaches a prompt.
 * @conventions Every field of untrusted input is rebuilt from a known/closed set rather than passed through — the same rule `focus-context-schema.ts` and `schema.ts`'s `validateKey` already follow. Defined once here; neither the client nor the server redeclares any of these shapes locally.
 * @exports Tier2Section, isTier2Section, Tier2PositionsHousesPayload, Tier2AspectPayload, Tier2ChartDataPayload, Tier2HouseOverlayPayload, Tier2RelationshipDataPayload, validatePositionsAndHouses, validateAspectList, validateChartData, validateHouseOverlays, validateRelationshipData
 */
import { aspectByKey } from '../astrology/aspects.ts';
import { bodyById } from '../astrology/bodies.ts';

/** The model's own reply shape: a restyled/freeform interpretation as named sections. */
export interface Tier2Section {
  readonly heading: string;
  readonly body: string;
}

export function isTier2Section(value: unknown): value is Tier2Section {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { heading?: unknown }).heading === 'string' &&
    typeof (value as { body?: unknown }).body === 'string'
  );
}

// A real chart has a couple dozen bodies at most (planets, angles, nodes, asteroids); a full
// house wheel is always 13 entries (index 0 unused, 1..12 real); a real chart has at most a few
// hundred aspect pairs. Generous ceilings against a padded request inflating cost.
const MAX_BODIES = 40;
const HOUSE_CUSP_COUNT = 13;
const MAX_ASPECTS = 200;
const MAX_HOUSE_OVERLAYS = MAX_BODIES * 2;

/** `max` is exclusive — matches longitude's `[0, 360)` convention. */
function isFiniteNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value < max;
}

function isFiniteNumberInClosedRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export interface Tier2PositionsHousesPayload {
  readonly positions: readonly { readonly body: number; readonly longitude: number }[];
  readonly houses: { readonly cusps: readonly number[]; readonly ascendant: number; readonly midheaven: number };
}

export interface Tier2AspectPayload {
  readonly bodyA: number;
  readonly bodyB: number;
  readonly aspectKey: string;
  readonly separation: number;
  readonly orb: number;
}

/**
 * The `positions`/`houses` half shared by `chartData` (one chart) and `relationshipData` (two
 * charts, #422) — split out so the same closed-set checks aren't written twice. `label` names
 * the field in an error message ("chartData" or "relationshipData.chartA").
 */
export function validatePositionsAndHouses(
  payload: unknown,
  label: string,
): { value: Tier2PositionsHousesPayload } | { errors: string[] } {
  const errors: string[] = [];
  if (typeof payload !== 'object' || payload === null) {
    return { errors: [`${label} must be an object`] };
  }
  const { positions, houses } = payload as Record<string, unknown>;

  if (!Array.isArray(positions) || positions.length === 0) {
    errors.push(`${label}.positions must be a non-empty array`);
  } else if (positions.length > MAX_BODIES) {
    errors.push(`${label}.positions must not exceed ${String(MAX_BODIES)} entries`);
  } else {
    for (const [index, entry] of positions.entries()) {
      if (typeof entry !== 'object' || entry === null) {
        errors.push(`${label}.positions[${String(index)}] must be an object`);
        continue;
      }
      const { body, longitude } = entry as Record<string, unknown>;
      if (typeof body !== 'number' || bodyById(body) === undefined) {
        errors.push(`${label}.positions[${String(index)}].body must be a known body id`);
      }
      if (!isFiniteNumberInRange(longitude, 0, 360)) {
        errors.push(`${label}.positions[${String(index)}].longitude must be a number in [0, 360)`);
      }
    }
  }

  if (typeof houses !== 'object' || houses === null) {
    errors.push(`${label}.houses must be an object`);
  } else {
    const { cusps, ascendant, midheaven } = houses as Record<string, unknown>;
    if (!Array.isArray(cusps) || cusps.length !== HOUSE_CUSP_COUNT) {
      errors.push(`${label}.houses.cusps must be an array of exactly ${String(HOUSE_CUSP_COUNT)} entries`);
    } else if (
      // Index 0 is unused (see `HOUSE_CUSP_COUNT`'s own comment and `HousePositions.cusps`'s
      // doc comment in `ephemeris/types.ts`) — `houseOf` (the server's only reader of
      // `chartData.houses.cusps`) never looks at it, so it is never a real degree value and must
      // not be held to the same [0, 360) requirement as indices 1..12. Checking it anyway
      // rejected every single freeform request, always, regardless of chart (#372's sibling bug
      // report): `toTier2ChartPayload` sends `HousePositions` verbatim, so `cusps[0]` was always
      // this placeholder, never a real house cusp.
      !cusps.slice(1).every((cusp) => isFiniteNumberInRange(cusp, 0, 360))
    ) {
      errors.push(`${label}.houses.cusps entries 1..12 must all be numbers in [0, 360)`);
    }
    if (!isFiniteNumberInRange(ascendant, 0, 360)) {
      errors.push(`${label}.houses.ascendant must be a number in [0, 360)`);
    }
    if (!isFiniteNumberInRange(midheaven, 0, 360)) {
      errors.push(`${label}.houses.midheaven must be a number in [0, 360)`);
    }
  }

  if (errors.length > 0) return { errors };
  return { value: payload as Tier2PositionsHousesPayload };
}

/** An aspect list's own closed-set checks, shared by `chartData.aspects` and `relationshipData.crossAspects` (#422). */
export function validateAspectList(
  payload: unknown,
  label: string,
): { value: readonly Tier2AspectPayload[] } | { errors: string[] } {
  if (!Array.isArray(payload)) return { errors: [`${label} must be an array`] };
  if (payload.length > MAX_ASPECTS) return { errors: [`${label} must not exceed ${String(MAX_ASPECTS)} entries`] };
  const errors: string[] = [];
  for (const [index, entry] of payload.entries()) {
    if (typeof entry !== 'object' || entry === null) {
      errors.push(`${label}[${String(index)}] must be an object`);
      continue;
    }
    const { bodyA, bodyB, aspectKey, separation, orb } = entry as Record<string, unknown>;
    if (typeof bodyA !== 'number' || bodyById(bodyA) === undefined) {
      errors.push(`${label}[${String(index)}].bodyA must be a known body id`);
    }
    if (typeof bodyB !== 'number' || bodyById(bodyB) === undefined) {
      errors.push(`${label}[${String(index)}].bodyB must be a known body id`);
    }
    if (typeof aspectKey !== 'string' || aspectByKey(aspectKey) === undefined) {
      errors.push(`${label}[${String(index)}].aspectKey must be a known aspect key`);
    }
    if (!isFiniteNumberInClosedRange(separation, 0, 180)) {
      errors.push(`${label}[${String(index)}].separation must be a number in [0, 180]`);
    }
    if (typeof orb !== 'number' || !Number.isFinite(orb) || orb < 0) {
      errors.push(`${label}[${String(index)}].orb must be a non-negative number`);
    }
  }
  if (errors.length > 0) return { errors };
  return { value: payload as readonly Tier2AspectPayload[] };
}

/** Freeform mode's validated wire shape. */
export interface Tier2ChartDataPayload extends Tier2PositionsHousesPayload {
  readonly aspects: readonly Tier2AspectPayload[];
}

/**
 * Re-derives and closed-set-validates freeform mode's `chartData` payload —
 * the same reason `validateKey` does this for grounded mode's
 * `placementKeys`: an attacker-chosen body id, aspect key, or out-of-range
 * angle would otherwise be echoed into the model prompt unchecked.
 */
export function validateChartData(payload: unknown): { chartData: Tier2ChartDataPayload } | { errors: string[] } {
  const base = validatePositionsAndHouses(payload, 'chartData');
  const aspectsPayload =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>).aspects : undefined;
  const aspects = validateAspectList(aspectsPayload, 'chartData.aspects');
  const errors = [...('errors' in base ? base.errors : []), ...('errors' in aspects ? aspects.errors : [])];
  if (errors.length > 0) return { errors };
  // Safe: both validated above.
  return {
    chartData: {
      ...(base as { value: Tier2PositionsHousesPayload }).value,
      aspects: (aspects as { value: readonly Tier2AspectPayload[] }).value,
    },
  };
}

export interface Tier2HouseOverlayPayload {
  readonly body: number;
  readonly house: number;
  readonly direction: 'a-in-b' | 'b-in-a';
}

export function validateHouseOverlays(
  payload: unknown,
): { value: readonly Tier2HouseOverlayPayload[] } | { errors: string[] } {
  if (!Array.isArray(payload)) return { errors: ['relationshipData.houseOverlays must be an array'] };
  if (payload.length > MAX_HOUSE_OVERLAYS) {
    return { errors: [`relationshipData.houseOverlays must not exceed ${String(MAX_HOUSE_OVERLAYS)} entries`] };
  }
  const errors: string[] = [];
  for (const [index, entry] of payload.entries()) {
    if (typeof entry !== 'object' || entry === null) {
      errors.push(`relationshipData.houseOverlays[${String(index)}] must be an object`);
      continue;
    }
    const { body, house, direction } = entry as Record<string, unknown>;
    if (typeof body !== 'number' || bodyById(body) === undefined) {
      errors.push(`relationshipData.houseOverlays[${String(index)}].body must be a known body id`);
    }
    if (typeof house !== 'number' || !Number.isInteger(house) || house < 1 || house > 12) {
      errors.push(`relationshipData.houseOverlays[${String(index)}].house must be an integer in [1, 12]`);
    }
    if (direction !== 'a-in-b' && direction !== 'b-in-a') {
      errors.push(`relationshipData.houseOverlays[${String(index)}].direction must be 'a-in-b' or 'b-in-a'`);
    }
  }
  if (errors.length > 0) return { errors };
  return { value: payload as readonly Tier2HouseOverlayPayload[] };
}

export interface Tier2RelationshipDataPayload {
  readonly chartA: Tier2PositionsHousesPayload;
  readonly chartB: Tier2PositionsHousesPayload;
  readonly crossAspects: readonly Tier2AspectPayload[];
  readonly houseOverlays: readonly Tier2HouseOverlayPayload[];
}

/**
 * Re-derives and closed-set-validates the relationship mode's two-chart payload (#422): both
 * charts' own positions/houses (no personal data — never a name, date or place, only the same
 * computed facts `chartData` already sends for one chart), the cross-aspects between them, and
 * the house-overlay list — every one checked against the same closed sets `validateChartData`
 * already uses, for the same reason: untrusted client data must never reach the model prompt
 * unchecked.
 */
export function validateRelationshipData(
  payload: unknown,
): { relationshipData: Tier2RelationshipDataPayload } | { errors: string[] } {
  if (typeof payload !== 'object' || payload === null) {
    return { errors: ['relationshipData must be an object'] };
  }
  const { chartA, chartB, crossAspects, houseOverlays } = payload as Record<string, unknown>;
  const a = validatePositionsAndHouses(chartA, 'relationshipData.chartA');
  const b = validatePositionsAndHouses(chartB, 'relationshipData.chartB');
  const cross = validateAspectList(crossAspects, 'relationshipData.crossAspects');
  const overlays = validateHouseOverlays(houseOverlays);
  const errors = [
    ...('errors' in a ? a.errors : []),
    ...('errors' in b ? b.errors : []),
    ...('errors' in cross ? cross.errors : []),
    ...('errors' in overlays ? overlays.errors : []),
  ];
  if (errors.length > 0) return { errors };
  return {
    relationshipData: {
      chartA: (a as { value: Tier2PositionsHousesPayload }).value,
      chartB: (b as { value: Tier2PositionsHousesPayload }).value,
      crossAspects: (cross as { value: readonly Tier2AspectPayload[] }).value,
      houseOverlays: (overlays as { value: readonly Tier2HouseOverlayPayload[] }).value,
    },
  };
}
