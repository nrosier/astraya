/**
 * Shared TypeScript interfaces for Tier 2 (AI-customized interpretation) client/server contract.
 *
 * Hand-mirrors the server-side types from `server/interpretation-routes.ts` and
 * `server/interpretation/llm-client.ts`. Since there is no schema library shared between
 * client (`src/`) and server (`server/`), these interfaces form the contract that both
 * sides must honor independently. Tests should verify round-trip compatibility (#588).
 *
 * Tier 2 has four modes (#360, #423, #424, #425, #422):
 * - `'grounded'`: restyles a fixed corpus entry (no chart data crosses the wire, only de-identified keys)
 * - `'freeform'`: free-form interpretation from chart data (gives up "no chart data" guarantee for that mode)
 * - `'focus'` (#424): reads one placement's enriched FocusContext for tensions (#424)
 * - `'relationship'` (#422): synastry reading from both charts (no identifying data)
 */

/**
 * @module interpretation/tier2-contract
 * @purpose Shared TypeScript interfaces for Tier 2 client/server contract — hand-mirrors server-side types with no shared schema library.
 * @conventions These interfaces are duplicated manually on both sides; tests should verify round-trip compatibility; changes here must be reflected in server/interpretation-routes.ts and server/interpretation/llm-client.ts.
 * @exports Tier2Section, Tier2ChartDataPayload, Tier2PositionsHousesPayload, Tier2RelationshipDataPayload, Tier2Request
 */

import type { Locale } from './schema.js';
import type { FocusContext } from './focus-context-schema.js';

/** One section of a Tier 2 interpretation result — heading + prose body. */
export interface Tier2Section {
  readonly heading: string;
  readonly body: string;
}

/**
 * Chart data payload for freeform mode — a subset of `ChartData` (#589).
 * Deliberately omits dignities/sect/partOfFortune/partOfSpirit (not sent to the model).
 */
export interface Tier2ChartDataPayload {
  readonly positions: readonly { readonly body: number; readonly longitude: number }[];
  readonly houses: { readonly cusps: readonly number[]; readonly ascendant: number; readonly midheaven: number };
  readonly aspects: readonly {
    readonly bodyA: number;
    readonly bodyB: number;
    readonly aspectKey: string;
    readonly separation: number;
    readonly orb: number;
  }[];
}

/** One side of a relationship payload — positions and houses without aspects. */
export interface Tier2PositionsHousesPayload {
  readonly positions: readonly { readonly body: number; readonly longitude: number }[];
  readonly houses: { readonly cusps: readonly number[]; readonly ascendant: number; readonly midheaven: number };
}

/** Relationship data payload for synastry mode (#422) — two charts plus their cross-chart aspects and house overlays. */
export interface Tier2RelationshipDataPayload {
  readonly chartA: Tier2PositionsHousesPayload;
  readonly chartB: Tier2PositionsHousesPayload;
  readonly crossAspects: readonly {
    readonly bodyA: number;
    readonly bodyB: number;
    readonly aspectKey: string;
    readonly separation: number;
    readonly orb: number;
  }[];
  readonly houseOverlays: readonly {
    readonly body: number;
    readonly house: number;
    readonly direction: 'a-in-b' | 'b-in-a';
  }[];
}

/**
 * The request payload for POST /api/interpretation/generate.
 * Four discriminated union variants, one per Tier 2 mode.
 */
export type Tier2Request =
  | {
      readonly mode: 'grounded';
      readonly placementKeys: readonly string[];
      readonly customPrompt: string;
      readonly locale: Locale;
    }
  | {
      readonly mode: 'freeform';
      readonly chartData: Tier2ChartDataPayload;
      readonly chartKind?: 'natal' | 'composite';
      readonly customPrompt?: string;
      readonly locale: Locale;
    }
  | {
      readonly mode: 'focus';
      readonly focusContext: FocusContext;
      readonly locale: Locale;
    }
  | {
      readonly mode: 'relationship';
      readonly relationshipData: Tier2RelationshipDataPayload;
      readonly customPrompt?: string;
      readonly locale: Locale;
    };
