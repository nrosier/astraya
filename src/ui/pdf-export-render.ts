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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { svg2pdf } from 'svg2pdf.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import type { PdfPlan } from './pdf-export-plan.js';

const PAGE_MARGIN = 15;

function wrapAndPrint(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 6): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
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
  doc.text(plan.title, PAGE_MARGIN, 40);
  doc.setFontSize(11);
  doc.text(`Generated ${plan.generatedAt.toISOString().slice(0, 10)} by Astraya`, PAGE_MARGIN, 50);

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
      if (section.svg !== undefined) {
        const svgEl = mountSvg(section.svg.markup);
        try {
          const size = Math.min(contentWidth, 160);
          const height = (size * section.svg.height) / section.svg.width;
          await svg2pdf(svgEl, doc, { x: PAGE_MARGIN, y, width: size, height });
          y += height + 6;
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
        doc.text(table.caption, PAGE_MARGIN, y);
        y += 2;
        let finalY = y;
        autoTable(doc, {
          head: [[...table.head]],
          body: table.body.map((row) => [...row]),
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
    doc.text(entry.heading, PAGE_MARGIN, tocY);
    doc.text(String(entry.page), pageWidth - PAGE_MARGIN, tocY, { align: 'right' });
    tocY += 7;
  }

  const blob = doc.output('blob');
  return { blob, filename: deriveExportFilename(plan.personName, 'export', 'pdf') };
}
