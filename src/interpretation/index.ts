/**
 * The corpus, loaded and validated once at module load. Empty today — #55
 * populates `corpus/en.json`/`nl.json` with hand-written exemplars, and #56
 * generates the rest — but the loader's cross-locale and shape checks apply
 * from the first entry onward, not retrofitted once content exists.
 */
/**
 * @module interpretation/index
 * @purpose Statically loads and validates the full committed interpretation corpus (both locales) into a single synchronous export.
 * @conventions Imports the full en/nl corpus JSON directly so loadCorpus's cross-locale parity check and the test suite can validate the whole set synchronously; a browser client should use corpus-client.ts's per-locale chunk fetch instead, to avoid bundling both locales.
 * @exports CORPUS, loadCorpus (plus everything re-exported from schema.ts)
 */
import en from './corpus/en.json' with { type: 'json' };
import nl from './corpus/nl.json' with { type: 'json' };
import { loadCorpus } from './loader.ts';

export const CORPUS = loadCorpus({ en, nl });

export * from './schema.ts';
export { loadCorpus } from './loader.ts';
