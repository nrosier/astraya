/**
 * @module corpus
 * @purpose Loads the full committed interpretation corpus (about 11 MB of JSON across both locales) on first use instead of at server boot (#1367).
 * @conventions The only server code that reaches `src/interpretation/index.ts`; it does so through a dynamic `import()` whose promise is memoised, so the JSON is parsed once per process and a deployment that never needs it (Tier 2 disabled) never pays for it. A failed load is not cached, so a later request retries.
 * @exports getCorpus, isCorpusLoaded
 */
import type { CorpusEntry } from '../../src/interpretation/schema.ts';

let pending: Promise<readonly CorpusEntry[]> | undefined;
let loaded = false;

/** The whole corpus, loaded on the first call and shared by every later one. */
export function getCorpus(): Promise<readonly CorpusEntry[]> {
  pending ??= import('../../src/interpretation/index.ts').then(
    (module) => {
      loaded = true;
      return module.CORPUS;
    },
    (error: unknown) => {
      pending = undefined;
      throw error;
    },
  );
  return pending;
}

/** Whether `getCorpus` has finished loading (for tests and diagnostics). */
export function isCorpusLoaded(): boolean {
  return loaded;
}
