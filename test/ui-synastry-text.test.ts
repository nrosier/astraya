/**
 * The interpretation text of a Synastry row (#422), against the shipped corpus and a real
 * synastry. The corpus stores each body pair once in alphabetical key order, written from the first
 * body's owner, so what must hold is: every ordered pair of different bodies finds its entry, the
 * side the text speaks from is the owner of the alphabetically-first body, and a body paired with
 * itself (no entry) falls back to the mechanical sentence.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { computeSynastry, type SynastryData } from '../src/domain/synastry.js';
import { crossAspectRows } from '../src/domain/chart-tables.js';
import type { CorpusEntry, Locale } from '../src/interpretation/schema.js';
import { synastryText } from '../src/ui/synastry-text.js';
import { getEngine } from './engine-harness.js';

/**
 * The committed corpus source. `public/corpus/` is generated (`npm run corpus:split`) and gitignored, so a
 * checkout, or CI before the split, may not have it, or may hold an older one: the source is what is shipped.
 */
const corpusOf = (locale: Locale): readonly CorpusEntry[] =>
  JSON.parse(readFileSync(`src/interpretation/corpus/${locale}.json`, 'utf8')) as CorpusEntry[];

const EN = corpusOf('en');
const NL = corpusOf('nl');
const entryText = (corpus: readonly CorpusEntry[], key: string): string | undefined =>
  corpus.find((entry) => entry.key === key)?.text;
/** The variants of one point a chart carries only one of. */
const VARIANT_FAMILIES: Record<string, string> = {
  meanLilith: 'lilith',
  osculatingLilith: 'lilith',
  interpolatedLilith: 'lilith',
  meanNode: 'node',
  trueNode: 'node',
};
const isVariant = (key: string): boolean => key in VARIANT_FAMILIES;
const family = (key: string): string | undefined => VARIANT_FAMILIES[key];
const row = (aspectKey: string, bodyAKey: string, bodyBKey: string) => ({ aspectKey, bodyAKey, bodyBKey });

let synastry: SynastryData;

beforeAll(async () => {
  const engine = await getEngine();
  synastry = await computeSynastry(
    {
      civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      coordinates: { latitude: 41.1833, longitude: -84.7333 },
      zoneOverride: 'America/New_York',
    },
    {
      civil: { year: 1985, month: 7, day: 23, hour: 12, minute: 0, second: 0 },
      coordinates: { latitude: 51.5072, longitude: -0.1276 },
      zoneOverride: 'Europe/London',
    },
    engine,
  );
}, 60_000);

describe('synastryText (#422)', () => {
  it('the shipped corpus has synastry entries for every aspect and every pair, in alphabetical key order only', () => {
    const keys = EN.filter((entry) => entry.key.startsWith('synastry-aspect:')).map((entry) => entry.key);
    expect(keys.length).toBeGreaterThan(2000);
    expect(keys.every((key) => (key.split(':')[2] ?? '') < (key.split(':')[3] ?? ''))).toBe(true);
  });

  it('a row already in corpus order speaks from person A, with the entry’s own text', () => {
    const result = synastryText(row('square', 'mars', 'moon'), 'en', EN);
    expect(result.speaksFrom).toBe('a');
    expect(result.text).toBe(entryText(EN, 'synastry-aspect:square:mars:moon'));
  });

  it('the same pair the other way round finds the same entry but speaks from the partner', () => {
    const result = synastryText(row('square', 'moon', 'mars'), 'en', EN);
    expect(result.speaksFrom).toBe('b');
    expect(result.text).toBe(entryText(EN, 'synastry-aspect:square:mars:moon'));
  });

  it('a body paired with itself has no entry and keeps the mechanical sentence', () => {
    const result = synastryText(row('conjunction', 'venus', 'venus'), 'en', EN);
    expect(result.speaksFrom).toBeUndefined();
    expect(result.text.length).toBeGreaterThan(0);
    expect(EN.some((entry) => entry.key === 'synastry-aspect:conjunction:venus:venus')).toBe(false);
  });

  it('with no corpus loaded yet, every row still has a sentence', () => {
    const result = synastryText(row('trine', 'sun', 'venus'), 'en', []);
    expect(result.speaksFrom).toBeUndefined();
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('every ordered pair of different bodies, for every aspect, resolves from the corpus in both languages', () => {
    const bodies = [
      ...new Set(EN.filter((e) => e.key.startsWith('synastry-aspect:')).flatMap((e) => e.key.split(':').slice(2))),
    ];
    const aspects = [
      ...new Set(EN.filter((e) => e.key.startsWith('synastry-aspect:')).map((e) => e.key.split(':')[1] ?? '')),
    ];
    expect(bodies.length).toBe(20);
    expect(aspects.length).toBe(11);
    for (const corpus of [EN, NL]) {
      const locale = corpus === EN ? 'en' : 'nl';
      let resolved = 0;
      for (const aspect of aspects) {
        for (const a of bodies) {
          for (const b of bodies) {
            // Two models of the same point (Lilith's three, the two nodes) never occur in one chart, so
            // the corpus has no entry for such a pair and none is looked up.
            if (a === b || (isVariant(a) && isVariant(b) && family(a) === family(b))) continue;
            const result = synastryText(row(aspect, a, b), locale, corpus);
            expect(result.speaksFrom).toBe(a < b ? 'a' : 'b');
            resolved++;
          }
        }
      }
      // Every ordered pair of different bodies, less the 8 ordered pairs of variants of one point.
      expect(resolved).toBe(11 * (20 * 19 - 8));
    }
  });

  it('on a real synastry, different-body rows come from the corpus and same-body rows fall back', () => {
    const rows = crossAspectRows(synastry.aspects);
    expect(rows.length).toBeGreaterThan(10);
    let sameBody = 0;
    let differentBody = 0;
    for (const r of rows) {
      const result = synastryText(r, 'en', EN);
      if (r.bodyAKey === r.bodyBKey) {
        sameBody++;
        expect(result.speaksFrom).toBeUndefined();
      } else {
        differentBody++;
        const [first, second] = [r.bodyAKey, r.bodyBKey].sort();
        expect(result.text).toBe(entryText(EN, `synastry-aspect:${r.aspectKey}:${first ?? ''}:${second ?? ''}`));
        expect(result.speaksFrom).toBe(r.bodyAKey < r.bodyBKey ? 'a' : 'b');
      }
    }
    expect(differentBody).toBeGreaterThan(0);
    // The fixture exercises both paths: the corpus and the same-body fallback.
    expect(sameBody).toBeGreaterThan(0);
  });

  it('answers in Dutch from the Dutch corpus', () => {
    const result = synastryText(row('square', 'mars', 'moon'), 'nl', NL);
    expect(result.text).toBe(entryText(NL, 'synastry-aspect:square:mars:moon'));
    expect(result.text).not.toBe(entryText(EN, 'synastry-aspect:square:mars:moon'));
  });
});
