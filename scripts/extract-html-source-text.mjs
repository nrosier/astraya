#!/usr/bin/env node
/**
 * Converts a saved html source page to plain text, for the reference text files that a test reads (#1798).
 *
 * The page is parsed with jsdom, so markup is never matched by pattern. `script` and `style` are removed from the
 * parsed tree, `pre` keeps its column spacing, and other elements become line breaks or tabs by element type. The
 * output is text only: no markup is written.
 *
 * Usage: node scripts/extract-html-source-text.mjs <html> <out-dir> [id]
 * Prints the sha256 of the input to stdout, to check against the `sha256` of the manifest entry in
 * docs/references/sources.json. `id` defaults to the html basename. Writes <id>.txt into <out-dir>.
 *
 * @module
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const BLOCK = /^(p|div|h[1-6]|li|ul|ol|tr|table|caption)$/;
const CELL = /^(td|th)$/;

/** Renders one parsed node to text. `pre` is kept verbatim; block and cell elements get line and tab breaks. */
function render(node) {
  if (node.nodeType === 3) return node.data;
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  if (tag === 'pre') return `\n${node.textContent}\n`;
  if (tag === 'br') return '\n';
  const inner = [...node.childNodes].map(render).join('');
  if (BLOCK.test(tag)) return `${inner}\n`;
  if (CELL.test(tag)) return `${inner}\t`;
  return inner;
}

/** Converts an html document to its visible plain text (whitespace collapsed outside `pre`, trailing spaces trimmed). */
export function htmlToText(html) {
  const doc = new JSDOM(html).window.document;
  for (const el of doc.querySelectorAll('script, style')) el.remove();
  // A non-breaking space is an ordinary space in this text (the reference table is column-aligned with plain spaces).
  const raw = render(doc.body).replace(/\u00a0/g, ' ');
  return (
    raw
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [html, outDir, idArg] = process.argv.slice(2);
  if (html === undefined || outDir === undefined) {
    console.error('Usage: extract-html-source-text.mjs <html> <out-dir> [id]');
    process.exit(2);
  }
  const raw = readFileSync(html);
  const id = idArg ?? basename(html).replace(/\.html?$/i, '');
  console.log(`${createHash('sha256').update(raw).digest('hex')}  ${html}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${id}.txt`), htmlToText(raw.toString('utf8')));
}
