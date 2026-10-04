import { describe, expect, it } from 'vitest';
import { CORPUS_CATEGORIES, CORPUS_TIERS } from '../src/interpretation/schema.js';
import {
  categoryExplanation,
  tagExplanation,
  tagLabel,
  tierExplanation,
  tierLabel,
} from '../src/ui/placement-label.js';

describe('readable category, tier and tag text (#428)', () => {
  it('explains every category and tier in both languages, never with an internal value', () => {
    for (const locale of ['en', 'nl'] as const) {
      for (const category of CORPUS_CATEGORIES) {
        expect(categoryExplanation(category, locale).length).toBeGreaterThan(10);
      }
      for (const tier of CORPUS_TIERS) {
        expect(tierLabel(tier, locale)).not.toBe(tier === 'core' && locale === 'en' ? 'core' : '');
        expect(tierLabel(tier, locale)).not.toBe(tier);
        expect(tierExplanation(tier, locale).length).toBeGreaterThan(10);
      }
    }
  });

  it('turns the tags in use into words with an explanation', () => {
    for (const tag of ['improved-via-feedback-loop', 'ruler', 'exalted', 'detriment', 'fall']) {
      for (const locale of ['en', 'nl'] as const) {
        expect(tagLabel(tag, locale)).not.toBe(tag);
        expect(tagLabel(tag, locale)).not.toContain('-');
        expect(tagExplanation(tag, locale)).toBeDefined();
      }
    }
  });

  it('makes an unknown tag readable instead of showing it raw', () => {
    expect(tagLabel('hand-checked_by-editor', 'en')).toBe('Hand checked by editor');
    expect(tagExplanation('hand-checked_by-editor', 'en')).toBeUndefined();
  });
});
