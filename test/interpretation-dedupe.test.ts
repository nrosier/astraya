import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  findNearDuplicates,
  formatSimilarityReport,
} from '../src/interpretation/dedupe.js';
import { CORPUS } from '../src/interpretation/index.js';
import type { CorpusEntry, Locale } from '../src/interpretation/schema.js';

function entry(key: string, text: string, overrides: Partial<CorpusEntry> = {}): CorpusEntry {
  return {
    key,
    locale: 'en',
    text,
    tier: 'core',
    tags: [],
    provenance: { source: 'hand-written' },
    ...overrides,
  };
}

const TEXT_A = 'A restless curiosity colours how you show up: quick to notice options, quicker to talk them through.';
const TEXT_B = 'A steady patience colours how you show up: slow to commit, but firm once you finally do.';

describe('findNearDuplicates (#58)', () => {
  it('flags nothing when every entry reads differently', () => {
    const report = findNearDuplicates([entry('a', TEXT_A), entry('b', TEXT_B)]);
    expect(report.pairs).toEqual([]);
  });

  it('flags a pair that repeats the same sentence with only a word or two changed', () => {
    const near = entry(
      'a2',
      'A restless curiosity colours how you show up: quick to notice options, quicker to act on them.',
    );
    const report = findNearDuplicates([entry('a', TEXT_A), near]);
    expect(report.pairs).toHaveLength(1);
    expect(report.pairs[0]).toMatchObject({ keyA: 'a', keyB: 'a2' });
    expect(report.pairs[0]?.similarity).toBeGreaterThanOrEqual(DEFAULT_SIMILARITY_THRESHOLD);
  });

  it('flags an exact repeat at similarity 1', () => {
    const report = findNearDuplicates([entry('a', TEXT_A), entry('a-copy', TEXT_A)]);
    expect(report.pairs).toEqual([{ keyA: 'a', keyB: 'a-copy', locale: 'en', similarity: 1 }]);
  });

  it('never compares an entry across locales', () => {
    // en/nl are meant to say the same thing, so a translated pair sharing high
    // similarity would just be the loader's cross-locale parity check restated —
    // not a signal that the corpus reads as templated.
    const report = findNearDuplicates([entry('a', TEXT_A), entry('a', TEXT_A, { locale: 'nl' })]);
    expect(report.pairs).toEqual([]);
  });

  it('respects a custom threshold', () => {
    const report = findNearDuplicates([entry('a', TEXT_A), entry('b', TEXT_B)], 0.1);
    expect(report.pairs.length).toBeGreaterThan(0);
  });

  it('orders pairs from most to least similar', () => {
    const report = findNearDuplicates(
      [
        entry('a', TEXT_A),
        entry('a-loose', 'A restless curiosity is how you show up here, ready to talk through most options.'),
        entry('a-tight', 'A restless curiosity colours how you show up: quick to notice options, quicker to act.'),
      ],
      0.3,
    );
    const similarities = report.pairs.map((pair) => pair.similarity);
    expect(similarities).toEqual([...similarities].sort((left, right) => right - left));
  });

  it('does not compare an entry against itself', () => {
    const report = findNearDuplicates([entry('a', TEXT_A)]);
    expect(report.pairs).toEqual([]);
  });

  // A full pass over the committed corpus takes around 30 s on its own; the default limit is too tight under a loaded run.
  it('the shipped corpus has no near-duplicates', () => {
    expect(findNearDuplicates(CORPUS).pairs).toEqual([]);
  }, 120_000);
});

/**
 * The all-pairs scan `findNearDuplicates` replaced (#520), kept here as the reference it must agree with exactly.
 * It is the original implementation, unchanged apart from taking the pair test out of the module.
 */
