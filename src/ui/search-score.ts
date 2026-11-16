/**
 * @module search-score
 * @purpose Pure scorer for the command palette (#1654): ranks search entries against a typed query.
 * @conventions Every query token must match at least one field of an entry. A token scores the best
 *   single field it matches: title prefix 100, title substring 60, keyword prefix 40, breadcrumb or
 *   description substring 20. An entry's score is the sum over tokens. Matching ignores case and
 *   diacritics (NFD, combining marks removed). Equal scores keep the order of the input entries
 *   (registry order). An empty or blank query scores nothing. No search library.
 * @exports SearchableEntry, ScoredEntry, scoreEntries, normaliseSearchText
 */

/** The fields the scorer reads. Richer index entries satisfy this structurally. */
export interface SearchableEntry {
  readonly title: string;
  readonly breadcrumb: string;
  readonly keywords: readonly string[];
  readonly description: string;
}

/** An entry with its score for the current query. */
export interface ScoredEntry<T extends SearchableEntry> {
  readonly entry: T;
  readonly score: number;
}

const TITLE_PREFIX = 100;
const TITLE_SUBSTRING = 60;
const KEYWORD_PREFIX = 40;
const CONTEXT_SUBSTRING = 20;

/**
 * Lower-case, diacritic-free form used for every comparison.
 * @param text - Raw text from a query or an index entry.
 * @returns The text in NFD with combining marks removed and lower-cased.
 */
export function normaliseSearchText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Best score one query token earns against one entry, or 0 when no field matches.
 * @param token - A normalised, non-empty query token.
 * @param fields - The normalised entry fields.
 * @returns The highest weight among the matching fields.
 */
function tokenScore(
  token: string,
  fields: { title: string; keywords: readonly string[]; context: readonly string[] },
): number {
  if (fields.title.startsWith(token)) return TITLE_PREFIX;
  if (fields.title.includes(token)) return TITLE_SUBSTRING;
  if (fields.keywords.some((keyword) => keyword.startsWith(token))) return KEYWORD_PREFIX;
  if (fields.context.some((text) => text.includes(token))) return CONTEXT_SUBSTRING;
  return 0;
}

/**
 * Scores entries against a query and returns the matches, best first.
 * @param query - What the user typed; split on whitespace into tokens.
 * @param entries - Entries in registry order; that order breaks ties.
 * @returns Only the entries where every token matches, sorted by descending score.
 */
export function scoreEntries<T extends SearchableEntry>(
  query: string,
  entries: readonly T[],
): readonly ScoredEntry<T>[] {
  const tokens = normaliseSearchText(query)
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return [];

  const scored: { index: number; result: ScoredEntry<T> }[] = [];
  entries.forEach((entry, index) => {
    const fields = {
      title: normaliseSearchText(entry.title),
      keywords: entry.keywords.map(normaliseSearchText),
      context: [normaliseSearchText(entry.breadcrumb), normaliseSearchText(entry.description)],
    };
    let total = 0;
    for (const token of tokens) {
      const best = tokenScore(token, fields);
      if (best === 0) return;
      total += best;
    }
    scored.push({ index, result: { entry, score: total } });
  });

  scored.sort((a, b) => b.result.score - a.result.score || a.index - b.index);
  return scored.map((item) => item.result);
}
