/**
 * The interpretation corpus as the wheel's selection panel loads it (#415): fetched on first use and
 * kept per language, so later clicks show their text at once.
 */
import { loadRuntimeCorpus } from '../interpretation/corpus-client.js';
import type { CorpusEntry, Locale } from '../interpretation/schema.js';

const cache = new Map<string, Promise<readonly CorpusEntry[]>>();

export function wheelCorpus(locale: Locale): Promise<readonly CorpusEntry[]> {
  const key = locale;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const loading = loadRuntimeCorpus(locale);
  cache.set(key, loading);
  // A failed load must not be remembered, or a flaky network would break the panel until a reload.
  loading.catch(() => cache.delete(key));
  return loading;
}

/** Forgets every loaded corpus. For tests, which swap the network under the same module. */
export function resetWheelCorpusCache(): void {
  cache.clear();
}
