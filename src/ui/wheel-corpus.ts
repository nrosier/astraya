/**
 * The interpretation corpus as the wheel's selection panel loads it (#415): fetched on first use and
 * kept per language, so later clicks show their text at once. The reader's own corrections (#1338) are laid over the
 * cached text on every call, so saving or resetting a correction shows at once without a second fetch.
 */
/**
 * @module ui/wheel-corpus
 * @purpose Loads and per-language caches the interpretation corpus for the chart wheel's click-to-select panel (#415), so repeat selections render instantly after the first fetch, with the reader's own corrections laid over it.
 * @conventions A failed load is never cached, so a flaky network doesn't permanently break the panel until a reload.
 * @exports wheelCorpus, resetWheelCorpusCache
 */
import { applyUserCorrections, loadRuntimeCorpus, type UserCorpusLayer } from '../interpretation/corpus-client.js';
import type { CorpusEntry, Locale } from '../interpretation/schema.js';

const cache = new Map<string, Promise<readonly CorpusEntry[]>>();

export function wheelCorpus(locale: Locale, userLayer?: UserCorpusLayer): Promise<readonly CorpusEntry[]> {
  const key = locale;
  let loading = cache.get(key);
  if (loading === undefined) {
    const fresh = loadRuntimeCorpus(locale);
    loading = fresh;
    cache.set(key, fresh);
    // A failed load must not be remembered, or a flaky network would break the panel until a reload.
    fresh.catch(() => cache.delete(key));
  }
  // The cache holds the committed text with the approved overrides; the reader's corrections are applied per call,
  // so a save or a reset is seen by the next call and the cache never holds a stale correction.
  return loading.then((entries) => applyUserCorrections(entries, userLayer));
}

/** Forgets every loaded corpus. For tests, which swap the network under the same module. */
export function resetWheelCorpusCache(): void {
  cache.clear();
}
