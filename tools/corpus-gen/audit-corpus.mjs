/**
 * Runs the corpus audit (#427, `lib/corpus-audit.mjs`) over the committed corpus and prints its
 * failures and notes. Exits 1 when there are failures, so the corpus loop can stop on a bad
 * regeneration. Read-only; no API key needed beyond tsx's TypeScript loading.
 *
 *   npm run corpus:audit
 */
/**
 * @module audit-corpus
 * @purpose Runs the repeatable corpus audit (lib/corpus-audit.mjs) over the committed en/nl corpus
 *   files and reports failures and notes.
 * @conventions Run via `npm run corpus:audit`. Read-only — no API key needed, no network calls.
 *   Exits 1 when there are failures, so the corpus loop/CI can stop on a bad regeneration.
 * @exports CLI entry point, no exports.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditCorpus } from './lib/corpus-audit.mjs';

const rawArgs = process.argv.slice(2);
if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(
    [
      'Usage: npm run corpus:audit',
      '   or: npx tsx tools/corpus-gen/audit-corpus.mjs',
      '',
      'No flags — this script takes none.',
      '',
      'Runs the repeatable corpus audit (lib/corpus-audit.mjs) over both the committed en and nl',
      'corpus files: key shape, locale parity, sign/house index shifts. Read-only — no API key, no',
      'network call, no TypeScript imports beyond what tsx itself needs to load. Prints every',
      'failure and note, then exits 1 if there were any failures, 0 otherwise, so the corpus',
      'loop/CI can stop on a bad regeneration.',
    ].join('\n'),
  );
  process.exit(0);
}

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
