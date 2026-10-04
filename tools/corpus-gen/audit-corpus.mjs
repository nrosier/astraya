/**
 * Runs the corpus audit (#427, `lib/corpus-audit.mjs`) over the committed corpus and prints its
 * failures and notes. Exits 1 when there are failures, so the corpus loop can stop on a bad
 * regeneration. Read-only; no API key needed beyond tsx's TypeScript loading.
 *
 *   npm run corpus:audit
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditCorpus } from './lib/corpus-audit.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const corpus = {};
for (const locale of ['en', 'nl']) {
  corpus[locale] = JSON.parse(await readFile(join(root, 'src', 'interpretation', 'corpus', `${locale}.json`), 'utf8'));
}

const { failures, notes } = auditCorpus(corpus);
for (const note of notes) console.log(`note: ${note}`);
for (const failure of failures) console.error(`FAIL: ${failure}`);
console.log(
  failures.length === 0
    ? 'corpus audit passed'
    : `corpus audit found ${String(failures.length)} problem${failures.length === 1 ? '' : 's'}`,
);
process.exit(failures.length === 0 ? 0 : 1);
