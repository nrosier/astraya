// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import { buildCalculationBasisLine, type BasisWords } from '../src/ui/calculation-basis.js';
import { calculationBasisMessages } from '../src/ui/calculation-basis.messages.js';

/**
 * The Part of Fortune formula on the calculation basis line (#1794). The owner decided (2026-11-20) that the
 * line names the formula only for the modern setting; the default line stays as it was (see
 * `test/ui-calculation-basis.test.ts`).
 */
const WORDS: Record<'en' | 'nl', BasisWords> = {
  en: {
    t: calculationBasisMessages.en,
    rulerTitles: { modern: 'Modern', traditional: 'Traditional', both: 'Both' },
    orbProfileTitles: { custom: 'Custom', 'standard-v1': 'Standard', 'tight-v1': 'Tight', 'wide-v1': 'Wide' },
  },
  nl: {
    t: calculationBasisMessages.nl,
    rulerTitles: { modern: 'Modern', traditional: 'Traditioneel', both: 'Beide' },
    orbProfileTitles: { custom: 'Eigen keuze', 'standard-v1': 'Standaard', 'tight-v1': 'Strak', 'wide-v1': 'Ruim' },
  },
};

const MODERN: ExtendedSettings = { ...DEFAULT_EXTENDED_SETTINGS, fortuneFormula: 'same-day-and-night' };

describe('calculation basis line, Part of Fortune formula (#1794)', () => {
  it('leaves the default line unchanged when the setting is the default', () => {
    expect(
      buildCalculationBasisLine({ ...DEFAULT_EXTENDED_SETTINGS, fortuneFormula: 'sect-reversed' }, 'modern', WORDS.en),
    ).toBe('Tropical · Placidus · Mean node · Modern rulers · Standard orbs');
  });

  it('names the modern formula after the other items when the modern setting is chosen', () => {
    expect(buildCalculationBasisLine(MODERN, 'modern', WORDS.en)).toBe(
      'Tropical · Placidus · Mean node · Modern rulers · Standard orbs · Fortune formula: same by day and night',
    );
  });

  it('names the modern formula in Dutch', () => {
    expect(buildCalculationBasisLine(MODERN, 'traditional', WORDS.nl)).toBe(
      'Tropisch · Placidus · Gemiddelde maansknoop · Traditioneel heersers · Standaard orbs · Fortuinpunt-formule: dag en nacht gelijk',
    );
  });

  it('does not name the formula on a chart with no houses (heliocentric)', () => {
    expect(buildCalculationBasisLine(MODERN, 'modern', WORDS.en, undefined, { houses: 'none' })).toBe(
      'Tropical · Modern rulers · Standard orbs',
    );
  });
});
