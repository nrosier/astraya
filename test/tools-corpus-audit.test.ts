/**
 * The repeatable corpus audit (#427, `tools/corpus-gen/lib/corpus-audit.mjs`), run on the committed
 * corpus so a regeneration that breaks a key, loses en/nl parity or shifts an index fails CI, and on
 * deliberately broken corpora so the audit is known to notice each kind of problem.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs, no type declarations; cast to known shapes below.
import { auditCorpus as auditCorpusUntyped } from '../tools/corpus-gen/lib/corpus-audit.mjs';

interface Entry {
  readonly key: string;
  readonly locale: string;
  readonly text: string;
  readonly [field: string]: unknown;
}
type Corpus = Readonly<Record<string, readonly Entry[]>>;
const auditCorpus = auditCorpusUntyped as (corpus: Corpus) => { failures: string[]; notes: string[] };

const load = (locale: 'en' | 'nl'): Entry[] =>
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, `../src/interpretation/corpus/${locale}.json`), 'utf8'),
  ) as Entry[];
const real: Corpus = { en: load('en'), nl: load('nl') };

describe('the committed corpus passes the audit (#427)', () => {
  it('has no failures: valid canonical keys, no duplicates, en/nl parity, nothing out of scope, no shifted index', () => {
    expect(auditCorpus(real).failures).toEqual([]);
  });
});

describe('the audit notices what it is meant to', () => {
  const rename = (entries: readonly Entry[], from: string, to: string): Entry[] =>
    entries.map((entry) => (entry.key === from ? { ...entry, key: to } : entry));

  it('a key that does not validate', () => {
    const broken = rename(real.en ?? [], 'planet-in-sign:sun:2', 'planet-in-sign:sun:99');
    const { failures } = auditCorpus({ ...real, en: broken });
    expect(failures.some((failure) => failure.includes('planet-in-sign:sun:99'))).toBe(true);
  });

  it('a key that is not in canonical (alphabetical) order', () => {
    const broken = rename(real.en ?? [], 'synastry-aspect:square:mars:moon', 'synastry-aspect:square:moon:mars');
    const { failures } = auditCorpus({ ...real, en: broken });
    expect(failures.some((failure) => failure.includes('synastry-aspect:square:moon:mars'))).toBe(true);
  });

  it('a duplicate key', () => {
    const first = (real.en ?? [])[0];
    if (first === undefined) throw new Error('fixture bug: empty corpus');
    const { failures } = auditCorpus({ ...real, en: [...(real.en ?? []), first] });
    expect(failures.some((failure) => failure.includes('duplicate key'))).toBe(true);
  });

  it('English and Dutch not holding the same keys', () => {
    const { failures } = auditCorpus({ ...real, nl: (real.nl ?? []).slice(1) });
    expect(failures.some((failure) => failure.includes('but not in'))).toBe(true);
  });

  it('a placement outside the generator’s scope', () => {
    const extra: Entry = { key: 'planet-in-sign:sun:0', locale: 'en', text: 'x' };
    const stray: Entry = { ...extra, key: 'pattern:bucket' };
    const { failures } = auditCorpus({ ...real, en: [...(real.en ?? []), stray] });
    expect(failures.some((failure) => failure.includes('outside the generator'))).toBe(true);
  });

  it('every sign shifted by one, which the keys alone would never reveal', () => {
    const shifted = (real.en ?? []).map((entry) => {
      const match = /^planet-in-sign:([A-Za-z]+):(\d+)$/.exec(entry.key);
      if (match === null) return entry;
      return { ...entry, key: `planet-in-sign:${match[1] ?? ''}:${String((Number(match[2]) + 1) % 12)}` };
    });
    const { failures } = auditCorpus({ ...real, en: shifted });
    expect(failures.some((failure) => failure.includes('shifted index'))).toBe(true);
  });
});
