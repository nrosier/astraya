#!/usr/bin/env node
/**
 * Regenerates a reference source's extracted text and page index from its PDF
 * (issue #864). Usage: node scripts/extract-source-text.mjs <pdf> <out-dir> [id]
 * Writes <id>.txt (`=== p. N ===` page markers, `pdftotext -layout` text) and
 * <id>.pages.tsv (`page<TAB>start_line` header, one row per page, 1-based line
 * of each marker). `id` defaults to the PDF basename. Requires `pdftotext`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const [pdf, outDir, idArg] = process.argv.slice(2);
if (pdf === undefined || outDir === undefined) {
  console.error('Usage: extract-source-text.mjs <pdf> <out-dir> [id]');
  process.exit(2);
}
const id = idArg ?? basename(pdf).replace(/\.pdf$/i, '');

const raw = execFileSync('pdftotext', ['-layout', pdf, '-'], {
  encoding: 'utf8',
  maxBuffer: 1 << 30,
});
// pdftotext ends every page with a form feed, so drop the empty tail.
const pages = raw.split('\f').slice(0, -1);

let line = 1;
let text = '';
let index = 'page\tstart_line\n';
pages.forEach((page, i) => {
  const body = page.endsWith('\n') ? page : `${page}\n`;
  text += `=== p. ${String(i + 1)} ===\n${body}`;
  index += `${String(i + 1)}\t${String(line)}\n`;
  line += 1 + body.split('\n').length - 1;
});

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${id}.txt`), text);
writeFileSync(join(outDir, `${id}.pages.tsv`), index);
