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
import type { PdfParagraphGroupPlan, PdfPlan } from './pdf-export-plan.js';
import { flowLines, startBlock, type PageFlowArea } from './pdf-page-flow.js';
import { fitSvgOnPage } from './pdf-svg-fit.js';
import { normalizeSvgForPdf } from './pdf-svg-normalize.js';

/** The bottom margin; the sides get `SIDE_MARGIN`, a shorter line that reads more easily (#655). */
const PAGE_MARGIN = 15;
const SIDE_MARGIN = 18;
/** Body text and its line spacing: 10.5 pt on a 5.6 mm line, about 1.5 times the type size (#655). */
const BODY_SIZE = 10.5;
const LINE = 5.6;

/**
 * The app's light-theme colours (`app.css`, `prefers-color-scheme: light`), as jsPDF takes them: a fixed copy, like
 * `standalone-svg.ts`'s palette, since a printed page has no theme (#655). The aspect tones follow `app.css`'s aspect
 * glyph rules: hard for semisquare, square, sesquiquadrate and opposition; soft for conjunction, semisextile, sextile and
 * trine; minor for the quintiles and quincunx.
 */
type Rgb = readonly [number, number, number];
const INK: Rgb = [22, 21, 43];
const MUTED: Rgb = [92, 88, 120];
const ACCENT: Rgb = [91, 63, 212];
const TINT: Rgb = [243, 241, 250];
const RULE: Rgb = [226, 223, 240];
const ASPECT_TONE: Readonly<Record<string, Rgb>> = {
  semisquare: [179, 38, 30],
  square: [179, 38, 30],
  sesquiquadrate: [179, 38, 30],
  opposition: [179, 38, 30],
  conjunction: [24, 87, 196],
  semisextile: [24, 87, 196],
  sextile: [24, 87, 196],
  trine: [24, 87, 196],
  quintile: [10, 77, 40],
  biquintile: [10, 77, 40],
  quincunx: [10, 77, 40],
};
const ALIGN: Readonly<Record<string, 'left' | 'right' | 'center'>> = { start: 'left', end: 'right', center: 'center' };
/** y where content starts on a fresh page — the same 20 mm every page break below already uses. */
const PAGE_TOP = 20;
/** The widest a chart is drawn, even with a whole page free (the width charts were always drawn at before #579). */
const MAX_SVG_WIDTH = 160;
/** Room kept below a table caption for the table's header and first rows: the 30 mm the renderer always left before #665. */
const TABLE_LEAD = 30 - PAGE_MARGIN;

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
  // The minute mark of a sign degree (`21°46′`, #654). WinAnsi has no prime; the apostrophe is the nearest it draws.
  ['′', "'"],
]);

const PDF_UNSAFE_PATTERN = new RegExp(
  [...PDF_UNSAFE_TO_SAFE.keys()].map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'g',
);

/**
 * The fonts embedded so the astrological symbols, the prime of `21°46′`, ℞ and → draw as themselves (#655): DejaVu
 * Sans, subset by `scripts/build-pdf-fonts.sh` and fetched only when a PDF is built.
 */
const EMBEDDED_FAMILY = 'DejaVuSans';
const EMBEDDED_FILES = [
  ['DejaVuSans.ttf', 'normal'],
  ['DejaVuSans-Bold.ttf', 'bold'],
  ['DejaVuSans-Oblique.ttf', 'italic'],
] as const;

/** The four aspect glyphs DejaVu Sans lacks, drawn as their text codes rather than as empty boxes. */
const MISSING_FROM_EMBEDDED: ReadonlyMap<string, string> = new Map(
  (['semisextile', 'sextile', 'quincunx', 'sesquiquadrate'] as const).flatMap((key): [string, string][] => {
    const glyph = ASPECT_UNICODE[key];
    return glyph === undefined ? [] : [[glyph, ASPECT_CODES[key] ?? glyph]];
  }),
);

const MISSING_PATTERN = new RegExp(`[${[...MISSING_FROM_EMBEDDED.keys()].join('')}]`, 'gu');

