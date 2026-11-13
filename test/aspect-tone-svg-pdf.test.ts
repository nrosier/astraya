import { describe, expect, it, vi } from 'vitest';
import { type Aspect, aspectByKey, aspectTone } from '../src/astrology/aspects.js';
import { type AspectMatrixInput, renderAspectMatrixSvg } from '../src/chart/aspect-matrix.js';
import { renderAspectWebSvg } from '../src/chart/aspect-web.js';
import type { PanelLayout } from '../src/chart/sheet-geometry.js';
import { standaloneSvg } from '../src/chart/standalone-svg.js';
import { ASPECT_TONE } from '../src/ui/pdf-export-render.js';

// svg2pdf.js's UMD bundle reads jsPDF at import time and fails under vitest. This file only reads
// the PDF tone map, never draws a PDF, so the library is stubbed out.
vi.mock('svg2pdf.js', () => ({ svg2pdf: vi.fn() }));

const LAYOUT: PanelLayout = { x: 0, y: 0, width: 400 };

/** The `data-tone` value of every chord `<line>` in a web SVG, in document order. */
function chordTones(markup: string): string[] {
  return [...markup.matchAll(/class="chart-aspect [^"]*"[^>]*data-tone="([^"]*)"/g)].map((m) => m[1] ?? '');
}

function aspect(key: string, bodyA: number, bodyB: number, orb: number): Aspect {
  const definition = aspectByKey(key);
  if (!definition) throw new Error(`test fixture bug: unknown aspect key "${key}"`);
  return { aspect: definition, bodyA, bodyB, separation: definition.angle + orb, orb, allowedOrb: 8, applying: true };
}

/** One aspect of each tone, so every tone rule is exercised. */
const CHORDS: readonly Aspect[] = [
  aspect('conjunction', 1, 2, 1),
  aspect('trine', 2, 3, 2),
  aspect('quintile', 3, 4, 0.5),
  aspect('square', 4, 1, 1.5),
];
const LONGITUDES = new Map<number, number>([
  [1, 10],
  [2, 10],
  [3, 130],
  [4, 190],
]);
const longitudeOf = (body: number): number => {
  const longitude = LONGITUDES.get(body);
  if (longitude === undefined) throw new Error(`test fixture bug: no longitude for body ${body}`);
  return longitude;
};

describe('aspect tone in standalone SVG and PDF (#1532)', () => {
  it('gives every chord the tone aspectTone returns for its key', () => {
    const svg = renderAspectWebSvg(CHORDS, longitudeOf, 0, 300, 300, 200);
    expect(chordTones(svg)).toEqual(CHORDS.map((a) => aspectTone(a.aspect.key)));
  });

  it('keeps data-tone on every chord inside the standalone SVG', () => {
    const svg = renderAspectWebSvg(CHORDS, longitudeOf, 0, 300, 300, 200);
    expect(chordTones(standaloneSvg(`<svg>${svg}</svg>`))).toEqual(CHORDS.map((a) => aspectTone(a.aspect.key)));
  });

  it('gives every matrix glyph the tone aspectTone returns for its key', () => {
    const input: AspectMatrixInput = {
      bodies: [
        { key: 'sun', label: 'Sun', name: 'Sun', longitude: 280.37, house: 4 },
        { key: 'moon', label: 'Moon', name: 'Moon', longitude: 193.32, house: 1 },
        { key: 'saturn', label: 'Saturn', name: 'Saturn', longitude: 32.05, house: 8 },
      ],
      aspects: [
        { aKey: 'sun', bKey: 'moon', aspectKey: 'conjunction', orb: 1, signedOrb: 1, applying: true },
        { aKey: 'saturn', bKey: 'sun', aspectKey: 'quincunx', orb: 1, signedOrb: -1, applying: false },
      ],
    };
    const { markup } = renderAspectMatrixSvg(input, LAYOUT);
    const glyphs = [...markup.matchAll(/chart-aspect-glyph-([a-z]+) [^"]*" data-tone="([^"]*)"/g)];
    expect(glyphs.map((m) => [m[1], m[2]])).toEqual([
      ['conjunction', aspectTone('conjunction')],
      ['quincunx', aspectTone('quincunx')],
    ]);
  });

  it('keeps the standalone SVG on one rule per tone with no per-key selector', () => {
    const style = standaloneSvg('<svg></svg>');
    for (const tone of ['hard', 'soft', 'minor']) {
      expect(style).toContain(`.chart-aspect[data-tone='${tone}']`);
      expect(style).toContain(`.chart-matrix-cell[data-tone='${tone}']`);
      expect(style).toContain(`.chart-aspect-glyph[data-tone='${tone}'] text.chart-symbol-text`);
    }
    expect(style).not.toMatch(/\.chart-aspect-(conjunction|square|trine|quintile)\b/);
    expect(style).not.toMatch(/\.chart-matrix-cell-(conjunction|square|trine|quintile)\b/);
  });

  it('gives the PDF tone map exactly the keys hard, soft and minor', () => {
    expect(Object.keys(ASPECT_TONE).sort()).toEqual(['hard', 'minor', 'soft']);
  });

  it('colours conjunction hard in the standalone SVG and the PDF (#1532)', () => {
    expect(aspectTone('conjunction')).toBe('hard');
    expect(ASPECT_TONE[aspectTone('conjunction')]).toEqual([179, 38, 30]);
    expect(standaloneSvg('<svg></svg>')).toContain(".chart-aspect[data-tone='hard'] { stroke: #b3261e;");
  });
});
