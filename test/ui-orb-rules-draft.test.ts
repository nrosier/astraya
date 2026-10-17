/** Typed orb-rule drafts (#590): what a blank means, what is refused, and the shape a stored bag has. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import {
  applyCalculationProfile,
  matchCalculationProfile,
  withoutOrbRules,
} from '../src/chart/calculation-profiles.js';
import { orbRulesDraftFrom, orbRulesFromDraft, withOrbRules } from '../src/ui/orb-rules-draft.js';

describe('orbRulesFromDraft', () => {
  it('reads a blank base or body field as no rule, not zero', () => {
    expect(orbRulesFromDraft({ aspects: { trine: { base: '', bonus: '3' } }, bodies: { venus: ' ' } })).toEqual({
      aspectOrbs: {},
      bodyOrbs: {},
    });
  });

  it('reads a blank luminary bonus beside a base as 0', () => {
    expect(orbRulesFromDraft({ aspects: { trine: { base: '8', bonus: '' } }, bodies: {} })?.aspectOrbs).toEqual({
      trine: { base: 8, luminaryBonus: 0 },
    });
  });

  it('refuses the whole draft when any entry is not a number or is out of range', () => {
    expect(orbRulesFromDraft({ aspects: {}, bodies: { venus: 'abc' } })).toBeUndefined();
    expect(orbRulesFromDraft({ aspects: {}, bodies: { venus: '31' } })).toBeUndefined();
    expect(orbRulesFromDraft({ aspects: { trine: { base: '-1', bonus: '' } }, bodies: { mars: '3' } })).toBeUndefined();
  });

  it('round-trips rules through their typed form', () => {
    const rules = { aspectOrbs: { square: { base: 6.5, luminaryBonus: 2 } }, bodyOrbs: { venus: 4, mars: 3 } };
    expect(orbRulesFromDraft(orbRulesDraftFrom(rules))).toEqual(rules);
  });
});

describe('withOrbRules', () => {
  it('leaves a settings value byte-identical to one without rules when there are none', () => {
    const none = withOrbRules(DEFAULT_EXTENDED_SETTINGS, { aspectOrbs: {}, bodyOrbs: {} });
    expect(JSON.stringify(none)).toBe(JSON.stringify(DEFAULT_EXTENDED_SETTINGS));
    expect(JSON.stringify(withOrbRules(DEFAULT_EXTENDED_SETTINGS, undefined))).toBe(
      JSON.stringify(DEFAULT_EXTENDED_SETTINGS),
    );
  });

  it('keeps only the non-empty half, as the snapshot parser does', () => {
    const only = withOrbRules(DEFAULT_EXTENDED_SETTINGS, { aspectOrbs: {}, bodyOrbs: { venus: 4 } });
    expect(only.orbRules).toEqual({ bodyOrbs: { venus: 4 } });
  });

  it('replaces earlier rules rather than merging into them', () => {
    const before = withOrbRules(DEFAULT_EXTENDED_SETTINGS, { aspectOrbs: {}, bodyOrbs: { venus: 4 } });
    expect(withOrbRules(before, { aspectOrbs: {}, bodyOrbs: { mars: 3 } }).orbRules).toEqual({ bodyOrbs: { mars: 3 } });
  });
});

describe('calculation profiles and orb rules', () => {
  const ruled = withOrbRules(DEFAULT_EXTENDED_SETTINGS, { aspectOrbs: {}, bodyOrbs: { venus: 4 } });

  it('a built-in profile clears the practitioner’s rules, because it owns the orb definition', () => {
    expect(applyCalculationProfile(ruled, 'modern-western-v1').orbRules).toBeUndefined();
    expect(withoutOrbRules(ruled).orbRules).toBeUndefined();
  });

  it('settings with rules match no built-in profile, so they read as Custom', () => {
    expect(matchCalculationProfile(DEFAULT_EXTENDED_SETTINGS, 'modern')).toBeDefined();
    expect(matchCalculationProfile(ruled, 'modern')).toBeUndefined();
  });
});
