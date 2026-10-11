// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyCalculationProfile } from '../src/chart/calculation-profiles.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { calculationSource } from '../src/ui/calculation-basis.js';
import { calculationBasisMessages } from '../src/ui/calculation-basis.messages.js';

const CUSTOM = { ...DEFAULT_EXTENDED_SETTINGS, rainbowZodiac: true };

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
});
