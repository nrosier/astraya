/**
 * Thin `fetch()` wrapper for `POST /api/interpretation/generate`
 * (`server/interpretation-routes.ts`), the one runtime path in Astraya that
 * calls a third-party model provider — proxied entirely through the server,
 * per ADR 0003. Same shape as `admin-client.ts`: nothing here interprets a
 * response beyond its own shape, and every rejection carries the server's
 * own message.
 *
 * Three modes, see ADR 0003:
 * - `'grounded'` sends `placementKeys` (from `report.ts`'s
 *   `reportPlacementKeys`) rather than the chart or corpus text itself — the
 *   server re-resolves each key's grounded Tier-1 text against its own copy
 *   of the corpus, so no interpretation prose crosses the wire from the
 *   client at all, only the de-identified placement keys already safe to
 *   send per ADR 0003's structural PII-minimization, and the model only
 *   restyles that given text.
 * - `'freeform'` sends `chartData` (computed positions/houses/aspects — see
 *   `toTier2ChartPayload`) and lets the model originate its own
 *   interpretation from it, reasoning across the whole chart's placements
 *   together. This deliberately gives up grounded mode's "no chart data crosses
 *   the wire" guarantee for this mode only; ADR 0003 documents the tradeoff.
 *   The instruction is optional (#425; this mode also replaces the former
 *   `'synthesis'` mode, which was the same call with no instruction).
 *
 * - `'focus'` (#424) sends `focusContext`: the sign, house, dispositor, rulerships and aspects of ONE
 *   selected placement (see `focus-context.ts`), and asks the model for that placement's tensions.
 *   There is no instruction, so nothing for the verifier to judge.
 *
 * `locale` is sent alongside either payload so the server responds in the
 * language the report is already showing.
 */
/**
 * @module interpretation/tier2-client
 * @purpose Thin fetch() client for POST /api/interpretation/generate — the one runtime path in Astraya that calls a third-party model provider, proxied entirely through the server per ADR 0003.
 * @conventions Three modes: 'grounded' sends only de-identified placementKeys (server re-resolves Tier-1 text, no interpretation prose crosses the wire); 'freeform' sends computed chartData and gives up the "no chart data crosses the wire" guarantee for that mode only; 'focus' sends one placement's enriched FocusContext. Interfaces here hand-mirror server-side shapes (server/interpretation/llm-client.ts, server/interpretation-routes.ts) since there is no shared schema library between client and server. `locale` always rides alongside the payload.
 * @exports Tier2Error, Tier2Section, Tier2ChartDataPayload, toTier2ChartPayload, Tier2PositionsHousesPayload, Tier2RelationshipDataPayload, toTier2RelationshipPayload, Tier2Request, SavedInterpretationSummary, SavedInterpretationDetail
 */
import { bodyByKey } from '../astrology/bodies.js';
import type { ChartData } from '../domain/chart-compute.js';
import type { SynastryData } from '../domain/synastry.js';
import type { FocusContext } from './focus-context-schema.js';
import type { ResultBasis, ResultKind } from './result-basis.js';
import type { Locale } from './schema.js';

export class Tier2Error extends Error {
  readonly status: number;
  /** `'customization-rejected'` when the server's verification phase refused the custom prompt (#411). */
  readonly code: string | undefined;
  /** The verifier's own explanation for that rejection — absent when it gave none. */
  readonly reason: string | undefined;

  constructor(message: string, status: number, code?: string, reason?: string) {
    super(message);
    this.name = 'Tier2Error';
    this.status = status;
    this.code = code;
    this.reason = reason;
  }
}

async function errorFrom(response: Response): Promise<Tier2Error> {
  try {
    const body = (await response.json()) as { error?: unknown; code?: unknown; reason?: unknown };
    if (typeof body.error === 'string') {
      return new Tier2Error(
        body.error,
        response.status,
        typeof body.code === 'string' ? body.code : undefined,
        typeof body.reason === 'string' ? body.reason : undefined,
      );
    }
  } catch {
    /* fall through to the generic message below */
  }
  return new Tier2Error(`Request failed with status ${String(response.status)}`, response.status);
}

/** Hand-mirrors `server/interpretation/llm-client.ts`'s `Tier2Section` — no shared schema library between client and server. */
export interface Tier2Section {
  readonly heading: string;
  readonly body: string;
}

/**
 * Hand-mirrors `server/interpretation-routes.ts`'s `chartData` validation
 * shape for freeform mode. Deliberately a subset of `ChartData` — only
 * `positions`/`houses`/`aspects`, not `dignities`/`sect`/`partOfFortune`/
 * `partOfSpirit`, which freeform mode doesn't send.
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

/** Flattens a computed `ChartData` into freeform mode's wire payload. */
export function toTier2ChartPayload(chart: ChartData): Tier2ChartDataPayload {
  return {
    positions: chart.positions.map((position) => ({ body: position.body, longitude: position.longitude })),
    houses: {
      cusps: chart.houses.cusps,
      ascendant: chart.houses.ascendant,
      midheaven: chart.houses.midheaven,
    },
    aspects: chart.aspects.map((aspect) => ({
      bodyA: aspect.bodyA,
      bodyB: aspect.bodyB,
      aspectKey: aspect.aspect.key,
      separation: aspect.separation,
      orb: aspect.orb,
    })),
  };
}

