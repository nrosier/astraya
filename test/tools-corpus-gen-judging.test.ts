/** The judge's majority vote and the generator's mild-aspect hint (#437). */
import { describe, expect, it } from 'vitest';
// prettier-ignore
// @ts-expect-error -- plain .mjs, no type declarations; cast to known shapes below.
import { majorityVerdict as majorityVerdictUntyped } from '../tools/corpus-gen/lib/corpus-evaluation.mjs';
// prettier-ignore
// @ts-expect-error -- plain .mjs, no type declarations; cast to known shapes below.
import { aspectFlavorHint as aspectFlavorHintUntyped } from '../tools/corpus-gen/lib/prompt.mjs';

interface Ballot {
  readonly error?: { readonly message: string };
  readonly result: { readonly correct: boolean; readonly issues: readonly string[] };
}
const majorityVerdict = majorityVerdictUntyped as (ballots: readonly (Ballot | undefined)[]) => {
  valid: number;
  correct: boolean;
  issues: string[];
};
const aspectFlavorHint = aspectFlavorHintUntyped as (aspect: string, locale: string) => string | undefined;

const ok: Ballot = { result: { correct: true, issues: [] } };
const flag = (issue: string): Ballot => ({ result: { correct: false, issues: [issue] } });

describe('majorityVerdict', () => {
  it('flags an entry only when most ballots flag it', () => {
    expect(majorityVerdict([ok, ok, flag('generic')]).correct).toBe(true);
    expect(majorityVerdict([ok, flag('generic'), flag('generic too')]).correct).toBe(false);
    expect(majorityVerdict([flag('a'), flag('b'), flag('c')]).issues).toEqual(['a', 'b', 'c']);
  });

  it('does not count a ballot that errored or never came back, and does not flag on a tie', () => {
    const errored: Ballot = { error: { message: 'boom' }, result: { correct: false, issues: ['x'] } };
    expect(majorityVerdict([flag('a'), errored, undefined]).valid).toBe(1);
    expect(majorityVerdict([flag('a'), ok]).correct).toBe(true);
  });

  it('carries only the issues of the ballots that flagged', () => {
    expect(majorityVerdict([ok, flag('real'), flag('real')]).issues).toEqual(['real']);
  });
});

describe('aspectFlavorHint', () => {
  it('reminds the generator to keep the shadow mild for the mild minor aspects, in both languages', () => {
    for (const aspect of ['semisextile', 'semisquare', 'quintile', 'biquintile']) {
      expect(aspectFlavorHint(aspect, 'en')).toContain('mild');
      expect(aspectFlavorHint(aspect, 'nl')).toContain('mild');
    }
  });

  it('keeps the quintile series’ creative flavour and says nothing for the other aspects', () => {
    expect(aspectFlavorHint('quintile', 'en')).toContain('creative synthesis');
    expect(aspectFlavorHint('semisextile', 'en')).not.toContain('creative synthesis');
    expect(aspectFlavorHint('trine', 'en')).toBeUndefined();
    expect(aspectFlavorHint('sesquiquadrate', 'en')).toBeUndefined();
  });
});
