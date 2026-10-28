/**
 * The curated reference file the derived-point corpus seeding reads (`docs/references`): it must stay
 * parseable and internally consistent — every passage names a known source, carries a locator and text, ids
 * are unique, and the coverage block states the gaps rather than being silently dropped.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DERIVED_POINTS } from '../src/astrology/derived-points.js';

interface Passage {
  readonly id: string;
  readonly point: string;
  readonly topic: string;
  readonly source: string;
  readonly locator: string;
  readonly kind: string;
  readonly text: string;
  readonly translation_of?: string;
  readonly notes?: string;
}

interface ReferenceFile {
  readonly schema_version: number;
  readonly sources: Readonly<
    Record<string, { readonly title: string; readonly licence: string; readonly text_quality: string }>
  >;
  readonly coverage: Readonly<Record<string, unknown>>;
  readonly decisions: readonly { readonly topic: string; readonly decision: string }[];
  readonly convention_note: string;
  readonly passages: readonly Passage[];
}

const file = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../docs/references/topics/derived-points.json'), 'utf8'),
) as ReferenceFile;

describe('docs/references/topics/derived-points.json', () => {
  it('has a version and states its coverage, including the dropped midpoints', () => {
    expect(file.schema_version).toBe(1);
    expect(Object.keys(file.coverage).sort()).toEqual(['midpoints', 'part-of-fortune', 'part-of-spirit']);
  });

  it('describes every source with a title, a licence and a text-quality note', () => {
    for (const [id, source] of Object.entries(file.sources)) {
      expect(source.title, id).not.toBe('');
      expect(source.licence, id).toMatch(/public domain/i);
      expect(source.text_quality, id).not.toBe('');
    }
  });

  it('has unique passage ids, each with a known source, a locator, a known kind and non-empty text', () => {
    const ids = file.passages.map((passage) => passage.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const passage of file.passages) {
      expect(Object.keys(file.sources), passage.id).toContain(passage.source);
      expect(passage.locator, passage.id).not.toBe('');
      expect(['verbatim', 'ocr-normalised', 'greek-transcription', 'machine-translation'], passage.id).toContain(
        passage.kind,
      );
      expect(passage.text.trim().length, passage.id).toBeGreaterThan(20);
    }
  });

  it('only describes points the corpus categories actually have (the midpoints were dropped)', () => {
    const points: readonly string[] = [...DERIVED_POINTS.map((point) => point.key), 'both'];
    for (const passage of file.passages) expect(points, passage.id).toContain(passage.point);
  });

  it('never presents anything but a verbatim passage without a note saying what was resolved or assumed', () => {
    for (const passage of file.passages.filter((candidate) => candidate.kind !== 'verbatim')) {
      expect(passage, passage.id).toHaveProperty('notes');
    }
  });

  it('ties every machine translation to the Greek passage it translates, and says it is unreviewed', () => {
    const ids = new Set(file.passages.map((passage) => passage.id));
    const translations = file.passages.filter((candidate) => candidate.kind === 'machine-translation');
    expect(translations.length).toBeGreaterThan(0);
    for (const passage of translations) {
      expect(passage.translation_of, passage.id).toBeDefined();
      expect(ids.has(passage.translation_of ?? ''), passage.id).toBe(true);
      expect(file.passages.find((candidate) => candidate.id === passage.translation_of)?.kind, passage.id).toBe(
        'greek-transcription',
      );
      expect(passage.notes, passage.id).toMatch(/unreviewed/i);
    }
  });

  it('records the owner decisions and states the day/night convention with explicit formulas', () => {
    const topics = file.decisions.map((decision) => decision.topic);
    expect(topics).toEqual(
      expect.arrayContaining([
        'sign entries (24 per language)',
        'house entries (24 per language)',
        'day/night convention',
      ]),
    );
    expect(file.convention_note).toContain('Ascendant + Moon - Sun');
    expect(file.convention_note).toContain('Ascendant + Sun - Moon');
  });
});
