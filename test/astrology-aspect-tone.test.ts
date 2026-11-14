import { describe, expect, it } from 'vitest';
import { ASPECTS, aspectKeysByTone, aspectTone, type AspectTone } from '../src/astrology/aspects.js';

/** The owner's decided tones (2026-11-13, #1532). Every ASPECTS key must appear exactly once. */
const DECIDED: Readonly<Record<AspectTone, readonly string[]>> = {
  hard: ['conjunction', 'square', 'opposition', 'semisquare', 'sesquiquadrate'],
  soft: ['sextile', 'trine'],
  minor: ['semisextile', 'quincunx', 'quintile', 'biquintile', 'decile', 'septile', 'novile'],
};

const TONES: readonly AspectTone[] = ['hard', 'soft', 'minor'];

describe('aspect tone catalogue (#1532)', () => {
  it('gives every ASPECTS entry a tone', () => {
    for (const aspect of ASPECTS) {
      expect(TONES).toContain(aspect.tone);
    }
  });

  it('matches the decided tone for every aspect key', () => {
    for (const aspect of ASPECTS) {
      const expected = TONES.find((tone) => DECIDED[tone].includes(aspect.key));
      expect(expected, `no decided tone for ${aspect.key}`).toBeDefined();
      expect(aspect.tone, aspect.key).toBe(expected);
    }
  });

  it('covers exactly the decided keys, no more and no fewer', () => {
    const decidedKeys = TONES.flatMap((tone) => DECIDED[tone]).sort();
    const catalogueKeys = ASPECTS.map((aspect) => aspect.key).sort();
    expect(catalogueKeys).toEqual(decidedKeys);
  });

  it('aspectTone returns the same tone as the catalogue row', () => {
    for (const aspect of ASPECTS) {
      expect(aspectTone(aspect.key)).toBe(aspect.tone);
    }
  });

  it('aspectTone throws for an unknown key', () => {
    expect(() => aspectTone('not-an-aspect')).toThrow(RangeError);
  });

  it('aspectKeysByTone partitions the keys: each key in exactly one tone', () => {
    const seen = TONES.flatMap((tone) => aspectKeysByTone(tone));
    expect([...seen].sort()).toEqual(ASPECTS.map((aspect) => aspect.key).sort());
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('aspectKeysByTone returns the decided keys in ASPECTS order', () => {
    for (const tone of TONES) {
      const inOrder = ASPECTS.filter((aspect) => aspect.tone === tone).map((aspect) => aspect.key);
      expect(aspectKeysByTone(tone)).toEqual(inOrder);
      expect([...aspectKeysByTone(tone)].sort()).toEqual([...DECIDED[tone]].sort());
    }
  });
});
