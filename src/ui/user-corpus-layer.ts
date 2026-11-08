/**
 * The reader's own interpretation corrections (#1338) as the layer the corpus loaders take.
 */
/**
 * @module ui/user-corpus-layer
 * @purpose Turns the store's folded corrections into the per-locale key-to-text layer `loadRuntimeCorpus` and `wheelCorpus` accept, and exposes it as a hook that changes identity only when a correction changes.
 * @conventions Outside a store (or before it opens) the layer is `undefined`, which every loader reads as no corrections; the map is rebuilt only when the fold's `corrections` map or the locale changes, so effects that depend on it re-run exactly when a correction is saved or reset.
 * @exports userCorpusLayer, useUserCorpusLayer
 */
import { useMemo, useSyncExternalStore } from 'react';
import type { UserCorpusLayer } from '../interpretation/corpus-client.js';
import type { Locale } from '../interpretation/schema.js';
import type { CorpusCorrection } from '../store/corpus-corrections.js';
import { useOptionalStore } from './store-context.js';

/** The key-to-text layer of one locale from the folded corrections. */
export function userCorpusLayer(corrections: ReadonlyMap<string, CorpusCorrection>, locale: Locale): UserCorpusLayer {
  const layer = new Map<string, string>();
  for (const correction of corrections.values()) {
    if (correction.locale === locale) layer.set(correction.key, correction.text);
  }
  return layer;
}

const NO_CORRECTIONS: ReadonlyMap<string, CorpusCorrection> = new Map();

/** The reader's corrections for `locale`, or `undefined` when no store is open. */
export function useUserCorpusLayer(locale: Locale): UserCorpusLayer | undefined {
  const store = useOptionalStore();
  const corrections = useSyncExternalStore(
    (onChange) => (store === undefined ? () => undefined : store.subscribe(onChange)),
    () => store?.state.corrections ?? NO_CORRECTIONS,
  );
  return useMemo(
    () => (store === undefined ? undefined : userCorpusLayer(corrections, locale)),
    [store, corrections, locale],
  );
}
