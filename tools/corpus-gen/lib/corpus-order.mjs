/**
 * @module corpus-order
 * @purpose Keeps `src/interpretation/corpus/en.json` and `nl.json` in the same entry order as
 *   each other. The two files share exactly the same key set, but several tools write them
 *   independently per locale (`generate-batch.mjs`'s per-locale appends, `improve-corpus-batch.mjs`'s
 *   per-locale batches, `cross-translate-composite.mjs`'s one-off rewrites), and nothing previously
 *   stopped the two files from drifting out of sync with each other over many runs — annoying for
 *   diffing the two side by side, which is why they're sorted into a shared canonical order (#517
 *   follow-up).
 * @conventions `naturalKeyOrder` is the single canonical ordering: compares each key by splitting on
 *   digit runs and comparing those numerically rather than lexically, so `:2` sorts before `:10`
 *   (plain string sort would not). `reconcileCorpusOrder()` is a full-file rewrite (reformats every
 *   entry via Prettier, same as a fresh `JSON.stringify`) — only call it once a tool has finished its
 *   own writes for this run, never mid-incremental-write, since it does not preserve
 *   `write-corpus.mjs`'s "only touched entries change bytes" guarantee. It is a no-op (no file
 *   touched) when a locale's on-disk order already matches the canonical one, so calling it after
 *   every run costs nothing when there is nothing to fix.
 * @exports naturalKeyOrder, sortCorpusEntries, reconcileCorpusOrder
 */
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as prettier from 'prettier';

/** Splits a corpus key into alternating non-digit/digit chunks, e.g. `"a:2"` → `["a:", "2"]`. */
function tokenize(key) {
  return key.split(/(\d+)/).filter((chunk) => chunk !== '');
}

/**
 * Comparator for corpus keys: digit runs compare numerically, everything else compares as a
 * string, token by token. A shorter key sorts before a longer key that starts the same way.
 */
export function naturalKeyOrder(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  const len = Math.max(ta.length, tb.length);
  for (let i = 0; i < len; i += 1) {
    const x = ta[i];
    const y = tb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xIsDigits = /^\d+$/.test(x);
    const yIsDigits = /^\d+$/.test(y);
    if (xIsDigits && yIsDigits) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** Returns a new array of corpus entries sorted into the canonical key order. */
export function sortCorpusEntries(entries) {
  return [...entries].sort((entryA, entryB) => naturalKeyOrder(entryA.key, entryB.key));
}

async function writeFileAtomic(path, content) {
  const tmpPath = `${path}.tmp-${String(process.pid)}-${Math.random().toString(36).slice(2)}`;
  await writeFile(tmpPath, content, 'utf8');
  await rename(tmpPath, path);
}

/**
 * Reads both locale corpus files fresh from disk and rewrites whichever one(s) are not already in
 * the shared canonical key order. Throws if the two files don't actually have the same key set
 * (that's a real bug elsewhere — a dropped or duplicated key — not something a reorder can fix).
 */
export async function reconcileCorpusOrder(root, locales = ['en', 'nl']) {
  const paths = new Map(
    locales.map((locale) => [locale, join(root, 'src', 'interpretation', 'corpus', `${locale}.json`)]),
  );
  const corpora = new Map(
    await Promise.all([...paths].map(async ([locale, path]) => [locale, JSON.parse(await readFile(path, 'utf8'))])),
  );

  const keySets = new Map([...corpora].map(([locale, entries]) => [locale, new Set(entries.map((e) => e.key))]));
  const [firstLocale, firstKeys] = [...keySets][0];
  for (const [locale, keys] of keySets) {
    if (keys.size !== firstKeys.size || [...keys].some((key) => !firstKeys.has(key))) {
      throw new Error(
        `reconcileCorpusOrder: "${locale}" and "${firstLocale}" have different key sets — not a reorderable drift, fix the actual mismatch first`,
      );
    }
  }

  const touched = [];
  for (const [locale, entries] of corpora) {
    const sorted = sortCorpusEntries(entries);
    const alreadySorted = sorted.every((entry, i) => entry === entries[i]);
    if (alreadySorted) continue;
    const path = paths.get(locale);
    const formatted = await prettier.format(JSON.stringify(sorted), { filepath: path });
    await writeFileAtomic(path, formatted);
    touched.push(locale);
  }
  return { touched };
}
