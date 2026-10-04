/**
 * The plain-language description of a placement that the corpus generator sends the model, and the
 * facts the judge is given (`tools/corpus-gen/lib/placements.mjs`, #427): what the model reads must
 * say what the placement is, never a raw key or an internal value.
 */
import { describe, expect, it } from 'vitest';
import { composeFallbackText } from '../src/interpretation/compose.js';
import type { CorpusPlacement } from '../src/interpretation/schema.js';
// prettier-ignore
// @ts-expect-error -- plain .mjs, no type declarations; cast to known shapes below.
import { placementDescription as placementDescriptionUntyped, factsDescription as factsDescriptionUntyped } from '../tools/corpus-gen/lib/placements.mjs';

const placementDescription = placementDescriptionUntyped as (placement: CorpusPlacement) => string;
const factsDescription = factsDescriptionUntyped as (placement: CorpusPlacement) => string;

describe('what the generator tells the model (#427)', () => {
  it('describes a dignity in words, not "Sun in ruler"', () => {
    for (const describe of [placementDescription, factsDescription]) {
      expect(describe({ category: 'dignity-state', body: 'mars', state: 'ruler' })).toMatch(/rules the sign it is in/);
      expect(describe({ category: 'dignity-state', body: 'mars', state: 'exalted' })).toMatch(/exaltation/);
      expect(describe({ category: 'dignity-state', body: 'venus', state: 'fall' })).toMatch(/in its fall/);
      expect(describe({ category: 'dignity-state', body: 'sun', state: 'detriment' })).toMatch(/detriment/);
      expect(describe({ category: 'dignity-state', body: 'sun', state: 'ruler' })).not.toMatch(/in ruler/);
    }
  });

  it('says whose side a synastry text is written from', () => {
    const text = placementDescription({ category: 'synastry-aspect', aspect: 'square', bodyA: 'mars', bodyB: 'moon' });
    expect(text).toMatch(/one person's Mars/);
    expect(text).toMatch(/the other person's Moon/);
    expect(text).toMatch(/first person's side/);
    expect(factsDescription({ category: 'synastry-aspect', aspect: 'square', bodyA: 'mars', bodyB: 'moon' })).toMatch(
      /this chart's Mars .* the other chart's Moon/,
    );
  });

  it('names the angle of an astrocartography line, not its code', () => {
    expect(placementDescription({ category: 'astro-line', body: 'venus', angle: 'MC' })).toMatch(/Midheaven/);
    expect(placementDescription({ category: 'astro-line', body: 'venus', angle: 'AC' })).toMatch(/Ascendant/);
    expect(placementDescription({ category: 'astro-line', body: 'venus', angle: 'IC' })).not.toMatch(/\bIC\b/);
    expect(factsDescription({ category: 'astro-line', body: 'venus', angle: 'DC' })).toMatch(/Descendant/);
  });
});

describe('the fallback sentence for the two wired categories (#427)', () => {
  it('has one for a profected house and an astrocartography line, in both languages', () => {
    expect(composeFallbackText({ category: 'profected-house', house: 7 }, 'en')).toBe(
      'The 7th house is the profected house for this period.',
    );
    expect(composeFallbackText({ category: 'profected-house', house: 3 }, 'nl')).toMatch(/3e huis/);
    expect(composeFallbackText({ category: 'astro-line', body: 'venus', angle: 'MC' }, 'en')).toBe(
      'Venus on the Midheaven line.',
    );
    expect(composeFallbackText({ category: 'astro-line', body: 'venus', angle: 'IC' }, 'nl')).toMatch(/Imum Coeli/);
  });

  it('still refuses the reserved categories, which nothing produces', () => {
    expect(() => composeFallbackText({ category: 'pattern', pattern: 'bucket' }, 'en')).toThrow(/out of scope/);
    expect(() => composeFallbackText({ category: 'nakshatra', body: 'moon', nakshatra: 3 }, 'en')).toThrow(
      /out of scope/,
    );
  });
});
