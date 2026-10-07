/**
 * Applies the results of an already-downloaded OpenAI Batch API output file to the corpus's
 * evaluation feedback/tracking state — the manual-recovery counterpart to
 * evaluate-corpus-batch.mjs's own live-fetch path, for when a batch's output file has already
 * been retrieved by hand (e.g. because evaluate-corpus-batch.mjs's own batch-state record
 * survived, but a live getBatch()/extractBatchResults() round-trip through this project's own
 * tooling isn't possible or desired for that run).
 *
 *   npx tsx tools/corpus-gen/apply-batch-output.mjs path/to/batch_output.jsonl --locale=en
 *
 * Mirrors evaluate-corpus-batch.mjs's checkAndApply() terminal/"completed" branch exactly: same
 * majority-vote verdict logic (lib/corpus-evaluation.mjs's majorityVerdict), same
 * feedback/tracking upsert shape, same console output, same cost estimate. The one thing it
 * cannot do is reconstruct a batch's `candidates` order from nothing — an OpenAI batch's
 * `custom_id` values are only positional indices into the array submitted with the job, with no
 * identifying information of their own — so it requires the originating job to still be recorded
 * in tools/corpus-gen/batch-state/evaluate-<locale>.json, found via --batch-id (or auto-selected
 * if that locale has exactly one job on file).
 */
/**
 * @module apply-batch-output
 * @purpose Manual-recovery counterpart to evaluate-corpus-batch.mjs: applies an already-downloaded
 *   OpenAI Batch API output file to the corpus's feedback/tracking state, for when a batch
 *   finished (or was cancelled/failed) but its results were never fetched and applied through
 *   that script's own live-polling path.
 * @conventions CLI: `apply-batch-output.mjs <path-to-batch-output.jsonl> --locale=<locale>
 *   [--batch-id=<id>]`. Makes no OpenAI API calls and incurs no new cost — it only reads a file
 *   the caller already downloaded by hand. Requires the originating job to still be recorded in
 *   tools/corpus-gen/batch-state/evaluate-<locale>.json (found via --batch-id, or auto-selected
 *   when there's exactly one job for that locale); refuses to guess candidate order otherwise.
 *   The batch output file itself is treated as untrusted/inert data — parsed as JSON text only
 *   (via lib/openai-batch.mjs's parseResultLines), never executed or imported. On success,
 *   removes the applied job from batch-state the same way evaluate-corpus-batch.mjs's own
 *   checkAndApply() does for any other terminal job.
 * @exports CLI entry point, no exports.
 */
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { majorityVerdict } from './lib/corpus-evaluation.mjs';
import { parseResultLines } from './lib/openai-batch.mjs';
import { parsePlacementKey } from '../../src/interpretation/schema.ts';
import { readFeedback, writeFeedback, upsertFeedback } from './lib/corpus-feedback.mjs';
import { readTracking, writeTracking, findTracking, upsertTracking } from './lib/eval-tracking.mjs';
import { estimateBatchCostCents, formatCents } from './lib/cost-estimate.mjs';
import { readBatchState, writeBatchState, clearBatchState } from './lib/batch-state.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function identityOf(item) {
  return item.key;
}

const rawArgs = process.argv.slice(2);
function flag(name, fallback) {
  const found = rawArgs.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(
    [
      'Usage: npx tsx tools/corpus-gen/apply-batch-output.mjs <path-to-batch-output.jsonl> --locale=<locale> [--batch-id=<id>]',
      '',
      'Applies an already-downloaded OpenAI Batch API output file, as if it had just been fetched',
      "live by evaluate-corpus-batch.mjs's own --check-only path — the manual-recovery counterpart",
      'to that live-fetch path, for when the file was already retrieved by hand. Makes no OpenAI API',
      'calls and costs nothing; the file is only ever read as text and parsed line-by-line, never',
      'executed or imported.',
      '',
      'Arguments:',
      '  <path-to-batch-output.jsonl>  Required, first positional argument. The OpenAI batch output',
      '                                file, as downloaded by hand.',
      '',
      'Options:',
      '  --locale=<locale>   Required. Which corpus/feedback/tracking state to apply the results to.',
      '  --batch-id=<id>     Which recorded job this output belongs to. Required only when more than',
      '                      one job is on file for --locale; auto-selected when there is exactly one.',
      '',
      'Requires the originating job to still be recorded in',
      "tools/corpus-gen/batch-state/evaluate-<locale>.json — an OpenAI batch's own custom_id values",
      'are only positional indices into the array submitted with the job, carrying no identifying',
      'information of their own, so there is no way to reconstruct candidate order without it.',
      'On success, removes the applied job from that batch-state file, same as a live fetch would.',
    ].join('\n'),
  );
  process.exit(0);
}

const filePath = rawArgs.find((arg) => !arg.startsWith('--'));
const locale = flag('locale');
const batchId = flag('batch-id');

if (!filePath) throw new Error('a path to the batch output file is required (first positional argument)');
if (!locale) throw new Error('--locale=<locale> is required');

const statePath = join(root, 'tools', 'corpus-gen', 'batch-state', `evaluate-${locale}.json`);
const state = await readBatchState(statePath);
const jobs = state?.jobs ?? [];
if (jobs.length === 0) {
  throw new Error(
    `no in-flight job recorded for locale "${locale}" in ${statePath} — this script can only apply ` +
      'results for a job whose batch-state record still exists (it reconstructs candidate order ' +
      "from that record, since the OpenAI output file's custom_id values are only positional " +
      'indices into the array submitted with the job, carrying no identifying information of ' +
      'their own)',
  );
}