/** Which family each document draws with: the embedded one once loaded, else the built-in Helvetica. */
const familyOf = new WeakMap<jsPDF, string>();
const family = (doc: jsPDF): string => familyOf.get(doc) ?? 'helvetica';

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/** Embeds the fonts; on any failure (offline, the static demo without them) the document keeps Helvetica and text codes. */
async function embedFonts(doc: jsPDF): Promise<void> {
  try {
    const files = await Promise.all(
      EMBEDDED_FILES.map(async ([file]) => {
        const response = await fetch(`${import.meta.env.BASE_URL}fonts/pdf/${file}`);
        if (!response.ok) throw new Error(`font ${file}: HTTP ${String(response.status)}`);
        return toBase64(await response.arrayBuffer());
      }),
    );
    EMBEDDED_FILES.forEach(([file, style], index) => {
      doc.addFileToVFS(file, files[index] ?? '');
      doc.addFont(file, EMBEDDED_FAMILY, style);
    });
    familyOf.set(doc, EMBEDDED_FAMILY);
  } catch {
    // Helvetica with the WinAnsi-safe codes below, as before #655.
  }
}

/** The text as this document's font can draw it: only DejaVu's four missing aspects swapped, or every non-WinAnsi character under Helvetica. */
function pdfSafeText(doc: jsPDF, text: string): string {
  if (familyOf.has(doc)) return text.replace(MISSING_PATTERN, (char) => MISSING_FROM_EMBEDDED.get(char) ?? char);
  return text.replace(PDF_UNSAFE_PATTERN, (char) => PDF_UNSAFE_TO_SAFE.get(char) ?? char);
}

/** The content area's vertical extent on this document's pages. */
function flowArea(doc: jsPDF): PageFlowArea {
  return { top: PAGE_TOP, bottom: doc.internal.pageSize.getHeight() - PAGE_MARGIN };
}

function splitLines(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(pdfSafeText(doc, text), maxWidth) as string[];
}

/** Prints `text` wrapped to `maxWidth`, continuing on a new page wherever a line would pass the bottom margin (#665). */
function wrapAndPrint(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = LINE): number {
  const lines = splitLines(doc, text, maxWidth);
  const flow = flowLines(lines.length, y, lineHeight, flowArea(doc));
  lines.forEach((line, index) => {
    const placement = flow.lines[index];
    if (placement === undefined) return;
    if (placement.newPage) doc.addPage();
    doc.text(line, x, placement.y);
  });
  return flow.y;
}

/** Starts a fresh page first when the next `needed` mm of baselines would not fit above the bottom margin (#665). */
function keepTogether(doc: jsPDF, y: number, needed: number): number {
  const start = startBlock(y, needed, flowArea(doc));
  if (start.newPage) doc.addPage();
  return start.y;
}