/** One side of `Tier2RelationshipDataPayload` — `Tier2ChartDataPayload` without the `aspects`, which the relationship payload carries once, cross-chart, instead of per side. */
export interface Tier2PositionsHousesPayload {
  readonly positions: readonly { readonly body: number; readonly longitude: number }[];
  readonly houses: { readonly cusps: readonly number[]; readonly ascendant: number; readonly midheaven: number };
}

/** Hand-mirrors `server/interpretation-routes.ts`'s `relationshipData` validation shape (#422). */
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

function toPositionsHouses(chart: ChartData): Tier2PositionsHousesPayload {
  return {
    positions: chart.positions.map((position) => ({ body: position.body, longitude: position.longitude })),
    houses: { cusps: chart.houses.cusps, ascendant: chart.houses.ascendant, midheaven: chart.houses.midheaven },
  };
}

/** Flattens a computed `SynastryData` plus its house overlays into relationship mode's wire payload (#422). */
export function toTier2RelationshipPayload(
  data: SynastryData,
  overlays: readonly { readonly bodyKey: string; readonly house: number; readonly direction: 'a-in-b' | 'b-in-a' }[],
): Tier2RelationshipDataPayload {
  return {
    chartA: toPositionsHouses(data.chartA),
    chartB: toPositionsHouses(data.chartB),
    crossAspects: data.aspects.map((aspect) => ({
      bodyA: aspect.bodyA,
      bodyB: aspect.bodyB,
      aspectKey: aspect.aspect.key,
      separation: aspect.separation,
      orb: aspect.orb,
    })),
    houseOverlays: overlays.map((overlay) => ({
      body: bodyByKey(overlay.bodyKey)?.id ?? -1,
      house: overlay.house,
      direction: overlay.direction,
    })),
  };
}

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
      /**
       * What kind of chart `chartData` is (#454); absent means `'natal'`. A composite chart's
       * data is a two-person midpoint synthesis, not an individual's own placements — without
       * this, the model has no way to know it isn't reading an ordinary natal chart.
       */
      readonly chartKind?: 'natal' | 'composite';
      /** Optional: without one the model writes a balanced reading of the whole chart (#425). */
      readonly customPrompt?: string;
      readonly locale: Locale;
    }
  | {
      /** The tensions of one selected placement (#424): a fixed task, so no instruction. */
      readonly mode: 'focus';
      readonly focusContext: FocusContext;
      readonly locale: Locale;
    }
  | {
      /** A synastry reading from both charts (#422): no name, date, time or place of either person. */
      readonly mode: 'relationship';
      readonly relationshipData: Tier2RelationshipDataPayload;
      /** Optional, same as freeform's own (#425). */
      readonly customPrompt?: string;
      readonly locale: Locale;
    };

/** Generates one Tier-2, AI-customized interpretation for the given request. */
export async function generateTier2Interpretation(request: Tier2Request): Promise<readonly Tier2Section[]> {
  const response = await fetch('/api/interpretation/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await errorFrom(response);
  const { sections } = (await response.json()) as { sections: readonly Tier2Section[] };
  return sections;
}

/** One past generation's metadata — never its text; see `listSavedInterpretations`/`getSavedInterpretation` (#392). */
export interface SavedInterpretationSummary {
  readonly id: string;
  readonly mode: string;
  readonly locale: Locale;
  readonly createdAt: string;
  /** The model's short label for the request (#423); `null` for older entries or when none was kept. */
  readonly description: string | null;
  /** Which kind of interpretation it is (#423); `null` only for a mode this client does not know. */
  readonly kind: ResultKind | null;
  /** What it was based on; `null` for entries saved before that was recorded. */
  readonly basis: ResultBasis | null;
}

export interface SavedInterpretationDetail extends SavedInterpretationSummary {
  readonly sections: readonly Tier2Section[];
}

/** This user's own past generations, newest first — empty (not an error) when the server has no `ASTRAYA_ENCRYPTION_KEY` configured, same as `generateTier2Interpretation` never fails just because saving was skipped. */
export async function listSavedInterpretations(): Promise<readonly SavedInterpretationSummary[]> {
  const response = await fetch('/api/interpretation/results');
  if (!response.ok) throw await errorFrom(response);
  const { results } = (await response.json()) as { results: readonly SavedInterpretationSummary[] };
  return results;
}

/** Reopens one past generation by id, without calling the model again. */
export async function getSavedInterpretation(id: string): Promise<SavedInterpretationDetail> {
  const response = await fetch(`/api/interpretation/results/${encodeURIComponent(id)}`);
  if (!response.ok) throw await errorFrom(response);
  return (await response.json()) as SavedInterpretationDetail;
}
