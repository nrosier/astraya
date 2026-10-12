/**
 * Corpus dedupe pass (#58): at the corpus's eventual full size — around 1200
 * entries once #56 has generated the long tail on top of #55's exemplars — the
 * failure mode a reader actually hits is not a wrong fact but prose that all
 * sounds the same. Two placements can be substantively different and still
 * read as copy-pasted if a generator (or a tired human) reused the same
 * sentence shape.
 *
 * Similarity is character-trigram Jaccard, not an embedding: it needs no
 * network call and no model, which keeps this pass usable from `src/` — see
 * `test/no-runtime-llm-access.test.ts` (#64) — and deterministic enough to
 * gate CI on. It is also a different signal from #57's `repetitive-openings`
 * rule: that catches entries that only *start* alike; this catches entries
 * that are substantially the same text throughout, wherever in the corpus
 * they fall.
 *
 * Comparison is scoped to entries in the same locale — an `en` entry and its
 * `nl` translation are supposed to say the same thing, so cross-locale
 * similarity would just flag every correctly-translated pair.
 */
/**
 * @module interpretation/dedupe
 * @purpose Flags corpus entries that read as copy-pasted prose, so the ~1200-entry corpus doesn't feel templated even when individual entries are factually distinct.
 * @conventions Similarity is character-trigram Jaccard (not an embedding), kept dependency-free and deterministic so it is importable from src/ and cheap enough to gate CI (trigram sets are packed into bitsets and each pair is dropped as soon as it cannot reach the threshold, which finds exactly the pairs an all-pairs scan would, #520). Comparison is scoped per-locale. Distinct from lint.ts's `repetitive-openings` rule, which only catches shared openings, not whole-text similarity.
 * @exports DuplicatePair, SimilarityReport, DEFAULT_SIMILARITY_THRESHOLD, findNearDuplicates, formatSimilarityReport
 */
import type { CorpusEntry, Locale } from './schema.js';

export interface DuplicatePair {
  readonly keyA: string;
  readonly keyB: string;
  readonly locale: Locale;
  /** Trigram Jaccard similarity, 0 (nothing shared) to 1 (identical trigram sets). */
  readonly similarity: number;
}

export interface SimilarityReport {
  readonly threshold: number;
  readonly pairs: readonly DuplicatePair[];
}

/**
 * Where "reads as copy-pasted" starts, picked as a starting point for #63's
 * review to tighten once there is a real corpus to tune it against — not a
 * fact derived from anything.
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.7;

function trigramsOf(text: string): Set<string> {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  const grams = new Set<string>();
  for (let i = 0; i <= normalized.length - 3; i += 1) {
    grams.add(normalized.slice(i, i + 3));
  }
  return grams;
}

function popcount32(value: number): number {
  let v = value - ((value >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** An entry's trigram set as a bitset over the group's shared vocabulary, with how many of its bits sit in each word onward. */
interface PackedGrams {
  readonly size: number;
  readonly words: Int32Array;
  /** `remaining[w]` is the number of this set's trigrams held in words `w` and later; `remaining[0]` is `size`. */
  readonly remaining: Uint16Array;
}

/** Packs each set into a bitset, putting the most widely shared trigrams in the first words. */
function packGrams(sets: readonly Set<string>[]): readonly PackedGrams[] {
  const frequency = new Map<string, number>();
  for (const grams of sets) {
    for (const gram of grams) frequency.set(gram, (frequency.get(gram) ?? 0) + 1);
  }
  const vocabulary = [...frequency.keys()].sort(
    (left, right) =>
      (frequency.get(right) ?? 0) - (frequency.get(left) ?? 0) || (left < right ? -1 : left > right ? 1 : 0),
  );
  const slot = new Map(vocabulary.map((gram, index) => [gram, index]));
  const wordCount = Math.ceil(vocabulary.length / 32);
  return sets.map((grams) => {
    const words = new Int32Array(wordCount);
    for (const gram of grams) {
      const index = slot.get(gram) ?? 0;
      words[index >>> 5] = (words[index >>> 5] ?? 0) | (1 << (index & 31));
    }
    const remaining = new Uint16Array(wordCount + 1);
    for (let w = wordCount - 1; w >= 0; w -= 1) {
      remaining[w] = (remaining[w + 1] ?? 0) + popcount32(words[w] ?? 0);
    }
    return { size: grams.size, words, remaining };
  });
}

/**
 * How many trigrams `a` and `b` share, or `undefined` once it is certain they cannot reach `threshold`. The shortfall
 * test is deliberately a little generous (never rejects a pair that could still reach the threshold): the caller
 * makes the exact comparison.
 */