let job;
if (batchId) {
  job = jobs.find((candidate) => candidate.batchId === batchId);
  if (!job) {
    throw new Error(
      `no job with batch id "${batchId}" recorded for locale "${locale}" — available: ${jobs
        .map((candidate) => candidate.batchId)
        .join(', ')}`,
    );
  }
} else if (jobs.length === 1) {
  job = jobs[0];
} else {
  throw new Error(
    `locale "${locale}" has ${String(jobs.length)} jobs recorded — pass --batch-id=<id> to pick one: ${jobs
      .map((candidate) => candidate.batchId)
      .join(', ')}`,
  );
}

console.log(`[${locale}] applying local output file for batch ${job.batchId} (${filePath})`);

const corpusPath = join(root, 'src', 'interpretation', 'corpus', `${locale}.json`);
const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
const trackingPath = join(root, 'tools', 'corpus-gen', 'eval-tracking', `${locale}.json`);
const tracking = await readTracking(trackingPath);
const feedbackPath = join(root, 'tools', 'corpus-gen', 'feedback', `${locale}.json`);
const feedback = await readFeedback(feedbackPath);

// The batch output file is untrusted data: it is only ever read as text and parsed line-by-line
// as JSON via parseResultLines — never executed, imported, or required.
const fileText = await readFile(resolve(process.cwd(), filePath), 'utf8');
const results = parseResultLines(fileText);
const byCustomId = new Map(results.map((result) => [result.customId, result]));

const byIdentity = new Map(corpus.map((entry) => [identityOf(entry), entry]));
const candidates = job.candidates.map(({ key }) => {
  const entry = byIdentity.get(identityOf({ key }));
  const placement = entry ? parsePlacementKey(entry.key) : undefined;
  return entry && placement ? { entry, placement } : undefined;
});

let totalClean = 0;
let totalFlagged = 0;
let totalFailed = 0;
let totalCostCents = 0;
let costUnknown = false;

candidates.forEach((candidate, index) => {
  if (candidate === undefined) {
    totalFailed += 1;
    console.error(
      `[${locale}] FAILED ${job.candidates[index].key}: entry no longer resolves against the current corpus`,
    );
    return;
  }
  const { entry } = candidate;
  const ballotIds =
    job.votes === undefined
      ? [String(index)]
      : Array.from({ length: job.votes }, (_, vote) => `${String(index)}:${String(vote)}`);
  const ballots = ballotIds.map((id) => byCustomId.get(id)).filter((ballot) => ballot !== undefined);
  if (ballots.length === 0) {
    totalFailed += 1;
    console.error(`[${locale}] FAILED ${entry.key}: no result came back for this entry`);
    return;
  }
  const valid = ballots.filter((ballot) => !ballot.error);
  if (valid.length === 0) {
    totalFailed += 1;
    console.error(`[${locale}] FAILED ${entry.key}: ${ballots[0].error.message}`);
    return;
  }
  for (const ballot of valid) {
    const costCents = estimateBatchCostCents(job.model, ballot.usage?.prompt_tokens, ballot.usage?.completion_tokens);
    if (costCents === undefined) costUnknown = true;
    else totalCostCents += costCents;
  }
  const verdict = majorityVerdict(valid);
  const result = { result: { correct: verdict.correct, issues: verdict.issues } };
  const existingTracking = findTracking(tracking, entry);
  const now = new Date().toISOString();
  if (result.result.correct === false) {
    totalFlagged += 1;
    upsertFeedback(feedback, {
      key: entry.key,
      locale: entry.locale,
      originalText: entry.text,
      issues: result.result.issues,
      flaggedAt: now,
    });
    upsertTracking(tracking, {
      key: entry.key,
      locale: entry.locale,
      clean: false,
      evaluationCount: existingTracking?.evaluationCount ?? 0,
      updatedAt: now,
    });
    console.log(`[${locale}] FLAGGED ${entry.key}: ${result.result.issues.join(' / ')}`);
  } else {
    totalClean += 1;
    upsertTracking(tracking, {
      key: entry.key,
      locale: entry.locale,
      clean: true,
      evaluationCount: existingTracking?.evaluationCount ?? 0,
      updatedAt: now,
    });
  }
});

await mkdir(dirname(feedbackPath), { recursive: true });
await writeFeedback(feedbackPath, feedback);
await mkdir(dirname(trackingPath), { recursive: true });
await writeTracking(trackingPath, tracking);

console.log(
  `\n[${locale}] evaluation complete: ${String(totalClean + totalFlagged + totalFailed)} checked — ${String(totalClean)} clean, ${String(totalFlagged)} flagged, ${String(totalFailed)} failed`,
);
console.log(
  `[${locale}] estimated cost: ${formatCents(totalCostCents)}${costUnknown ? ' (+ unknown — no batch pricing on file for one or more models)' : ''}`,
);
console.log(`[${locale}] feedback written to ${feedbackPath}`);
console.log(`[${locale}] tracking written to ${trackingPath}`);

const remainingJobs = jobs.filter((candidate) => candidate.batchId !== job.batchId);
if (remainingJobs.length > 0) {
  await writeBatchState(statePath, { jobs: remainingJobs });
} else {
  await clearBatchState(statePath);
}
console.log(`[${locale}] removed batch ${job.batchId} from ${statePath}`);
