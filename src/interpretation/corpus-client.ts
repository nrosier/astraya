/**
 * Runtime corpus loading for the browser, as a small counterpart to
 * `index.ts`'s synchronous `CORPUS` export.
 *
 * `index.ts` statically imports the full committed corpus (both locales)
 * so the interpretation test suite and `loadCorpus`'s en/nl parity check
 * can validate it — that must stay a synchronous, whole-corpus value for
 * those to work. But a browser client only ever needs one locale's text,
 * and Vite inlines whatever `index.ts` imports into the JS bundle regardless —
 * so `ReportView.tsx` fetches a chunk through this module instead of
 * importing `CORPUS` at all.
 *
 * The chunks this fetches are written by scripts/split-corpus.mjs into
 * public/corpus/<locale>.json — build output, gitignored, generated
 * before `dev`/`build` the same way public/ephe/ is (see that script's own
 * comment). `CORPUS_BASE_URL` mirrors `EPHE_BASE_URL`
 * (src/ephemeris/assets.ts) and `fetchImpl` is injectable for the same
 * reason `warmEphemerisCache` (src/pwa/warm.ts) takes one: testability
 * without a real network.
 *
 * On top of the static chunks, this also fetches any admin corrections
 * (#292) from `GET /api/corpus-overrides/:locale` and layers them in by
 * `key`, replacing the matching static entry. That
 * fetch soft-fails to `[]` on any error — no server (a static, `demo`-mode
 * deploy has none at all), the server unreachable, or any other failure —
 * so a correction is a bonus, never a requirement for the report to render.
 *
 * On top of both, the reader's own corrections (#1338) can be layered in as the top precedence: the reader's own
 * correction beats an approved server-wide override, which beats the committed text. The layer is injected (a map
 * of key to text for that locale), never read from a store here, so this module stays free of the store and every
 * existing caller that passes none behaves as before.
 */
/**
 * @module interpretation/corpus-client
 * @purpose Loads one locale's committed interpretation corpus chunk at runtime in the browser, layered with any admin corpus overrides and, when given, the reader's own corrections.
 * @conventions Fetches a build-generated per-locale chunk from `${BASE_URL}corpus/<locale>.json` (written by scripts/split-corpus.mjs) rather than importing the full corpus like index.ts does. Admin overrides come from `GET /api/corpus-overrides/:locale` and replace same-key entries; that fetch soft-fails to `[]` on any error so a correction is never required for a report to render. The optional user layer (#1338) is the top precedence and replaces only the text of an entry that exists.
 * @exports CORPUS_BASE_URL, UserCorpusLayer, applyUserCorrections, loadRuntimeCorpus
 */
import type { CorpusEntry, Locale } from './schema.js';

export const CORPUS_BASE_URL = `${import.meta.env.BASE_URL}corpus/`;

async function fetchChunk(locale: Locale, fetchImpl: typeof fetch): Promise<readonly CorpusEntry[]> {
  const url = `${CORPUS_BASE_URL}${locale}.json`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to load the interpretation corpus: ${locale}.json (HTTP ${String(response.status)})`);
  }
  return (await response.json()) as readonly CorpusEntry[];
}

async function fetchOverrides(locale: Locale, fetchImpl: typeof fetch): Promise<readonly CorpusEntry[]> {
  try {
    const response = await fetchImpl(`/api/corpus-overrides/${locale}`);
    if (!response.ok) return [];
    const { entries } = (await response.json()) as { entries: readonly CorpusEntry[] };
    return entries;
  } catch {
    return [];
  }
}

/** The reader's own corrections for one locale: corpus key to corrected text (#1338). */
export type UserCorpusLayer = ReadonlyMap<string, string>;

/**
 * The entries with the reader's own corrections laid over them: an entry whose key has a correction keeps everything
 * but its text. A correction for a key with no entry is ignored (there is no entry to correct). With no layer, or an
 * empty one, the entries are returned unchanged.
 */
export function applyUserCorrections(
  entries: readonly CorpusEntry[],
  layer: UserCorpusLayer | undefined,
): readonly CorpusEntry[] {
  if (layer === undefined || layer.size === 0) return entries;
  return entries.map((entry) => {
    const text = layer.get(entry.key);
    return text === undefined ? entry : { ...entry, text };
  });
}

/**
 * The corpus a report for `locale` needs: that locale's committed text, with any admin overrides for
 * it replacing the entry of the same key, and then the reader's own corrections (`userLayer`) on top.
 */
export async function loadRuntimeCorpus(
  locale: Locale,
  fetchImpl: typeof fetch = fetch,
  userLayer?: UserCorpusLayer,
): Promise<readonly CorpusEntry[]> {
  const [base, overrides] = await Promise.all([fetchChunk(locale, fetchImpl), fetchOverrides(locale, fetchImpl)]);
  if (overrides.length === 0) return applyUserCorrections(base, userLayer);

  const overriddenKeys = new Set(overrides.map((entry) => entry.key));
  return applyUserCorrections([...base.filter((entry) => !overriddenKeys.has(entry.key)), ...overrides], userLayer);
}
