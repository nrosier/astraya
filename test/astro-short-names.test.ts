import { describe, expect, it } from 'vitest';
import { fitFontSize } from '../src/chart/aspect-matrix.js';
import { bodyShortName } from '../src/ui/astro-names.messages.js';

describe('bodyShortName (#432)', () => {
  it('abbreviates the node and Lilith variants in both languages', () => {
    expect(bodyShortName('meanNode', 'en')).toBe('Node (m)');
    expect(bodyShortName('meanLilith', 'nl')).toBe('Lilith (g)');
    expect(bodyShortName('trueNode', 'nl')).toBe('Knoop (w)');
  });

  it('leaves other bodies with their full name', () => {
    expect(bodyShortName('sun', 'nl')).toBe('Zon');
    expect(bodyShortName('mercury', 'en')).toBe('Mercury');
  });

  it('keeps every short name inside the matrix name column at a realistic size', () => {
    // 2.1 cells wide, text at 0.4 of a cell, 0.12-cell margins: the layout in aspect-matrix.ts.
    for (const locale of ['en', 'nl'] as const) {
      for (const key of ['meanNode', 'trueNode', 'meanLilith', 'osculatingLilith', 'interpolatedLilith']) {
        const name = bodyShortName(key, locale);
        expect(fitFontSize(name, 0.4, 2.1, 0.12)).toBeGreaterThanOrEqual(0.4 * 0.75);
      }
    }
  });
});