/** Parses a standalone SVG string into a detached `SVGSVGElement`, mounted off-screen so font/text metrics resolve. */
function mountSvg(markup: string): SVGSVGElement {
  // svg2pdf.js reads CSS itself and gets `var()`, `rem` and numeric weights wrong (#580, #581) — see pdf-svg-normalize.ts.
  const parsed = new DOMParser().parseFromString(normalizeSvgForPdf(markup), 'image/svg+xml').documentElement;
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
  await embedFonts(doc);
  doc.setFont(family(doc), 'normal');
  doc.setTextColor(...INK);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - SIDE_MARGIN * 2;
  const font = (style: 'normal' | 'bold' | 'italic', size: number, color: Rgb = INK): void => {
    doc.setFont(family(doc), style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  // Cover page.
  doc.setFontSize(22);
  doc.text(pdfSafeText(doc, plan.title), SIDE_MARGIN, 40);
  doc.setFontSize(11);
  doc.text(`Generated ${utcDay(plan.generatedAt)} by Astraya`, SIDE_MARGIN, 50);

  // Table of contents page: drawn now as a placeholder, filled in with real page numbers once every
  // section's own starting page is known — jsPDF lets a finished document be revisited with setPage.
  doc.addPage();
  const tocPageNumber = doc.internal.pages.length - 1;
  doc.setFontSize(16);
  doc.text('Contents', SIDE_MARGIN, 20);

  const tocEntries: { heading: string; page: number }[] = [];

  for (const section of plan.sections) {
    doc.addPage();
    const startPage = doc.internal.pages.length - 1;
    tocEntries.push({ heading: section.heading, page: startPage });
    let y = 20;
    font('bold', 16);
    y = wrapAndPrint(doc, section.heading, SIDE_MARGIN, y, contentWidth, 7);
    y += 4;
    font('normal', BODY_SIZE);

    if (section.kind === 'fields') {
      // A quiet panel of terms and values (#655), like the screen's `<dl>`: the birth record, the chart overview.
      const termWidth = 42;
      const valueWidth = contentWidth - termWidth - 8;
      const rows = section.fields.map((field) => ({
        term: field.label,
        lines: splitLines(doc, field.value, valueWidth),
      }));
      const height = rows.reduce((sum, row) => sum + Math.max(1, row.lines.length) * LINE, 0) + 6;
      y = keepTogether(doc, y, height);
      doc.setFillColor(...TINT);
      doc.setDrawColor(...RULE);
      doc.roundedRect(SIDE_MARGIN, y - 4, contentWidth, height, 2, 2, 'FD');
      y += 1;
      for (const row of rows) {
        font('normal', BODY_SIZE - 1, MUTED);
        doc.text(pdfSafeText(doc, row.term), SIDE_MARGIN + 4, y);
        font('normal', BODY_SIZE);
        row.lines.forEach((line, index) => doc.text(line, SIDE_MARGIN + 4 + termWidth, y + index * LINE));
        y += Math.max(1, row.lines.length) * LINE;
      }
      y += 4;
    } else if (section.kind === 'text') {
      // How far below its first baseline a paragraph's second line of text is: a label, or a heading
      // above it, is never the last thing on a page (#665).
      const textLead = (text: string): number => (Math.min(2, splitLines(doc, text, contentWidth).length) - 1) * LINE;
      const paragraphLead = (paragraph: PdfParagraphGroupPlan['paragraphs'][number]): number => {
        if (typeof paragraph === 'string') return textLead(paragraph);
        if ('label' in paragraph) return 6 + textLead(paragraph.text);
        return 6 + textLead(`“${paragraph.image}”`);
      };
      for (const group of section.groups) {
        const [first] = group.paragraphs;
        const firstLead = first === undefined ? 0 : paragraphLead(first);
        // A body's sub-heading (#654), once, above the paragraphs that are about it: more room above than below,
        // in the accent colour over a thin rule (#655).
        if (group.body !== undefined) {
          font('bold', 12.5, ACCENT);
          y = keepTogether(doc, y + 4, splitLines(doc, group.body, contentWidth).length * LINE + 4 + firstLead);
          y = wrapAndPrint(doc, group.body, SIDE_MARGIN, y, contentWidth);
          doc.setDrawColor(...RULE);
          doc.setLineWidth(0.3);
          doc.line(SIDE_MARGIN, y - LINE + 1.8, SIDE_MARGIN + contentWidth, y - LINE + 1.8);
          font('normal', BODY_SIZE);
          y += 2;
        }
        for (const paragraph of group.paragraphs) {
          y = keepTogether(doc, y, paragraphLead(paragraph));
          if (typeof paragraph === 'string') {
            y = wrapAndPrint(doc, paragraph, SIDE_MARGIN, y, contentWidth);
          } else if ('label' in paragraph) {
            // The placement this paragraph is about (#654), as a small tinted pill above its text (#655).
            font('normal', 8.5, MUTED);
            const label = pdfSafeText(doc, paragraph.label);
            doc.setFillColor(...TINT);
            doc.roundedRect(SIDE_MARGIN, y - 3.4, doc.getTextWidth(label) + 4, 4.8, 2.4, 2.4, 'F');
            doc.text(label, SIDE_MARGIN + 2, y);
            font('normal', BODY_SIZE);
            y = wrapAndPrint(doc, paragraph.text, SIDE_MARGIN, y + 5.6, contentWidth);
          } else {
            // A Sabian symbol (#653) as a callout (#655): a tinted box with an accent bar, the image in quotation
            // marks, then a small KEY INSIGHT tag over the reading in italics.
            const inner = contentWidth - 8;
            font('normal', BODY_SIZE);
            const imageLines = splitLines(doc, `“${paragraph.image}”`, inner);
            font('italic', BODY_SIZE);
            const insightLines = paragraph.insight === undefined ? [] : splitLines(doc, paragraph.insight, inner);
            const height =
              6 + imageLines.length * LINE + (insightLines.length === 0 ? 0 : 4.5 + insightLines.length * LINE);
            y = keepTogether(doc, y, Math.min(height, pageHeight - PAGE_MARGIN - PAGE_TOP));
            doc.setFillColor(...TINT);
            doc.rect(SIDE_MARGIN, y - 4, contentWidth, height, 'F');
            doc.setFillColor(...ACCENT);
            doc.rect(SIDE_MARGIN, y - 4, 0.9, height, 'F');
            font('normal', BODY_SIZE);
            y = wrapAndPrint(doc, `“${paragraph.image}”`, SIDE_MARGIN + 5, y + 0.5, inner);
            if (paragraph.insight !== undefined) {
              font('bold', 7.5, ACCENT);
              doc.text(pdfSafeText(doc, paragraph.insightLabel.toUpperCase()), SIDE_MARGIN + 5, y + 0.5);
              font('italic', BODY_SIZE);
              y = wrapAndPrint(doc, paragraph.insight, SIDE_MARGIN + 5, y + 5, inner);
            }
            font('normal', BODY_SIZE);
            y += 2;
          }
          y += 2.5;
        }
      }
    } else {
      if (section.hint !== undefined) {
        y = wrapAndPrint(doc, section.hint, SIDE_MARGIN, y, contentWidth);
        y += 4;
      }
      if (section.provenance !== undefined) {
        font('normal', 8, MUTED);
        y = wrapAndPrint(doc, section.provenance, SIDE_MARGIN, y, contentWidth, 4);
        font('normal', BODY_SIZE);
        y += 3;
      }
      if (section.svg !== undefined) {
        // A chart is a fixed-aspect block that cannot be split across a page break (unlike a table):
        // it is scaled to fit what is left of this page, under its heading, and only moved to a fresh
        // page when that would shrink it too far — never drawn past the bottom margin (#446, #579).
        const fit = fitSvgOnPage(section.svg.width, section.svg.height, y, {
          left: SIDE_MARGIN,
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
        // The caption and the table's header and first rows stay on one page (#665).
        y = keepTogether(doc, y, TABLE_LEAD);
        font('bold', 11);
        doc.text(pdfSafeText(doc, table.caption), SIDE_MARGIN, y);
        font('normal', BODY_SIZE);
        y += 2;
        let finalY = y;
        // Numbers line up at the end, as on screen; the header in the accent colour, rows lightly striped; an aspect's
        // name tinted by its family, always beside the name, never instead of it (#655).
        const aspects = table.aspects;
        autoTable(doc, {
          head: [table.head.map((cell) => pdfSafeText(doc, cell))],
          body: table.body.map((row) => row.map((cell) => pdfSafeText(doc, cell))),
          startY: y,
          margin: { left: SIDE_MARGIN, right: SIDE_MARGIN },
          styles: { fontSize: 8, font: family(doc), textColor: [...INK], lineColor: [...RULE] },
          headStyles: { fillColor: [...ACCENT], textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [...TINT] },
          columnStyles: Object.fromEntries(
            table.align.map((align, index) => [index, { halign: ALIGN[align] ?? 'left' }]),
          ),
          didParseCell: (data) => {
            // A header sits over its column: right-aligned over numbers too.
            if (data.section === 'head')
              data.cell.styles.halign = ALIGN[table.align[data.column.index] ?? 'start'] ?? 'left';
            if (aspects === undefined || data.section !== 'body' || data.column.index !== aspects.column) return;
            const tone = ASPECT_TONE[aspects.keys[data.row.index] ?? ''];
            if (tone !== undefined) data.cell.styles.textColor = [...tone];
          },
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
    doc.text('Not included', SIDE_MARGIN, 20);
    doc.setFontSize(10);
    let y = 30;
    for (const message of plan.errors) y = wrapAndPrint(doc, `• ${message}`, SIDE_MARGIN, y, contentWidth);
  }

  // Back-fill the table of contents, now that every section's real page number is known.
  doc.setPage(tocPageNumber);
  let tocY = 32;
  doc.setFontSize(11);
  for (const entry of tocEntries) {
    doc.text(pdfSafeText(doc, entry.heading), SIDE_MARGIN, tocY);
    doc.text(String(entry.page), pageWidth - SIDE_MARGIN, tocY, { align: 'right' });
    tocY += 7;
  }

  const blob = doc.output('blob');
  return { blob, filename: deriveExportFilename(plan.personName, 'export', 'pdf') };
}
