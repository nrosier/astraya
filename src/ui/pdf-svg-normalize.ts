/**
 * Rewrites a standalone chart SVG into the CSS subset svg2pdf.js understands, before the PDF
 * renderer hands it over (#580, #581). A browser resolves all of these itself, so the live app and
 * the SVG/PNG exports never need this; svg2pdf re-parses the markup with its own CSS reader instead
 * of reading computed styles, and silently mishandles three things `standalone-svg.ts` uses:
 *
 * - `var(--name, fallback)`: the unresolved text becomes a stroke width and jsPDF throws on `NaN`.
 *   The fallback is exact for the default line weight, which is what every exported chart uses.
 * - `rem` lengths: its `toPixels` understands only `px`, unitless and `em`, and returns 0 for
 *   anything else. Every chart label (`text { font: … 0.68rem … }`, degree labels, house numbers,
 *   matrix names, the elements grid's totals) was drawn at font size 0, so the PDF kept the drawn
 *   symbols and lost every word and number. A stylesheet `font-size` also overrides an element's
 *   own `font-size` attribute, so no per-element size rescued them. `rem` becomes px at the 16px
 *   root size a standalone SVG document has (CSS Values 4, the initial `font-size: medium`).
 * - numeric weights other than 400 and 700: it builds a jsPDF font style such as `550normal`,
 *   which no core font has, and jsPDF warns and falls back. Weights are mapped to the two faces
 *   the core fonts do have the way CSS font matching picks between them (CSS Fonts 4 §5.2: a
 *   desired weight above 500 prefers the heavier face, 500 or below the lighter one).
 */
/**
 * @module ui/pdf-svg-normalize
 * @purpose Rewrites a standalone chart SVG's CSS into the subset svg2pdf.js renders correctly (resolved `var()`, `rem` as px, weights as normal/bold) for the PDF export (#580, #581).
 * @conventions PDF-only and pure string rewriting, kept apart from pdf-export-render.ts so it can be unit-tested (that module's svg2pdf.js import does not load under Vitest). Never changes what the app or the SVG/PNG exports draw.
 * @exports normalizeSvgForPdf, ROOT_FONT_SIZE_PX, pdfFontWeight
 */

/** A standalone SVG document's root font size: CSS's initial `font-size: medium`, 16px. */
export const ROOT_FONT_SIZE_PX = 16;

/** The core-font face CSS font matching would choose for `weight` when only regular and bold exist. */
export function pdfFontWeight(weight: number): 'normal' | 'bold' {
  return weight > 500 ? 'bold' : 'normal';
}

function formatPx(value: number): string {
  // Two decimals, the same precision `svg-primitives.ts` writes coordinates with.
  return `${String(Math.round(value * 100) / 100)}px`;
}

export function normalizeSvgForPdf(markup: string): string {
  return (
    markup
      .replace(/var\(\s*--[\w-]+\s*,\s*([^)]+?)\s*\)/g, '$1')
      .replace(/(?<![\w.-])(\d*\.?\d+)rem\b/g, (_, value: string) => formatPx(parseFloat(value) * ROOT_FONT_SIZE_PX))
      // `font-weight: 550` and the weight leading a `font:` shorthand (`font: 550 10.88px …`).
      .replace(
        /(font-weight\s*:\s*)(\d{3})\b/g,
        (_, prefix: string, weight: string) => prefix + pdfFontWeight(Number(weight)),
      )
      .replace(
        /(font\s*:\s*)(\d{3})(\s)/g,
        (_, prefix: string, weight: string, space: string) => prefix + pdfFontWeight(Number(weight)) + space,
      )
  );
}
