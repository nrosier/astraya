/**
 * Behaviour of the command-palette scorer (#1654, `src/ui/search-score.ts`): ranking weights, multi-token
 * queries that must match every token, the "sr" abbreviation, "solar return" listing every place the
 * concept appears, diacritic-insensitive matching for nl input, and stable registry order on ties.
 * Pure: fixtures only, no React, no DOM, no ephemeris.
 */
import { describe, expect, it } from 'vitest';
import { normaliseSearchText, scoreEntries, type SearchableEntry } from '../src/ui/search-score.js';

interface Fixture extends SearchableEntry {
  readonly id: string;
}

const entries: readonly Fixture[] = [
  {
    id: 'sr-charts',
    title: 'Solar Return',
    breadcrumb: 'Charts',
    keywords: ['sr', 'revolution', 'birthday chart', 'annual return'],
    description: 'The chart for the moment the Sun returns to its natal longitude.',
  },
  {
    id: 'sr-timing',
    title: 'Solar Return',
    breadcrumb: 'Timing',
    keywords: ['sr', 'revolution', 'birthday chart'],
    description: 'Solar return timing for the year ahead.',
  },
  {
    id: 'transits',
    title: 'Transits',
    breadcrumb: 'Timing',
    keywords: ['transit', 'current sky'],
    description: 'Planets now against the natal chart.',
  },
  {
    id: 'sun-keyword',
    title: 'Overview',
    breadcrumb: 'Person',
    keywords: ['sunny day', 'summary'],
    description: 'Summary of the person.',
  },
  {
    id: 'birth-record',
    title: 'Birth record',
    breadcrumb: 'Person',
    keywords: ['birth data', 'geboorte'],
    description: 'Date, time and place of birth.',
  },
  {
    id: 'geboortekaart',
    title: 'Geboortekaart',
    breadcrumb: 'Grafieken',
    keywords: ['horoscoop', 'natal'],
    description: 'Het geboortehoroscoop van de persoon.',
  },
];

function ids(query: string, list: readonly Fixture[] = entries): string[] {
  return scoreEntries(query, list).map((scored) => scored.entry.id);
}

describe('normaliseSearchText', () => {
  it('lower-cases and strips diacritics', () => {
    expect(normaliseSearchText('Géboorte Été')).toBe('geboorte ete');
  });
});

describe('scoreEntries ranking', () => {
  it('ranks a title prefix above a keyword prefix', () => {
    const list: Fixture[] = [
      { id: 'keyword-only', title: 'Zodiac', breadcrumb: 'Tools', keywords: ['solar'], description: '' },
      { id: 'title-prefix', title: 'Solar Return', breadcrumb: 'Charts', keywords: [], description: '' },
    ];
    expect(ids('sol', list)).toEqual(['title-prefix', 'keyword-only']);
    const scored = scoreEntries('sol', list);
    expect(scored[0]?.score).toBe(100);
    expect(scored[1]?.score).toBe(40);
  });

  it('finds Solar Return from the abbreviation "sr" through its keyword', () => {
    expect(ids('sr')).toEqual(['sr-charts', 'sr-timing']);
  });

  it('lists every place Solar Return appears for the full title', () => {
    expect(ids('solar return')).toEqual(['sr-charts', 'sr-timing']);
  });

  it('keeps registry order for equal scores', () => {
    const scored = scoreEntries('solar return', entries);
    expect(scored.map((item) => item.entry.breadcrumb)).toEqual(['Charts', 'Timing']);
    expect(scored[0]?.score).toBe(scored[1]?.score);
  });

  it('returns nothing for an empty or blank query', () => {
    expect(scoreEntries('', entries)).toEqual([]);
    expect(scoreEntries('   ', entries)).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(ids('SOLAR')).toEqual(ids('solar'));
  });
});

describe('scoreEntries multi-token queries', () => {
  it('requires every token to match some field', () => {
    expect(ids('transit zodiac')).toEqual([]);
    expect(ids('transit current')).toEqual(['transits']);
  });

  it('sums the per-token scores (title prefix 100 plus title substring 60)', () => {
    const scored = scoreEntries('solar return', entries);
    expect(scored[0]?.score).toBe(100 + 60);
  });

  it('matches tokens across different fields', () => {
    expect(ids('birthday revolution')).toEqual(['sr-charts', 'sr-timing']);
  });
});

describe('scoreEntries accents', () => {
  it('matches unaccented input against accented text', () => {
    const list: Fixture[] = [
      { id: 'cafe', title: 'Café opties', breadcrumb: 'Instellingen', keywords: [], description: '' },
    ];
    expect(ids('cafe', list)).toEqual(['cafe']);
    expect(ids('café', list)).toEqual(['cafe']);
  });

  it('matches nl input with accents in the keywords and description', () => {
    expect(ids('geboorte')).toEqual(['geboortekaart', 'birth-record']);
    expect(ids('Geboörte')).toEqual(['geboortekaart', 'birth-record']);
    expect(ids('horoscoop')).toEqual(['geboortekaart']);
  });
});
