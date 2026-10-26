// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { OrbLibrary } from '../src/astrology/orb-library.js';
import { applyCalculationProfile } from '../src/chart/calculation-profiles.js';
import { DEFAULT_EXTENDED_SETTINGS, settingsForContext } from '../src/chart/extended-settings.js';
import { calculationSource, orbSourceName } from '../src/ui/calculation-basis.js';
import { calculationBasisMessages } from '../src/ui/calculation-basis.messages.js';

const CUSTOM = { ...DEFAULT_EXTENDED_SETTINGS, rainbowZodiac: true };
const HOUSE: OrbLibrary = {
  profiles: [
    {
      id: 'house-style',
      name: 'My house style',
      revision: 1,
      scalePercent: -10,
      aspectOrbs: { trine: { base: 6, luminaryBonus: 2 } },
      bodyOrbs: { venus: 4, mars: 3 },
    },
  ],
};

describe('calculationSource (#510)', () => {
  it('says "Astraya default" for the shipped settings and rulers, whatever is saved', () => {
    expect(calculationSource(DEFAULT_EXTENDED_SETTINGS, 'modern', undefined)).toBe('astraya-default');
    expect(calculationSource(DEFAULT_EXTENDED_SETTINGS, 'modern', { settings: CUSTOM, rulership: 'modern' })).toBe(
      'astraya-default',
    );
  });

  it('says "my default" when the chart uses exactly what the user saved', () => {
    expect(calculationSource(CUSTOM, 'traditional', { settings: CUSTOM, rulership: 'traditional' })).toBe('my-default');
  });

  it('says "this chart" when settings or rulers differ from both defaults', () => {
    expect(calculationSource(CUSTOM, 'modern', undefined)).toBe('this-chart');
    expect(calculationSource(CUSTOM, 'modern', { settings: CUSTOM, rulership: 'traditional' })).toBe('this-chart');
    expect(calculationSource(DEFAULT_EXTENDED_SETTINGS, 'traditional', undefined)).toBe('this-chart');
  });

  it('treats a built-in profile applied to the chart as a change unless it is the default', () => {
    const traditional = applyCalculationProfile(DEFAULT_EXTENDED_SETTINGS, 'traditional-western-v1');
    expect(calculationSource(traditional, 'traditional', undefined)).toBe('this-chart');
  });
});

describe('the calculation-basis wording', () => {
  it('has every source in both languages and names the profile and its source in the line', () => {
    for (const locale of ['en', 'nl'] as const) {
      const t = calculationBasisMessages[locale];
      expect(Object.keys(t.sources).sort()).toEqual(['astraya-default', 'my-default', 'this-chart']);
      expect(t.line('P', 'S')).toContain('P');
      expect(t.line('P', 'S')).toContain('S');
    }
  });

  it('names the natal orb profile in both languages', () => {
    expect(calculationBasisMessages.en.orbSource('My house style')).toBe('orbs: My house style (this device)');
    expect(calculationBasisMessages.nl.orbSource('My house style')).toBe('orbs: My house style (dit apparaat)');
  });
});

describe('the natal orb profile in the basis (#806)', () => {
  it('names the device profile that the natal chart uses, and nothing when the card orbs apply', () => {
    expect(orbSourceName(HOUSE, { natal: 'house-style' }, 'natal')).toBe('My house style');
    expect(orbSourceName(HOUSE, {}, 'natal')).toBeUndefined();
    expect(orbSourceName(HOUSE, { natal: 'card' }, 'natal')).toBeUndefined();
  });

  it('names a cited preset by its label', () => {
    expect(orbSourceName({ profiles: [] }, { natal: 'lilly-1647-first-v1' }, 'natal')).toBe(
      'Lilly (1647), first column',
    );
  });

  it('shows no clause when the named profile was deleted, because the chart falls back to the card', () => {
    expect(orbSourceName({ profiles: [] }, { natal: 'gone' }, 'natal')).toBeUndefined();
  });

  it('does not call a natal orb profile "changed for this chart": the card settings are the basis', () => {
    const card = DEFAULT_EXTENDED_SETTINGS;
    const calculatedWith = settingsForContext(card, 'natal', HOUSE, { natal: 'house-style' });
    // The chart really does calculate with different orbs, which is why reading the basis from them was the bug...
    expect(calculatedWith).not.toEqual(card);
    expect(calculationSource(calculatedWith, 'modern', undefined)).toBe('this-chart');
    // ...so the basis is read from the card, and only the orb clause names the device profile.
    expect(calculationSource(card, 'modern', undefined)).toBe('astraya-default');
  });
});
