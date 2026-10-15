/**
 * The PDF export builder's renderer (#441): draws a finished `PdfPlan` (`pdf-export-plan.ts`) into an
 * actual PDF file with jsPDF, svg2pdf.js (for the chart wheels, kept vector rather than rasterized)
 * and jspdf-autotable (for the tables). Browser-only — covered end to end by Playwright rather than
 * under Vitest, which does not resolve svg2pdf.js's own ESM build the way a real browser bundle does
 * (see `pdf-export-plan.ts`'s own doc comment) — and loaded only when a PDF is actually being built
 * (`PdfExportBuilder.tsx`'s dynamic `import()`), so these three libraries never enter the app's eager
 * bundle (`scripts/check-bundle-size.mjs` only measures that graph, the same way the ephemeris engine
 * and the admin panel already stay out of it).
 */
/**
 * @module ui/pdf-export-render
 * @purpose Renders a finished `PdfPlan` (pdf-export-plan.ts) into an actual PDF document, drawing chart wheels as vector SVG and tables via autotable, for the PDF export feature (#441).
 * @conventions Browser-only — depends on jsPDF/svg2pdf.js/jspdf-autotable, which cannot be imported under Vitest (svg2pdf.js's ESM build does not resolve there), so this is covered by Playwright instead and loaded only via PdfExportBuilder.tsx's dynamic import() to keep these three libraries out of the eager bundle (scripts/check-bundle-size.mjs). Astrological glyphs are substituted with WinAnsi-safe text codes before drawing since jsPDF's core fonts can't render arbitrary Unicode.
 * @exports renderPdfPlan
 */
import { utcDay } from './format.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { svg2pdf } from 'svg2pdf.js';
import {
  ASPECT_CODES,
  ASPECT_UNICODE,
  BODY_CODES,
  BODY_UNICODE,
  SIGN_CODES,
  SIGN_UNICODE,
} from '../chart/symbol-text.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import type { PdfPlan } from './pdf-export-plan.js';
import { fitSvgOnPage } from './pdf-svg-fit.js';

const PAGE_MARGIN = 15;
/** y where content starts on a fresh page — the same 20 mm every page break below already uses. */
const PAGE_TOP = 20;
/** The widest a chart is drawn, even with a whole page free (the width charts were always drawn at before #579). */
const MAX_SVG_WIDTH = 160;

/**
 * jsPDF's standard built-in fonts (the core PDF fonts, e.g. Helvetica) only cover the WinAnsi
 * encoding, not arbitrary Unicode — the astrological body/sign/aspect glyphs (`symbol-text.ts`'s
 * `*_UNICODE` tables), the retrograde mark ℞, and the dispositor chain's → separator
 * (`ChartView.tsx`) all fall outside it. A character outside the font's encoding doesn't throw —
 * it silently maps to whatever glyph that byte happens to mean in the font's table, which is why
 * these show up as `!` or other unrelated characters instead of erroring. The live app, the CSV
 * download and the SVG/PNG export never hit this (a browser's own font stack handles Unicode
 * fine) — only jsPDF's plain-text drawing does. `symbol-text.ts` already has a WinAnsi-safe
 * three-letter code for every body/sign/aspect (the same ones the 'text' symbol-class preference
 * uses, #419), so those are reused here rather than inventing a second mapping.
 */
const PDF_UNSAFE_TO_SAFE: ReadonlyMap<string, string> = new Map([
  ...Object.entries(BODY_UNICODE).map(([key, glyph]): [string, string] => [glyph, BODY_CODES[key] ?? glyph]),
  ...Object.entries(SIGN_UNICODE).map(([key, glyph]): [string, string] => [glyph, SIGN_CODES[key] ?? glyph]),
  ...Object.entries(ASPECT_UNICODE).map(([key, glyph]): [string, string] => [glyph, ASPECT_CODES[key] ?? glyph]),
  ['℞', 'Rx'],
  ['→', '->'],
]);

const PDF_UNSAFE_PATTERN = new RegExp(
  [...PDF_UNSAFE_TO_SAFE.keys()].map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'g',
);

/** Substitutes every character jsPDF's standard fonts can't draw with its WinAnsi-safe text code. */
function pdfSafeText(text: string): string {
  return text.replace(PDF_UNSAFE_PATTERN, (char) => PDF_UNSAFE_TO_SAFE.get(char) ?? char);
}

function wrapAndPrint(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 6): number {
  const lines = doc.splitTextToSize(pdfSafeText(text), maxWidth) as string[];
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

/**
 * svg2pdf.js's own CSS parser does not resolve `var(--name, fallback)` (used by `standalone-svg.ts` for the
 * drawn symbols' line weight, #419): it hands the unresolved text on to jsPDF as a stroke width, which throws
 * `jsPDF.scale: Invalid argument` the moment it tries to scale `NaN`. The live app and the SVG/PNG export never
 * hit this — a browser's own CSS engine resolves it before anything is drawn — only this one path does, since
 * svg2pdf re-parses the markup itself rather than reading computed styles. Substituting the fallback is exact
 * for the default (regular) line weight, which is what every exported chart uses here regardless of the device
 * preference it was set to — a smaller scope cut than resolving each element's own inline override, left for later.
 */
function resolveCssVariables(markup: string): string {
  return markup.replace(/var\(\s*--[\w-]+\s*,\s*([^)]+?)\s*\)/g, '$1');
}

