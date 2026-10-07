/**
 * What a saved AI interpretation was *based on*, and which *kind* it is (#423).
 *
 * Every generation records a `kind` and a small `basis` beside its text, so the history can say
 * "Entire chart" or "Mars (natal)" rather than only "AI interpretation", and so two entries of
 * different kinds can never be confused. Both come from the request the server has already
 * validated against closed sets (never from the model and never from the reader's free text), which
 * is why they are stored as plain metadata rather than encrypted like the prose and the description.
 *
 * **Adding a new kind of AI interpretation** (a transit forecast, a synastry reading, a composite…):
 * add its id to `RESULT_KINDS`, its basis shape to `ResultBasis`, its case to `parseBasis`, and its
 * wording to `src/ui/result-basis-label.ts` (en and nl). `test/result-basis.test.ts` fails until
 * every kind has a label in both languages, so a new kind cannot ship showing a raw id.
 *
 * This file is imported by the server, so it has no imports and is listed in the Dockerfile.
 */
/**
 * @module interpretation/result-basis
 * @purpose Defines and (de)serializes what a saved AI interpretation was based on and which kind it is, so a saved result's history can describe its origin rather than just say "AI interpretation".
 * @conventions Every generation records a `kind` plus a small `basis`, both derived from the already-validated request (never from the model or free text), so they are stored as plain metadata rather than encrypted like the prose. Adding a new kind requires updating RESULT_KINDS, ResultBasis, parseBasis here, and the label in src/ui/result-basis-label.ts for both locales. Imported by the server, so deliberately has no imports.
 * @exports RESULT_KINDS, ResultKind, ResultBasis, isResultKind, kindForMode, parseBasis
 */

/** The kinds, one per way of asking: the reader's own wording over chosen placements, a whole-chart reading, a single body, a relationship between two charts. */
export const RESULT_KINDS = ['placements', 'whole-chart', 'focus', 'relationship'] as const;
export type ResultKind = (typeof RESULT_KINDS)[number];

export type ResultBasis =
  /** A restyle of chosen interpretation entries (grounded mode): the placement keys it used. */
  | { readonly kind: 'placements'; readonly keys: readonly string[] }
  /** A reading of the whole chart (freeform mode). */
  | { readonly kind: 'whole-chart' }
  /** The tensions of one body: its `BodyDefinition.key` and whose chart it is read from (`transit` = a transit against the natal chart). */
  | { readonly kind: 'focus'; readonly body: string; readonly perspective: 'natal' | 'transit' }
  /** A synastry reading between two people's charts (#422) — naming a side isn't meaningful the way `focus` names one body, so this stays as plain as `whole-chart`. */
  | { readonly kind: 'relationship' };

export function isResultKind(value: unknown): value is ResultKind {
  return typeof value === 'string' && (RESULT_KINDS as readonly string[]).includes(value);
}

/** Entries from before this existed have only a `mode`; this is the kind they were. */
export function kindForMode(mode: string): ResultKind | undefined {
  if (mode === 'grounded') return 'placements';
  if (mode === 'freeform' || mode === 'synthesis') return 'whole-chart';
  if (mode === 'focus') return 'focus';
  if (mode === 'relationship') return 'relationship';
  return undefined;
}

const MAX_BASIS_KEYS = 200;

/** A stored basis read back, or `undefined` when it is absent or not a shape this version knows. */
export function parseBasis(json: string | null): ResultBasis | undefined {
  if (json === null) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  switch (record.kind) {
    case 'whole-chart':
      return { kind: 'whole-chart' };
    case 'placements': {
      const keys = record.keys;
      if (!Array.isArray(keys) || keys.length > MAX_BASIS_KEYS || !keys.every((key) => typeof key === 'string')) {
        return undefined;
      }
      return { kind: 'placements', keys: keys };
    }
    case 'focus': {
      const { body, perspective } = record;
      if (typeof body !== 'string' || (perspective !== 'natal' && perspective !== 'transit')) return undefined;
      return { kind: 'focus', body, perspective };
    }
    case 'relationship':
      return { kind: 'relationship' };
    default:
      return undefined;
  }
}
