/**
 * `relationshipSummaryParagraphs` (#422, #441): the PDF export's flat-paragraph rendering of the
 * same grouped/ranked facts `RelationshipSummary.tsx` shows as headings and lists, against the
 * real Swiss Ephemeris engine — same convention every other cross-chart domain test here follows.
 */
import { describe, expect, it } from 'vitest';
import { computeSynastry } from '../src/domain/synastry.js';
import { relationshipSummaryParagraphs } from '../src/ui/relationship-summary-pdf-text.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const PERSON_A: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

const PERSON_B: BirthMomentInput = {
  civil: { year: 1988, month: 11, day: 2, hour: 3, minute: 15, second: 0 },
  coordinates: { latitude: 51.5072, longitude: -0.1276 },
  offsetOverrideMinutes: 0,
};

describe('relationshipSummaryParagraphs (#422, #441)', () => {
  it('leads with the hint and balance sentence, never an empty paragraph, and names both people', async () => {
    const engine = await getEngine();
    const data = await computeSynastry(PERSON_A, PERSON_B, engine);
    const paragraphs = relationshipSummaryParagraphs(data, 'Devi', 'Sam', 'en');

    expect(paragraphs.length).toBeGreaterThan(2);
    expect(paragraphs[0]).toContain('grouped by theme');
    expect(paragraphs[1]).toMatch(/harmonious contact.*challenging/);
    expect(paragraphs.every((p) => p.length > 0)).toBe(true);
    expect(paragraphs.some((p) => p.includes('Devi'))).toBe(true);
    expect(paragraphs.some((p) => p.includes('Sam'))).toBe(true);
    // Never a verdict (#422 decision 4): no paragraph should read as a conclusion about the pair.
    expect(paragraphs.join(' ')).not.toMatch(/should (stay|break up)|compatible\?/i);
  });

  it('never writes "1th"/"2th"/"3th" (the wrong-suffix bug the live panel had)', async () => {
    const engine = await getEngine();
    const data = await computeSynastry(PERSON_A, PERSON_B, engine);
    const paragraphs = relationshipSummaryParagraphs(data, 'Devi', 'Sam', 'en');
    expect(paragraphs.join(' ')).not.toMatch(/\b[123]th\b/);
  });

  it('produces the same text in Dutch, from the same locale-aware message catalogue', async () => {
    const engine = await getEngine();
    const data = await computeSynastry(PERSON_A, PERSON_B, engine);
    const paragraphs = relationshipSummaryParagraphs(data, 'Devi', 'Sam', 'nl');
    expect(paragraphs[0]).toContain('gegroepeerd per thema');
  });
});