function intersectionAtLeast(a: PackedGrams, b: PackedGrams, threshold: number): number | undefined {
  // J = i / (|a| + |b| - i) >= t  <=>  i >= t (|a| + |b|) / (1 + t); the epsilon only ever lowers the bar.
  const needed = threshold > 0 ? Math.floor((threshold * (a.size + b.size)) / (1 + threshold) - 1e-9) : 0;
  let shared = 0;
  const wordCount = a.words.length;
  for (let w = 0; w < wordCount; w += 1) {
    if (shared + Math.min(a.remaining[w] ?? 0, b.remaining[w] ?? 0) < needed) return undefined;
    shared += popcount32((a.words[w] ?? 0) & (b.words[w] ?? 0));
  }
  return shared;
}

/**
 * Flags every pair of entries, within a locale, whose text is at or above
 * `threshold` similar. Each locale is compared on its own, which keeps each
 * compared group to one language's entries rather than both pooled together.
 *
 * Within a group, the scan is quadratic but pruned twice, and neither prune
 * changes the answer (#520). A pair's Jaccard similarity can never exceed the
 * ratio of its smaller trigram set to its larger one (intersection ≤ the
 * smaller set, union ≥ the larger one), so sorting each group by trigram-set
 * size lets the inner loop stop the moment that ratio bound drops below
 * `threshold` — every later (larger) entry would only push the bound lower
 * still. And the trigram sets are packed into bitsets, most widely shared
 * trigrams first, so a pair's intersection is counted a word at a time and
 * dropped as soon as the trigrams it has left to find, taken from whichever
 * set has fewer of them, cannot make up the shortfall to the intersection
 * `threshold` needs. The corpus text shares most of its vocabulary, which is
 * why indexing by rare trigrams does not prune it, but pairs far below the
 * threshold still fall short within a few words.
 */
export function findNearDuplicates(
  entries: readonly CorpusEntry[],
  threshold = DEFAULT_SIMILARITY_THRESHOLD,
): SimilarityReport {
  const byGroup = new Map<string, { locale: Locale; group: CorpusEntry[] }>();
  for (const entry of entries) {
    const groupKey = entry.locale;
    const existing = byGroup.get(groupKey);
    if (existing) {
      existing.group.push(entry);
    } else {
      byGroup.set(groupKey, { locale: entry.locale, group: [entry] });
    }
  }

  const pairs: DuplicatePair[] = [];
  for (const { locale, group } of byGroup.values()) {
    const items = group
      .map((entry) => ({ entry, grams: trigramsOf(entry.text) }))
      .sort((a, b) => a.grams.size - b.grams.size);
    const packed = packGrams(items.map((item) => item.grams));
    for (let i = 0; i < items.length; i += 1) {
      const a = items[i];
      const packedA = packed[i];
      if (!a || !packedA) continue;
      for (let j = i + 1; j < items.length; j += 1) {
        const b = items[j];
        const packedB = packed[j];
        if (!b || !packedB) continue;
        if (b.grams.size === 0 || a.grams.size / b.grams.size < threshold) break;
        const intersection = intersectionAtLeast(packedA, packedB, threshold);
        if (intersection === undefined) continue;
        const similarity = intersection / (a.grams.size + b.grams.size - intersection);
        if (similarity >= threshold) {
          // Reported key order is lexicographic, not size-sort order — a pair's
          // identity shouldn't depend on which of its two entries happens to have
          // the smaller trigram set.
          const [keyA, keyB] = a.entry.key <= b.entry.key ? [a.entry.key, b.entry.key] : [b.entry.key, a.entry.key];
          pairs.push({ keyA, keyB, locale, similarity });
        }
      }
    }
  }

  pairs.sort((left, right) => right.similarity - left.similarity);
  return { threshold, pairs };
}

/** Renders a report as plain text — the artefact #58 asks for, independent of how it's produced or stored. */
export function formatSimilarityReport(report: SimilarityReport): string {
  if (report.pairs.length === 0) {
    return `No near-duplicates found at similarity >= ${String(report.threshold)}.`;
  }
  const lines = report.pairs.map(
    (pair) => `${(pair.similarity * 100).toFixed(1)}%  [${pair.locale}]  ${pair.keyA}  <->  ${pair.keyB}`,
  );
  return [
    `${String(report.pairs.length)} near-duplicate pair(s) at similarity >= ${String(report.threshold)}:`,
    ...lines,
  ].join('\n');
}
