/**
 * Grouping a report section's paragraphs by body (#654), tested on the real report for a real chart so the groups
 * are the ones a reader sees, and on hand-built paragraphs for the edge cases.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeChartData } from '../src/domain/chart-compute.js';
import { assembleReport, type ReportParagraph } from '../src/interpretation/report.js';
import { groupParagraphsByBody } from '../src/interpretation/report-groups.js';
import type { CorpusEntry } from '../src/interpretation/schema.js';
import { getEngine } from './engine-harness.js';

const paragraph = (placement: ReportParagraph['placement']): ReportParagraph => ({
  text: 'x',
  ...(placement === undefined ? {} : { placement }),
  source: { kind: 'derived' },
  factors: [],
});

const sign = (body: string): ReportParagraph => paragraph({ category: 'planet-in-sign', body, sign: 1 });
const house = (body: string): ReportParagraph => paragraph({ category: 'planet-in-house', body, house: 2 });
const symbol = (): ReportParagraph => paragraph({ category: 'degree-symbol', degree: 11 });

describe('groupParagraphsByBody', () => {
  it('puts a body’s sign and house paragraphs in one group, in their original order', () => {
    const groups = groupParagraphsByBody([sign('sun'), house('sun'), sign('moon'), house('moon')]);
    expect(groups.map((g) => [g.bodyKey, g.paragraphs.length])).toEqual([
      ['sun', 2],
      ['moon', 2],
    ]);
  });

  it('keeps the Sabian paragraph with the placement it follows', () => {
    const groups = groupParagraphsByBody([sign('sun'), house('sun'), symbol(), sign('moon'), house('moon'), symbol()]);
    expect(groups.map((g) => [g.bodyKey, g.paragraphs.length])).toEqual([
      ['sun', 3],
      ['moon', 3],
    ]);
  });

  it('leaves a paragraph with no body of its own standing alone', () => {
    const groups = groupParagraphsByBody([paragraph(undefined), sign('sun'), house('sun'), paragraph(undefined)]);
    expect(groups.map((g) => g.bodyKey)).toEqual([undefined, 'sun', undefined]);
  });

  it('does not give a heading to a body that has one paragraph only', () => {
    const groups = groupParagraphsByBody([sign('chiron'), sign('mars')]);
    expect(groups.map((g) => g.bodyKey)).toEqual([undefined, undefined]);
    expect(groups.flatMap((g) => g.paragraphs)).toHaveLength(2);
  });

  it('does not merge two runs of the same body that something else separates', () => {
    const groups = groupParagraphsByBody([sign('sun'), house('sun'), paragraph(undefined), sign('sun'), house('sun')]);
    expect(groups.map((g) => g.bodyKey)).toEqual(['sun', undefined, 'sun']);
  });

  it('never drops or reorders a paragraph', () => {
    const input = [sign('sun'), symbol(), house('sun'), paragraph(undefined), sign('moon'), house('mars')];
    expect(groupParagraphsByBody(input).flatMap((g) => g.paragraphs)).toEqual(input);
  });
});

describe('on a real report', () => {
  it('groups core identity by Sun and Moon, and the nodes section by body, and nothing else gets a heading by accident', async () => {
    const provider = await getEngine();
    const chart = await computeChartData(
      {
        civil: { year: 1815, month: 12, day: 10, hour: 13, minute: 0, second: 0 },
        coordinates: { latitude: 51.5072, longitude: -0.1276 },
        offsetOverrideMinutes: 0,
      },
      provider,
      {},
    );
    const corpus = JSON.parse(readFileSync('src/interpretation/corpus/en.json', 'utf-8')) as CorpusEntry[];
    const report = assembleReport(chart, 'en', corpus);
    const headed = (id: string): (string | undefined)[] =>
      groupParagraphsByBody(report.sections.find((s) => s.id === id)?.paragraphs ?? [])
        .filter((g) => g.bodyKey !== undefined)
        .map((g) => g.bodyKey);
    expect(headed('core-identity')).toEqual(['sun', 'moon']);
    expect(headed('nodes-chiron')).toEqual(['chiron']);
    expect(headed('temperament')).toEqual([]);
    expect(headed('aspect-patterns')).toEqual([]);
  }, 30_000);
});
