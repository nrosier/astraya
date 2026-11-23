#!/usr/bin/env node
/**
 * Regenerates a reference source's extracted text from its saved html original
 * (issue #1798; the html counterpart of extract-source-text.mjs, which reads
 * PDFs only). Usage: node scripts/extract-html-source-text.mjs <html> <out-dir> [id]
 * Writes <id>.txt (the visible text, no page markers: html has no pages) and
 * prints the sha256 of the input html to stdout, to be checked against the
 * `sha256` of the manifest entry in docs/references/sources.json. `id`
 * defaults to the html basename. Uses node built-ins only.
 *
 * Conversion: <script>, <style> and html comments are dropped with their content; <pre> blocks keep their whitespace
 * exactly (the Espenak tables are column-aligned there); elsewhere runs of
 * whitespace collapse, <br> and block tags end a line, and table cells in one
 * row are separated by a tab. Remaining tags are dropped; entities are decoded.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAMED = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", Delta: 'Δ', deg: '°' };

/** Decodes numeric and the common named html entities. */
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return Object.hasOwn(NAMED, e) ? NAMED[e] : m;
  });
}

/** Converts one html fragment outside <pre> to text (whitespace collapsed). */
function inline(fragment) {
  return fragment
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|table|caption)\s*>/gi, '\n')
    .replace(/<\/(td|th)\s*>/gi, '\t')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \r\n\f]+/g, (w) => (w.includes('\n') ? '\n' : ' '))
    .replace(/\n /g, '\n');
}

/** Converts an html document to its visible plain text. */
export function htmlToText(html) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '');
  const parts = clean.split(/(<pre\b[^>]*>[\s\S]*?<\/pre\s*>)/i);
  const out = parts.map((part, i) => {
    if (i % 2 === 1) {
      const body = part
        .replace(/^<pre\b[^>]*>/i, '')
        .replace(/<\/pre\s*>$/i, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '');
      return `\n${decodeEntities(body)}\n`;
    }
    return decodeEntities(inline(part));
  });
  return (
    out
      .join('')
      .split('\n')
      .map((l) => l.replace(/[ \t]+$/, ''))
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
  const id = idArg ?? basename(html).replace(/\.html?$/i, '');
  const raw = readFileSync(html);
  console.log(`${createHash('sha256').update(raw).digest('hex')}  ${html}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${id}.txt`), htmlToText(raw.toString('utf8')));
}
