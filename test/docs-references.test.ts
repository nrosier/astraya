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
}

interface ReferenceFile {
  readonly schema_version: number;
  readonly sources: Readonly<
    Record<string, { readonly title: string; readonly licence: string; readonly text_quality: string }>
  >;
  readonly coverage: Readonly<Record<string, unknown>>;
  readonly passages: readonly Passage[];
}

const file = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../docs/references/derived-points.references.json'), 'utf8'),
) as ReferenceFile;

describe('docs/references/derived-points.references.json', () => {
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
      expect(['verbatim', 'ocr-normalised'], passage.id).toContain(passage.kind);
      expect(passage.text.trim().length, passage.id).toBeGreaterThan(20);
    }
  });

  it('only describes points the corpus categories actually have (the midpoints were dropped)', () => {
    const points: readonly string[] = DERIVED_POINTS.map((point) => point.key);
    for (const passage of file.passages) expect(points, passage.id).toContain(passage.point);
  });

  it('never presents an OCR-normalised passage without a note saying what was resolved', () => {
    for (const passage of file.passages.filter((candidate) => candidate.kind === 'ocr-normalised')) {
      expect(passage, passage.id).toHaveProperty('notes');
    }
  });
});
