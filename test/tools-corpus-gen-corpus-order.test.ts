/**
 * Regression coverage for `tools/corpus-gen/lib/corpus-order.mjs`, which keeps
 * `src/interpretation/corpus/en.json` and `nl.json` in the same entry order as each other.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
// @ts-expect-error -- plain .mjs, no type declarations; cast to a known shape below.
import { naturalKeyOrder as naturalKeyOrderUntyped } from '../tools/corpus-gen/lib/corpus-order.mjs';
// @ts-expect-error -- plain .mjs, no type declarations; cast to a known shape below.
import { sortCorpusEntries as sortCorpusEntriesUntyped } from '../tools/corpus-gen/lib/corpus-order.mjs';
// @ts-expect-error -- plain .mjs, no type declarations; cast to a known shape below.
import { reconcileCorpusOrder as reconcileCorpusOrderUntyped } from '../tools/corpus-gen/lib/corpus-order.mjs';

interface CorpusEntry {
  readonly key: string;
  readonly locale: string;
  readonly text: string;
}

const naturalKeyOrder = naturalKeyOrderUntyped as (a: string, b: string) => number;
const sortCorpusEntries = sortCorpusEntriesUntyped as (entries: readonly CorpusEntry[]) => CorpusEntry[];
const reconcileCorpusOrder = reconcileCorpusOrderUntyped as (
  root: string,
  locales?: readonly string[],
) => Promise<{ touched: string[] }>;

describe('naturalKeyOrder', () => {
  test('sorts digit runs numerically, not lexically', () => {
    const keys = ['planet-in-sign:mars:10', 'planet-in-sign:mars:2', 'planet-in-sign:mars:1'];
    expect([...keys].sort(naturalKeyOrder)).toEqual([
      'planet-in-sign:mars:1',
      'planet-in-sign:mars:2',
      'planet-in-sign:mars:10',
    ]);
  });

  test('sorts categories alphabetically ahead of any numeric suffix', () => {
    const keys = ['sign-on-cusp:1', 'aspect-pair:trine:sun:moon', 'astro-line:asc'];
    expect([...keys].sort(naturalKeyOrder)).toEqual(['aspect-pair:trine:sun:moon', 'astro-line:asc', 'sign-on-cusp:1']);
  });

  test('a shorter key sorts before a longer key sharing its prefix', () => {
    expect(naturalKeyOrder('planet-in-sign:sun', 'planet-in-sign:sun:0')).toBeLessThan(0);
  });
});

describe('sortCorpusEntries', () => {
  test('reorders entries by key, leaving the objects themselves untouched', () => {
    const entryTen = { key: 'planet-in-sign:mars:10', locale: 'en', text: 'ten' };
    const entryTwo = { key: 'planet-in-sign:mars:2', locale: 'en', text: 'two' };
    const sorted = sortCorpusEntries([entryTen, entryTwo]);
    expect(sorted).toEqual([entryTwo, entryTen]);
    expect(sorted[0]).toBe(entryTwo);
  });
});

describe('reconcileCorpusOrder', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'astraya-corpus-order-'));
    mkdirSync(join(root, 'src', 'interpretation', 'corpus'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function write(locale: string, entries: readonly CorpusEntry[]): Promise<void> {
    await writeFile(
      join(root, 'src', 'interpretation', 'corpus', `${locale}.json`),
      JSON.stringify(entries, null, 2) + '\n',
      'utf8',
    );
  }

  async function read(locale: string): Promise<CorpusEntry[]> {
    const raw = await readFile(join(root, 'src', 'interpretation', 'corpus', `${locale}.json`), 'utf8');
    return JSON.parse(raw) as CorpusEntry[];
  }

  const entryOne = { key: 'planet-in-sign:mars:1', locale: 'en', text: 'one' };
  const entryTwo = { key: 'planet-in-sign:mars:2', locale: 'en', text: 'two' };
  const entryTen = { key: 'planet-in-sign:mars:10', locale: 'en', text: 'ten' };

  test('reorders a locale whose on-disk order drifted from the canonical one', async () => {
    await write('en', [entryOne, entryTwo, entryTen]);
    await write('nl', [entryTen, entryOne, entryTwo]);

    const { touched } = await reconcileCorpusOrder(root);

    expect(touched).toEqual(['nl']);
    expect((await read('en')).map((e) => e.key)).toEqual((await read('nl')).map((e) => e.key));
  });

  test('is a no-op when both locales already match the canonical order', async () => {
    await write('en', [entryOne, entryTwo, entryTen]);
    await write('nl', [entryOne, entryTwo, entryTen]);
    const beforeEn = await readFile(join(root, 'src', 'interpretation', 'corpus', 'en.json'), 'utf8');
    const beforeNl = await readFile(join(root, 'src', 'interpretation', 'corpus', 'nl.json'), 'utf8');

    const { touched } = await reconcileCorpusOrder(root);

    expect(touched).toEqual([]);
    expect(await readFile(join(root, 'src', 'interpretation', 'corpus', 'en.json'), 'utf8')).toBe(beforeEn);
    expect(await readFile(join(root, 'src', 'interpretation', 'corpus', 'nl.json'), 'utf8')).toBe(beforeNl);
  });

  test('throws rather than reorder when the two locales have different key sets', async () => {
    await write('en', [entryOne, entryTwo]);
    await write('nl', [entryOne]);

    await expect(reconcileCorpusOrder(root)).rejects.toThrow(/different key sets/);
  });
});