/** Parses a standalone SVG string into a detached `SVGSVGElement`, mounted off-screen so font/text metrics resolve. */
function mountSvg(markup: string): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(resolveCssVariables(markup), 'image/svg+xml').documentElement;
  const el = parsed as unknown as SVGSVGElement;
  el.style.position = 'fixed';
  el.style.left = '-99999px';
  el.style.top = '0';
  document.body.append(el);
  return el;
}

/**
 * Draws `plan` into a jsPDF document and returns it as a `Blob` plus a filename. Browser-only (DOM,
 * jsPDF, svg2pdf.js, jspdf-autotable); covered end to end rather than under Vitest/jsdom, which does
 * not resolve svg2pdf.js's own ESM build the way a real browser bundle does.
 */
export async function renderPdfPlan(plan: PdfPlan): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  // Cover page.
  doc.setFontSize(22);
  doc.text(pdfSafeText(plan.title), PAGE_MARGIN, 40);
  doc.setFontSize(11);
  doc.text(`Generated ${utcDay(plan.generatedAt)} by Astraya`, PAGE_MARGIN, 50);

  // Table of contents page: drawn now as a placeholder, filled in with real page numbers once every
  // section's own starting page is known — jsPDF lets a finished document be revisited with setPage.
  doc.addPage();
  const tocPageNumber = doc.internal.pages.length - 1;
  doc.setFontSize(16);
  doc.text('Contents', PAGE_MARGIN, 20);

  const tocEntries: { heading: string; page: number }[] = [];

  for (const section of plan.sections) {
    doc.addPage();
    const startPage = doc.internal.pages.length - 1;
    tocEntries.push({ heading: section.heading, page: startPage });
    let y = 20;
    doc.setFontSize(16);
    y = wrapAndPrint(doc, section.heading, PAGE_MARGIN, y, contentWidth, 7);
    y += 4;
    doc.setFontSize(10);

    if (section.kind === 'fields') {
      for (const field of section.fields)
        y = wrapAndPrint(doc, `${field.label}: ${field.value}`, PAGE_MARGIN, y, contentWidth);
    } else if (section.kind === 'text') {
      for (const paragraph of section.paragraphs) {
        if (y > pageHeight - PAGE_MARGIN) {
          doc.addPage();
          y = 20;
        }
        y = wrapAndPrint(doc, paragraph, PAGE_MARGIN, y, contentWidth);
        y += 3;
      }
    } else {
      if (section.hint !== undefined) {
        y = wrapAndPrint(doc, section.hint, PAGE_MARGIN, y, contentWidth);
        y += 4;
      }
      if (section.provenance !== undefined) {
        doc.setFontSize(8);
        y = wrapAndPrint(doc, section.provenance, PAGE_MARGIN, y, contentWidth, 4);
        doc.setFontSize(10);
        y += 3;
      }
      if (section.svg !== undefined) {
        // A chart is a fixed-aspect block that cannot be split across a page break (unlike a table):
        // it is scaled to fit what is left of this page, under its heading, and only moved to a fresh
        // page when that would shrink it too far — never drawn past the bottom margin (#446, #579).
        const fit = fitSvgOnPage(section.svg.width, section.svg.height, y, {
          left: PAGE_MARGIN,
          contentWidth,
          maxWidth: MAX_SVG_WIDTH,
          top: PAGE_TOP,
          bottom: pageHeight - PAGE_MARGIN,
        });
        if (fit.newPage) doc.addPage();
        const svgEl = mountSvg(section.svg.markup);
        try {
          await svg2pdf(svgEl, doc, { x: fit.x, y: fit.y, width: fit.width, height: fit.height });
          y = fit.y + fit.height + 6;
        } finally {
          svgEl.remove();
        }
      }
      for (const table of section.tables) {
        if (y > pageHeight - 30) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(11);
        doc.text(pdfSafeText(table.caption), PAGE_MARGIN, y);
        y += 2;
        let finalY = y;
        autoTable(doc, {
          head: [table.head.map(pdfSafeText)],
          body: table.body.map((row) => row.map(pdfSafeText)),
          startY: y,
          margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
          styles: { fontSize: 8 },
          didDrawPage: (data) => {
            finalY = data.cursor?.y ?? finalY;
          },
        });
        y = finalY + 8;
      }
    }
  }

  if (plan.errors.length > 0) {
    doc.addPage();
    doc.setFontSize(14);
    doc.text('Not included', PAGE_MARGIN, 20);
    doc.setFontSize(10);
    let y = 30;
    for (const message of plan.errors) y = wrapAndPrint(doc, `• ${message}`, PAGE_MARGIN, y, contentWidth);
  }

  // Back-fill the table of contents, now that every section's real page number is known.
  doc.setPage(tocPageNumber);
  let tocY = 32;
  doc.setFontSize(11);
  for (const entry of tocEntries) {
    doc.text(pdfSafeText(entry.heading), PAGE_MARGIN, tocY);
    doc.text(String(entry.page), pageWidth - PAGE_MARGIN, tocY, { align: 'right' });
    tocY += 7;
  }

  const blob = doc.output('blob');
  return { blob, filename: deriveExportFilename(plan.personName, 'export', 'pdf') };
}
