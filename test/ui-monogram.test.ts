// @vitest-environment jsdom
/**
 * #1747 — the one-letter monogram the collapsed rail shows for the brand and the person switcher.
 */
import { describe, expect, it } from 'vitest';
import { monogram } from '../src/ui/PersonSwitcher.js';

describe('monogram (#1747)', () => {
  it('is the upper-cased first letter', () => {
    expect(monogram('Astraya')).toBe('A');
    expect(monogram('ada lovelace')).toBe('A');
  });

  it('skips leading whitespace', () => {
    expect(monogram('  nick')).toBe('N');
  });

  it('keeps a whole code point rather than half a surrogate pair', () => {
    expect(monogram('😀 Smile')).toBe('😀');
  });

  it('keeps an accented letter whole', () => {
    expect(monogram('émile')).toBe('É');
  });

  it('falls back to ? for a blank name', () => {
    expect(monogram('')).toBe('?');
    expect(monogram('   ')).toBe('?');
  });
});
