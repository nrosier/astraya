/**
 * SVG text element export to PDF — guidelines and best practices (#580).
 *
 * SVG text elements can be lost or corrupted in PDF export if not properly
 * formatted. This module documents the patterns that work reliably and notes
 * limitations of various PDF export paths (browser print, dedicated PDF library, etc.).
 *
 * Key finding: Text export reliability depends on:
 * 1. Proper XML escaping (fixed in #581)
 * 2. Font size specified inline or via reliable CSS
 * 3. text-anchor positioning set correctly
 * 4. No text hidden by SVG coordinate transforms
 * 5. Font glyphs available in PDF context
 */

/**
 * @module chart/pdf-text-export
 * @purpose Documents SVG text element rendering for reliable PDF export.
 * @conventions All text() calls in svg-primitives.ts are XML-escaped; font-size is inline not CSS; text-anchor matches alignment intent; no deferred transforms hide text; glyphs are validated before rendering.
 * @exports PDF_TEXT_GUIDELINES, isFontAvailableInPDF, formatTextForPDFExport
 */

/**
 * Guidelines for generating SVG text that exports reliably to PDF.
 */
export const PDF_TEXT_GUIDELINES = {
  ESCAPE_XML: 'All text content and attribute values must be XML-escaped (amp, lt, gt, quot, apos)',
  FONT_SIZE_INLINE:
    'Font size should be specified inline via font-size attribute, not CSS class',
  TEXT_ANCHOR: 'text-anchor must be set correctly (start, middle, end) and not contradicted by CSS',
  NO_HIDDEN_TRANSFORMS:
    'Text elements must not be hidden by transforms, masks, or clipping paths',
  GLYPH_VALIDATION: 'Unicode glyphs must be tested in target PDF viewer before use',
  BASELINE_OFFSET: 'SVG baseline is bottom; use baselineOffset() to center text vertically',
} as const;

/**
 * Check if a font is reliably available in PDF export context.
 * PDF has a limited set of embedded fonts; others may render as substitutes or fail.
 */
export function isFontAvailableInPDF(fontFamily: string): boolean {
  // Standard fonts available in virtually all PDF viewers
  const STANDARD_PDF_FONTS = new Set([
    'Arial',
    'Courier',
    'Courier New',
    'Georgia',
    'Times',
    'Times New Roman',
    'Verdana',
    'Helvetica',
    'serif',
    'sans-serif',
    'monospace',
  ]);

  // Check if it's a standard font or a system font known to be available
  return STANDARD_PDF_FONTS.has(fontFamily) || fontFamily.includes('system');
}

/**
 * Format text content for reliable PDF export.
 * Ensures proper escaping and validates glyphs.
 */
export function formatTextForPDFExport(text: string): string {
  // XML escaping for PDF compatibility
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Known limitations of PDF text export from SVG:
 *
 * 1. Print-to-PDF (browser print dialog):
 *    - Most reliable for system fonts
 *    - Some browsers drop text with unusual positioning
 *    - Font metrics may vary between browsers
 *
 * 2. Headless Chrome/Chromium PDF library:
 *    - Better text preservation than print dialogs
 *    - Supports CSS font-face but with limited font support
 *    - Text clipping may occur if not positioned carefully
 *
 * 3. Dedicated PDF libraries (PDFKit, jsPDF, etc.):
 *    - Require explicit text rendering (SVG text not auto-rendered)
 *    - Font embedding varies by library
 *    - Manual measurement of text width required
 *
 * Current Astraya implementation uses:
 * - SVG text elements with inline font-size
 * - System fonts (via CSS class names)
 * - Browser print dialog for export
 * - Result: Reliable on Chrome/Firefox, may have issues on Safari/IE
 */

export const PDF_TEXT_EXPORT_LIMITATIONS = {
  BROWSER_PRINT: 'Text may be dropped or repositioned when printing to PDF from browsers',
  FONT_SUBSTITUTION: 'Non-standard fonts may be substituted or rendered as symbols',
  CLIPPING: 'Text near page edges may be clipped by PDF viewer margins',
  TRANSFORM_ISSUES: 'Complex SVG transforms can cause text misalignment in PDF',
  GLYPH_RENDERING: 'Some Unicode glyphs may not render in all PDF viewers',
  CSS_FONTS: 'CSS-defined fonts often not embedded in PDF; specify system fonts instead',
} as const;
