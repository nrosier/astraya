/**
 * #580/#581: the PDF export lost every text label from its chart SVGs — degrees, house numbers,
 * matrix names, the elements grid's totals — because svg2pdf.js reads `rem` font sizes as 0 and
 * the chart stylesheet sizes all text in `rem`. These tests pin the rewrite that fixes it, including
 * against the real exported stylesheet, using svg2pdf.js's own font-size parsing rule.
 */
import { describe, expect, it } from 'vitest';
import { standaloneSvg } from '../src/chart/standalone-svg.js';
import { normalizeSvgForPdf, pdfFontWeight, ROOT_FONT_SIZE_PX } from '../src/ui/pdf-svg-normalize.js';

/** svg2pdf.js 2.x's `toPixels`: px, unitless and em parse; anything else (rem, pt, %) becomes 0. */
function svg2pdfReadsAsNonZero(value: string): boolean {
  return /^([-0-9.]+)(px|em|)$/.test(value.trim()) && parseFloat(value) > 0;
}

/** Every font size the stylesheet sets, whether through `font-size:` or a `font:` shorthand. */
function fontSizesIn(markup: string): string[] {
  const longhand = [...markup.matchAll(/font-size\s*:\s*([^;}]+)/g)].map((m) => m[1] ?? '');
  const shorthand = [...markup.matchAll(/font\s*:\s*(?:[a-z]+\s+)*?([-0-9.]+[a-z%]*)\s/g)].map((m) => m[1] ?? '');
  return [...longhand, ...shorthand];
}

describe('normalizeSvgForPdf (#580, #581)', () => {
  it('turns rem into px at the 16px root size', () => {
    expect(ROOT_FONT_SIZE_PX).toBe(16);
    expect(normalizeSvgForPdf('.a { font-size: 0.68rem; } .b { font-size: 1rem; } .c { font-size: .5rem; }')).toBe(
      '.a { font-size: 10.88px; } .b { font-size: 16px; } .c { font-size: 8px; }',
    );
  });

  it('leaves words that merely contain "rem" alone', () => {
    const text = '<text class="chart-remark">lorem 2rems remain</text>';
    expect(normalizeSvgForPdf(text)).toBe(text);
  });

  it('maps numeric weights to the face CSS font matching picks from regular and bold', () => {
    expect([400, 500, 550, 600, 650, 700].map(pdfFontWeight)).toEqual([
      'normal',
      'normal',
      'bold',
      'bold',
      'bold',
      'bold',
    ]);
    expect(normalizeSvgForPdf('.t { font-weight: 650; } .u { font-weight:400 }')).toBe(
      '.t { font-weight: bold; } .u { font-weight:normal }',
    );
    expect(normalizeSvgForPdf('text { font: 550 0.68rem system-ui, sans-serif; }')).toBe(
      'text { font: bold 10.88px system-ui, sans-serif; }',
    );
  });

  it('resolves var() to its fallback, as the renderer always did', () => {
    expect(normalizeSvgForPdf('stroke-width: var(--glyph-stroke, 6);')).toBe('stroke-width: 6;');
  });

  it('leaves the real exported stylesheet with no size svg2pdf.js reads as 0, and nothing it cannot parse', () => {
    const before = standaloneSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');
    // The failure this fixes, shown on the real stylesheet: sizes svg2pdf.js would draw at 0.
    expect(fontSizesIn(before).filter((size) => !svg2pdfReadsAsNonZero(size)).length).toBeGreaterThan(0);

    const after = normalizeSvgForPdf(before);
    const sizes = fontSizesIn(after);
    expect(sizes.length).toBeGreaterThan(5);
    expect(sizes.filter((size) => !svg2pdfReadsAsNonZero(size))).toEqual([]);
    expect(after).not.toMatch(/\d+(\.\d+)?rem\b/);
    expect(after).not.toMatch(/var\(/);
    expect(after).not.toMatch(/font-weight\s*:\s*\d/);
    expect(after).not.toMatch(/font\s*:\s*\d/);
  });

  it('changes nothing but the stylesheet’s units and weights: the drawing itself is untouched', () => {
    const drawing =
      '<g class="chart-emphasis"><rect x="1.00" y="2.00" width="3.00" height="4.00" class="chart-emphasis-cell" />' +
      '<text x="5.00" y="6.00" text-anchor="middle" font-size="12.50" class="chart-emphasis-total">4</text></g>';
    expect(normalizeSvgForPdf(drawing)).toBe(drawing);
  });
});
