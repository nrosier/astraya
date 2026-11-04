// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { OrbLibrary } from '../src/astrology/orb-library.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import {
  buildCalculationBasisLine,
  orbSourceName,
  withBasisItems,
  type BasisWords,
} from '../src/ui/calculation-basis.js';
import { calculationBasisMessages } from '../src/ui/calculation-basis.messages.js';

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

describe('buildCalculationBasisLine (#1059)', () => {
  it('prints zodiac, house system, rulers and orbs for the shipped defaults', () => {
    expect(buildCalculationBasisLine(DEFAULT_EXTENDED_SETTINGS, 'modern', WORDS.en)).toBe(
      'Tropical · Placidus · Modern rulers · Standard orbs',
    );
    expect(buildCalculationBasisLine(DEFAULT_EXTENDED_SETTINGS, 'traditional', WORDS.nl)).toBe(
      'Tropisch · Placidus · Traditioneel heersers · Standaard orbs',
    );
  });

  it('reads sidereal and another house system', () => {
    const settings = {
      ...DEFAULT_EXTENDED_SETTINGS,
      zodiac: { kind: 'sidereal', ayanamsa: 1 } as const,
      houseSystem: 'W' as const,
    };
    const line = buildCalculationBasisLine(settings, 'both', WORDS.en);
    expect(line).toMatch(/^Sidereal · .+ · Both rulers · Standard orbs$/);
    expect(line).not.toContain('Placidus');
  });

  it('leaves out the parts a view does not calculate with, and names whole-sign houses for profections', () => {
    expect(
      buildCalculationBasisLine(DEFAULT_EXTENDED_SETTINGS, 'traditional', WORDS.en, undefined, {
        houses: 'whole-sign',
        orbs: false,
      }),
    ).toBe('Tropical · Whole-sign houses · Traditional rulers');
    expect(
      buildCalculationBasisLine(DEFAULT_EXTENDED_SETTINGS, 'traditional', WORDS.nl, undefined, {
        houses: 'whole-sign',
        orbs: false,
      }),
    ).toBe('Tropisch · Hele-tekenhuizen · Traditioneel heersers');
    expect(buildCalculationBasisLine(DEFAULT_EXTENDED_SETTINGS, 'modern', WORDS.en, undefined, { rulers: false })).toBe(
      'Tropical · Placidus · Standard orbs',
    );
    expect(
      buildCalculationBasisLine(DEFAULT_EXTENDED_SETTINGS, 'modern', WORDS.en, undefined, {
        rulers: false,
        orbs: false,
      }),
    ).toBe('Tropical · Placidus');
  });

  it("states the person's Traditional rulers with the transit orbs for the Transits view", () => {
    const line = buildCalculationBasisLine(DEFAULT_EXTENDED_SETTINGS, 'traditional', WORDS.en, 'My house style');
    expect(line).toBe('Tropical · Placidus · Traditional rulers · My house style orbs');
    expect(line).not.toContain('Modern');
  });

  it('says Custom when the orbs are edited per aspect, and names a device orb profile when one applies', () => {
    const custom = { ...DEFAULT_EXTENDED_SETTINGS, orbRules: { bodyOrbs: { venus: 4 } } };
    expect(buildCalculationBasisLine(custom, 'modern', WORDS.en)).toContain('Custom orbs');
    expect(buildCalculationBasisLine(custom, 'modern', WORDS.en, 'My house style')).toContain('My house style orbs');
  });
});

describe('withBasisItems (#1059)', () => {
  it('appends the facts only one page adds, joined like the line itself', () => {
    const line = buildCalculationBasisLine(DEFAULT_EXTENDED_SETTINGS, 'modern', WORDS.en);
    expect(withBasisItems(line, 'Harmonic 5')).toBe(`${line} · Harmonic 5`);
    expect(withBasisItems(line)).toBe(line);
  });

  it('has the page-specific words in both languages', () => {
    for (const locale of ['en', 'nl'] as const) {
      const t = calculationBasisMessages[locale];
      expect(t.draconic).not.toBe('');
      expect(t.midpointMethod).not.toBe('');
      expect(t.relocatedTo('Lisbon')).toContain('Lisbon');
    }
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
});