function findNearDuplicatesByEveryPair(entries: readonly CorpusEntry[], threshold: number): readonly object[] {
  const trigrams = (text: string): Set<string> => {
    const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
    const grams = new Set<string>();
    for (let i = 0; i <= normalized.length - 3; i += 1) grams.add(normalized.slice(i, i + 3));
    return grams;
  };
  const jaccard = (a: Set<string>, b: Set<string>): number => {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const gram of a) if (b.has(gram)) intersection += 1;
    return intersection / (a.size + b.size - intersection);
  };
  const byLocale = new Map<Locale, CorpusEntry[]>();
  for (const e of entries) byLocale.set(e.locale, [...(byLocale.get(e.locale) ?? []), e]);
  const pairs: { keyA: string; keyB: string; locale: Locale; similarity: number }[] = [];
  for (const [locale, group] of byLocale) {
    const items = group.map((e) => ({ e, grams: trigrams(e.text) })).sort((x, y) => x.grams.size - y.grams.size);
    for (let i = 0; i < items.length; i += 1) {
      const a = items[i];
      if (!a) continue;
      for (let j = i + 1; j < items.length; j += 1) {
        const b = items[j];
        if (!b) continue;
        if (b.grams.size === 0 || a.grams.size / b.grams.size < threshold) break;
        const similarity = jaccard(a.grams, b.grams);
        if (similarity >= threshold) {
          const [keyA, keyB] = a.e.key <= b.e.key ? [a.e.key, b.e.key] : [b.e.key, a.e.key];
          pairs.push({ keyA, keyB, locale, similarity });
        }
      }
    }
  }
  return pairs.sort((left, right) => right.similarity - left.similarity);
}

describe('findNearDuplicates agrees with comparing every pair (#520)', () => {
  /** A small deterministic generator, so a failure can be reproduced from its seed. */
  function random(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  const WORDS = [
    'restless',
    'steady',
    'curious',
    'quick',
    'patient',
    'bold',
    'calm',
    'you',
    'show',
    'up',
    'with',
    'care',
  ];

  function corpus(seed: number, size: number): CorpusEntry[] {
    const next = random(seed);
    const pick = (n: number): number => Math.floor(next() * n);
    const entries: CorpusEntry[] = [];
    for (let i = 0; i < size; i += 1) {
      const roll = next();
      let text: string;
      if (roll < 0.05) text = '';
      else if (roll < 0.1) text = 'ab';
      else if (roll < 0.25 && entries.length > 0) {
        // A copy of an earlier text, sometimes with one word changed: exact and near repeats.
        const source = entries[pick(entries.length)]?.text ?? '';
        text = next() < 0.5 ? source : source.replace(/\b\w+\b/, WORDS[pick(WORDS.length)] ?? 'x');
      } else {
        text = Array.from({ length: 2 + pick(14) }, () => WORDS[pick(WORDS.length)]).join(' ');
      }
      entries.push(entry(`k${i}`, text, { locale: next() < 0.7 ? 'en' : 'nl' }));
    }
    return entries;
  }

  it.each([0, 0.1, 0.3, 0.5, 0.7, 0.85, 0.95, 1, 1.5])(
    'finds the same pairs, in the same order, at threshold %s',
    (threshold) => {
      for (let seed = 1; seed <= 12; seed += 1) {
        const entries = corpus(seed, 70);
        expect(findNearDuplicates(entries, threshold).pairs, `seed ${seed}`).toEqual(
          findNearDuplicatesByEveryPair(entries, threshold),
        );
      }
    },
  );

  it('finds a pair that sits exactly on the threshold', () => {
    // "abcd" and "abcde": trigram sets of 2 and 3 sharing 2, so exactly 2/3.
    const entries = [entry('a', 'abcd'), entry('b', 'abcde')];
    const exact = 2 / 3;
    expect(findNearDuplicates(entries, exact).pairs).toEqual(findNearDuplicatesByEveryPair(entries, exact));
    expect(findNearDuplicates(entries, exact).pairs).toHaveLength(1);
  });
});

describe('formatSimilarityReport (#58)', () => {
  it('says plainly when nothing was found', () => {
    expect(formatSimilarityReport({ threshold: 0.7, pairs: [] })).toBe(
      'No near-duplicates found at similarity >= 0.7.',
    );
  });

  it('lists every pair with its locale and percentage', () => {
    const text = formatSimilarityReport({
      threshold: 0.7,
      pairs: [{ keyA: 'a', keyB: 'b', locale: 'en', similarity: 0.842 }],
    });
    expect(text).toContain('84.2%');
    expect(text).toContain('[en]');
    expect(text).toContain('a  <->  b');
  });
});
