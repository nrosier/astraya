/**
 * #381 stage 1 of 2: an independent second opinion on the Gemini-generated corpus, via OpenAI's
 * Batch API, judged against both fact-grounding and the "generic trope / stereotyped shadow"
 * failure mode #379/#380's own generator prompt work exists to prevent — see
 * lib/corpus-evaluation.mjs's own doc comment for the full rubric and the real 4-model accuracy
 * comparison that picked gpt-6-luna as this script's default.
 *
 * Writes every entry the judge flags (not every entry checked — only the ones with a real
 * concern) to tools/corpus-gen/feedback/<locale>.json, one record per flagged entry: its key,
 * original text, and the judge's own specific issues. Never touches the corpus itself
 * — this script is read-only against src/interpretation/corpus/<locale>.json; see
 * improve-corpus-batch.mjs for the half that acts on this file.
 *
 * Tracks per-entry evaluation-loop state in tools/corpus-gen/eval-tracking/<locale>.json
 * (lib/eval-tracking.mjs): an entry judged clean *here* is skipped on every future run —
 * re-checking something this script's own judge already found fine just re-pays for the same
 * judgment. A flagged entry stays eligible for re-checking through improve-corpus-batch.mjs's
 * review (whether that review rewrites it or declines to) until it has gone through
 * `--evaluation-limit` rounds (default 2) without this script ever agreeing it's clean — then
 * it is left alone, flagged or not, so the loop can't run forever on an entry the two models
 * keep disagreeing about. `--force` bypasses this tracking entirely and re-evaluates everything
 * selected by `--locale`/`--limit`, same as before this tracking existed.
 *
 * Submit-and-exit, not submit-and-block: a batch job can legitimately take OpenAI up to 24h, so
 * this script never sits in a poll loop. Every run first checks every job already recorded in
 * tools/corpus-gen/batch-state/evaluate-<locale>.json — a *list*, since more than one batch can
 * be in flight for the same locale at once (e.g. run back to back to parallelize throughput). For
 * each: a still-running job is reported and left on the list; a finished one has its results
 * retrieved and applied (same as before), then drops off the list. Whatever's left genuinely
 * eligible after that — with anything a still-running job already covers subtracted out, so the
 * same entry is never judged by two jobs at once — is submitted as a new batch (unless
 * `--check-only` is passed, which only checks/applies and never submits). Either way the script
 * exits immediately after; there's no need to keep a terminal open or a process alive across the
 * wait. Run it again (same `--locale`) whenever it's convenient to check.
 *
 * A `failed`/`cancelled`/`expired` batch is still read for whatever it has: OpenAI can leave a
 * real, partial `output_file_id` behind for every request that completed before it stopped (seen
 * on a real cancelled batch, #381: 749/750 done, output file populated) — those results are
 * extracted and applied exactly like a cleanly completed batch, nothing is thrown away just
 * because of how the batch ended. Only once that batch has nothing extractable at all (no output
 * file and no error file — e.g. cancelled before a single request ran), or a job is orphaned
 * (OpenAI no longer recognizes the batch id) or stalled past `--stall-threshold-minutes` with no
 * progress, does this script fall back to just *reporting* the problem, leaving the affected
 * entries' tracking state exactly as it was — nothing requeued. Pass `--reset` to actually drop
 * that job and put its entries back to pending so they're picked up for resubmission on this same
 * run. `--stall-threshold-minutes` itself only controls when a batch is *reported* as stalled —
 * on its own it never abandons anything, `--reset` does.
 *
 * `--check-only` without `--locale` widens this to every locale that has a batch-state file at
 * all: it scans tools/corpus-gen/batch-state/evaluate-*.json, reports which locale has which
 * batch running (and still applies any that happen to have finished), without needing to know in
 * advance which locale(s) you're waiting on. `--locale` stays required for every other mode,
 * since submitting a new batch always has to be against one specific corpus.
 *
 * `--batch=<id>` checks one specific OpenAI batch id instead of every job on file for the locale:
 * useful to recheck a single job without disturbing the stall tracking of any others still in
 * flight. If the id is already recorded in this locale's batch-state file, its candidate list is
 * read straight from there, same as the normal flow. If it isn't — the state file was lost,
 * cleared, or never written for this job — this falls back to asking OpenAI directly for the
 * batch and, if found, assumes it belongs to the given `--locale` (a batch id itself carries no
 * locale) and re-derives its candidate list from the batch's own input file instead of giving up.
 * If that batch isn't finished/cancelled/failed yet, it's just reported, same as the normal flow;
 * once it is, its results are imported and parsed the same way. Implies check-only (it never
 * submits a new batch), and still requires `--locale`.
 *
 * Prints an estimated total cost on completion, from each result's own token usage and
 * lib/cost-estimate.mjs's batch-tier pricing table — an estimate for visibility, not a billing
 * record.
 *
 * Batch mode (OpenAI Batch API) is the default, since the whole point of this feature is to run
 * the ChatGPT side cheaply at corpus scale. `--sync` is a small escape hatch, not a second normal
 * mode: it skips the submit-and-poll dance entirely and calls OpenAI's regular Chat Completions
 * endpoint directly, once per vote, waiting for every answer before exiting. It exists to rescue a
 * handful of entries a real batch job has gone stuck/stalled on (recheck with `--check-only`
 * first, then `--reset` to release them back to pending) without re-entering OpenAI's batch queue
 * — it is billed at OpenAI's standard synchronous rate, not the Batch API's 50% discount, so it
 * should stay scoped with `--limit` to a small rescue run, never used for a full-corpus pass.
 * `--sync` never touches batch-state (nothing is submitted) and applies its results immediately,
 * the same majority-vote/feedback/tracking logic a finished batch's results go through.
 *
 *   npx tsx --env-file=.env.local tools/corpus-gen/evaluate-corpus-batch.mjs --locale=en [--limit=N] [--model=<name>] [--evaluation-limit=N] [--votes=N] [--force] [--reset] [--check-only]
 *   npx tsx --env-file=.env.local tools/corpus-gen/evaluate-corpus-batch.mjs --locale=en --batch=<batch-id>   (check/import one specific job)
 *   npx tsx --env-file=.env.local tools/corpus-gen/evaluate-corpus-batch.mjs --check-only   (checks every locale with a batch in flight)
 *   npx tsx --env-file=.env.local tools/corpus-gen/evaluate-corpus-batch.mjs --locale=en --limit=5 --sync   (rescue a few entries synchronously, standard-tier pricing)
 */
/**
 * @module evaluate-corpus-batch
 * @purpose #381 stage 1 of 2: submits/checks an OpenAI Batch API job giving the corpus an
 *   independent second opinion (fact-grounding + "generic trope" detection), writing flagged
 *   entries to tools/corpus-gen/feedback/<locale>.json for improve-corpus-batch.mjs to act on.
 * @conventions CLI flags: --locale=<locale> (required unless --check-only with no --locale, or
 *   with --batch which always requires it), --limit=N, --model=<name> (default gpt-6-luna),
 *   --evaluation-limit=N (default 2), --votes=N (default 3), --force, --recheck-exhausted,
 *   --check-only, --batch=<id>, --reset, --stall-threshold-minutes=N, --sync (rescue-run escape
 *   hatch: calls OpenAI's standard synchronous endpoint instead of submitting a batch job; billed
 *   at standard, not batch-discounted, rates — scope with --limit). A failed/cancelled/expired
 *   batch still has its partial results extracted and applied if it has any; only a job with
 *   nothing usable left (orphaned, stalled, or terminal with no extractable results at all) is
 *   just reported, never requeued, unless --reset is also passed; --stall-threshold-minutes only
 *   controls when stalled is *reported*, never abandonment on its own. Costs real OpenAI Batch
 *   API money.
 *   Submit-and-exit, never blocks — batch state (possibly several jobs per locale) is persisted
 *   to tools/corpus-gen/batch-state/evaluate-<locale>.json and per-entry loop state to
 *   tools/corpus-gen/eval-tracking/<locale>.json; re-run the same command later to check status
 *   and apply results.
 * @exports CLI entry point, no exports.
 */
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvaluationPrompt, EVALUATION_RESPONSE_SCHEMA, majorityVerdict } from './lib/corpus-evaluation.mjs';
import {
  buildBatchRequest,
  submitBatch,
  getBatch,
  isBatchTerminal,
  extractBatchResults,
  detectStalledBatch,
  downloadFile,
  callChatCompletionSync,
} from './lib/openai-batch.mjs';
import { factsDescription } from './lib/placements.mjs';
import { parsePlacementKey } from '../../src/interpretation/schema.ts';
import { readFeedback, writeFeedback, upsertFeedback } from './lib/corpus-feedback.mjs';
import {
  readTracking,
  writeTracking,
  findTracking,
  upsertTracking,
  isEvaluationExhausted,
} from './lib/eval-tracking.mjs';
import { estimateCostCentsForCall, formatCents } from './lib/cost-estimate.mjs';
import { readBatchState, writeBatchState, clearBatchState } from './lib/batch-state.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function identityOf(item) {
  return item.key;
}

/**
 * Applies one set of results (from a finished batch job, or from `--sync`'s direct calls — same
 * `{ customId, result|error, usage }` shape either way) to tracking/feedback: majority vote
 * (#437) across `votesCount` ballots per entry, cost estimate from each ballot's own token usage,
 * then upserts clean/flagged tracking and, for a flagged entry, feedback for
 * improve-corpus-batch.mjs to act on. Shared by checkAndApply's finished-batch path (`costTier:
 * 'batch'`) and the `--sync` rescue path (`costTier: 'standard'`, since a direct Chat Completions
 * call never gets the Batch API's 50% discount) — only the pricing table differs between them.
 */
function applyBallotResults({
  loc,
  candidateKeys,
  resolvedCandidates,
  results,
  model,
  votesCount,
  tracking,
  feedback,
  costTier,
}) {
  const byCustomId = new Map(results.map((r) => [r.customId, r]));
  let totalClean = 0;
  let totalFlagged = 0;
  let totalFailed = 0;
  let totalCostCents = 0;
  let costUnknown = false;

  resolvedCandidates.forEach((candidate, index) => {
    if (candidate === undefined) {
      totalFailed += 1;
      console.error(`[${loc}] FAILED ${candidateKeys[index].key}: entry no longer resolves against the current corpus`);
      return;
    }
    const { entry } = candidate;
    // Majority vote (#437): the judge's "generic trope" call is subjective and noisy — re-judging the same
    // entry flips it — so each entry is judged `votesCount` times and flagged only when most ballots flag it.
    // A job from before voting (no `votesCount`) has one ballot, under the plain index as its custom id.
    const ballotIds =
      votesCount === undefined
        ? [String(index)]
        : Array.from({ length: votesCount }, (_, vote) => `${String(index)}:${String(vote)}`);
    const ballots = ballotIds.map((id) => byCustomId.get(id)).filter((ballot) => ballot !== undefined);
    if (ballots.length === 0) {
      totalFailed += 1;
      console.error(`[${loc}] FAILED ${entry.key}: no result came back for this entry`);
      return;
    }
    const valid = ballots.filter((ballot) => !ballot.error);
    if (valid.length === 0) {
      totalFailed += 1;
      console.error(`[${loc}] FAILED ${entry.key}: ${ballots[0].error.message}`);
      return;
    }
    for (const ballot of valid) {
      const costCents = estimateCostCentsForCall({
        provider: 'openai',
        model,
        tier: costTier,
        promptTokens: ballot.usage?.prompt_tokens,
        outputTokens: ballot.usage?.completion_tokens,
      });
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
      console.log(`[${loc}] FLAGGED ${entry.key}: ${result.result.issues.join(' / ')}`);
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

  return { totalClean, totalFlagged, totalFailed, totalCostCents, costUnknown };
}

/**
 * Rebuilds a `--batch=<id>` job's own `{ batchId, submittedAt, model, votes, candidates }` shape
 * straight from OpenAI's own input file, for an id that isn't (or no longer is) recorded in this
 * locale's batch-state file — e.g. the state file was lost, cleared, or never written for this
 * job. Candidate identity isn't carried on the batch itself (`custom_id` is only this submission's
 * own positional `index:vote`, per buildBatchRequest), so this re-derives it by matching each
 * index's own request body back to a corpus entry via the exact "ENTRY TEXT: " content
 * buildEvaluationPrompt embeds — the only identifying string OpenAI actually has on file. An
 * index whose text no longer matches any current corpus entry (e.g. the entry was edited or
 * removed since submission) comes back with no key, same as any other candidate that fails to
 * resolve against the current corpus elsewhere in this script.
 */
async function reconstructJobFromBatch({ batch, corpus }) {
  if (!batch.input_file_id) throw new Error(`batch ${batch.id} has no input_file_id to reconstruct candidates from`);
  const inputText = await downloadFile({ apiKey: process.env.OPENAI_API_KEY, fileId: batch.input_file_id });
  const requests = inputText
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
  if (requests.length === 0) throw new Error(`batch ${batch.id}'s input file has no requests to reconstruct from`);

  const byIndex = new Map();
  for (const request of requests) {
    const index = Number(String(request.custom_id).split(':')[0]);
    if (!byIndex.has(index)) byIndex.set(index, []);
    byIndex.get(index).push(request);
  }
  const maxIndex = Math.max(...byIndex.keys());
  const byText = new Map(corpus.map((entry) => [entry.text, entry]));
  const candidates = [];
  for (let index = 0; index <= maxIndex; index++) {
    const forIndex = byIndex.get(index) ?? [];
    const userContent = forIndex[0]?.body?.messages?.find((message) => message.role === 'user')?.content ?? '';
    const match = /ENTRY TEXT: ([\s\S]*?)(?:\n\nOn a previous review|$)/.exec(userContent);
    const entry = match ? byText.get(match[1]) : undefined;
    candidates.push({ key: entry?.key }); // key undefined → naturally unresolved below, same as a stale entry
  }

  return {
    batchId: batch.id,
    submittedAt: batch.created_at ? new Date(batch.created_at * 1000).toISOString() : 'unknown',
    model: requests[0]?.body?.model,
    votes: byIndex.get(0)?.length ?? 1,
    candidates,
  };
}

const rawArgs = process.argv.slice(2);
function flag(name, fallback) {
  const found = rawArgs.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}
if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(
    'Usage: npx tsx --env-file=.env.local tools/corpus-gen/evaluate-corpus-batch.mjs --locale=en [--limit=N] [--model=<name>] [--evaluation-limit=N] [--votes=N] [--force] [--recheck-exhausted] [--reset] [--stall-threshold-minutes=N] [--check-only]',
  );
  console.log(
    '       npx tsx --env-file=.env.local tools/corpus-gen/evaluate-corpus-batch.mjs --locale=en --batch=<batch-id> [--reset]   (check/import one specific job)',
  );
  console.log(
    '       npx tsx --env-file=.env.local tools/corpus-gen/evaluate-corpus-batch.mjs --check-only   (checks every locale with a batch in flight)',
  );
  console.log('');
  console.log('Options:');
  console.log('  --locale=<locale>             Which corpus locale to evaluate/check (e.g. en, nl). Required unless');
  console.log('                                --check-only is used with no --locale (checks every locale), or');
  console.log('                                --batch is given (that always requires --locale too — a batch id');
  console.log("                                alone doesn't say which locale's batch-state file it belongs to).");
  console.log('  --limit=N                     Cap how many eligible entries are submitted in a new batch. Default:');
  console.log('                                unlimited.');
  console.log('  --model=<name>                Which OpenAI model judges each entry. Default: gpt-6-luna.');
  console.log('  --votes=N                     How many times each entry is judged; flagged only when most votes');
  console.log('                                flag it (#437). Default: 3.');
  console.log('  --evaluation-limit=N          How many evaluate/improve rounds an entry gets before it stops being');
  console.log('                                re-queued, even unresolved. Default: 2.');
  console.log('  --force                       Re-evaluate every selected entry, ignoring tracked clean/exhausted');
  console.log('                                state entirely.');
  console.log('  --recheck-exhausted           Re-evaluate only entries improve-corpus-batch.mjs just gave a');
  console.log('                                one-time --last-resort revision to (#396), instead of the normal');
  console.log('                                selection.');
  console.log('  --check-only                  Only check/apply jobs already on file; never submit a new batch.');
  console.log('  --batch=<id>                  Check/import one specific OpenAI batch id instead of every job on');
  console.log("                                file for this locale. Normally read from this locale's batch-state");
  console.log('                                file; if not recorded there, falls back to asking OpenAI directly');
  console.log('                                and assumes it belongs to --locale. Implies --check-only; still');
  console.log('                                requires --locale.');
  console.log('  --reset                       Actually drop a job that has nothing usable left (orphaned, stalled');
  console.log('                                past the threshold, or finished failed/cancelled/expired with no');
  console.log('                                extractable results at all) and put its entries back to pending for');
  console.log('                                resubmission. Without it, such a job is only ever reported, never');
  console.log('                                requeued. A failed/cancelled/expired batch that still has partial');
  console.log('                                results is read and applied regardless of --reset — see above.');
  console.log(
    '  --stall-threshold-minutes=N   How long (in minutes) a batch can show no progress before being reported',
  );
  console.log('                                as stalled (default: 30). Reporting only — see --reset above for');
  console.log('                                what actually abandons a stalled batch. Use 60+ for a longer grace');
  console.log('                                period before a slow batch is even reported as stalled.');
  console.log('  --sync                        Rescue-run escape hatch: instead of submitting a batch job, calls');
  console.log("                                OpenAI's regular synchronous endpoint directly and waits for every");
  console.log('                                answer before exiting. Billed at standard, not batch-discounted,');
  console.log('                                rates — pair with --limit to keep this to a handful of entries.');
  process.exit(0);
}

const locale = flag('locale');
const limit = Number(flag('limit', Infinity));
const model = flag('model', 'gpt-6-luna');
// How many times each entry is judged; it is flagged only when most of the votes flag it (#437).
const votes = Number(flag('votes', '3'));
if (!Number.isInteger(votes) || votes < 1) throw new Error('--votes must be a positive integer');
// How many evaluate/improve rounds an entry gets before it stops being re-queued even unresolved.
const evaluationLimit = Number(flag('evaluation-limit', 2));
// Ignores tracked clean/exhausted state entirely and re-evaluates every selected entry.
const force = rawArgs.includes('--force');
// #396: re-checking the entries improve-corpus-batch.mjs's own `--last-resort` mode just revised
// doesn't fit `--force` (which re-evaluates the *entire* corpus, far more than needed) or the
// default filter (which excludes anything already exhausted, these entries by definition). Scoped
// to exactly the entries that were just given a one-time last-resort revision and nothing else —
// `lastResortAttempted` is only ever set by that mode, so it's a precise, cheap target list.
const recheckExhausted = rawArgs.includes('--recheck-exhausted');
// Checks every job already in flight (applying results for any that finished) and exits — never
// builds a new candidate list or submits anything. Combined with omitting `--locale`, scans every
// locale that has a batch-state file instead of just one.
const checkOnly = rawArgs.includes('--check-only');
// Checks/imports exactly one OpenAI batch id instead of every job on file for the locale — handy
// to recheck a single job without disturbing the stall tracking of any others still in flight.
// Batch ids aren't locale-scoped on OpenAI's side, so this always requires --locale too, to know
// which locale's batch-state file the id should be matched against — and, if it isn't recorded
// there, which locale to assume it belongs to when falling back to asking OpenAI directly (see
// checkAndApply). Implies --check-only: it never builds a new candidate list or submits anything.
const batchId = flag('batch');
// A job with nothing usable left (orphaned, stalled past --stall-threshold-minutes, or
// failed/cancelled/expired with no extractable results at all) is only ever *reported* by
// default — its entries' tracking state is left exactly as-is, so nothing is silently requeued.
// This flag is what actually drops that job and puts its entries back to pending for
// resubmission. A failed/cancelled/expired batch that still has partial results is read and
// applied regardless of this flag — see checkAndApply.
const reset = rawArgs.includes('--reset');
// Threshold in minutes for *reporting* a batch as stalled — no progress for this long = reported,
// not auto-abandoned; pair with --reset to actually abandon it once reported.
// Default 30 minutes; use --stall-threshold-minutes=60 for a longer grace period.
const stallThresholdMinutes = Number(flag('stall-threshold-minutes', 30));
if (!Number.isInteger(stallThresholdMinutes) || stallThresholdMinutes < 1)
  throw new Error('--stall-threshold-minutes must be a positive integer');
// Rescue-run escape hatch (see module doc comment): calls OpenAI's standard synchronous endpoint
// directly instead of submitting a batch job, and waits for every answer before exiting. Billed
// at standard, not batch-discounted, rates — intended for a handful of entries (pair with
// --limit), not a full-corpus run.
const sync = rawArgs.includes('--sync');

if (batchId && !locale) {
  throw new Error(
    "--batch=<id> requires --locale=<locale> — a batch id alone doesn't say which locale's batch-state file to check",
  );
}
if (!locale && !checkOnly) {
  throw new Error(
    '--locale=<locale> is required (unless using --check-only without --locale, which checks every locale)',
  );
}
if (sync && (checkOnly || batchId)) {
  throw new Error(
    '--sync cannot be combined with --check-only or --batch — both of those exit before any new work would run synchronously',
  );
}

// This locale's batch-state file holds a *list* of jobs, not just one — a run can have several
// batches in flight at once (e.g. kicked off back to back to parallelize throughput). Every call
// checks all of them (one single-shot status call each, never a blocking poll): a terminal job's
// results are retrieved and applied, then it drops off the list; a still-running one stays on it
// and is reported, not re-submitted. `batchFilter`, when given, scopes the checking to just that
// one batch id — every other recorded job is left completely untouched (not even polled), and is
// carried straight through into `stillRunning` so it's never dropped from the state file.
async function checkAndApply(loc, { batchFilter } = {}) {
  const corpusPath = join(root, 'src', 'interpretation', 'corpus', `${loc}.json`);
  const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));

  const trackingPath = join(root, 'tools', 'corpus-gen', 'eval-tracking', `${loc}.json`);
  const tracking = await readTracking(trackingPath);

  const feedbackPath = join(root, 'tools', 'corpus-gen', 'feedback', `${loc}.json`);
  const statePath = join(root, 'tools', 'corpus-gen', 'batch-state', `evaluate-${loc}.json`);
  const existingState = await readBatchState(statePath);
  const jobs = existingState?.jobs ?? [];
  let jobsToCheck = batchFilter ? jobs.filter((job) => job.batchId === batchFilter) : jobs;
  const untouchedJobs = batchFilter ? jobs.filter((job) => job.batchId !== batchFilter) : [];
  // `--batch=<id>` named a job this locale's state file doesn't know about (lost, cleared, or
  // never written) — fall back to asking OpenAI directly for it. The id itself carries no locale
  // (OpenAI's batches aren't locale-scoped), so this trusts the caller's own --locale rather than
  // reporting nothing to check; the candidate list is then re-derived from the batch's own input
  // file (see reconstructJobFromBatch), since there's no recorded job to read it from.
  let foundRemotely = false;
  if (batchFilter && jobsToCheck.length === 0) {
    console.log(
      `[${loc}] batch ${batchFilter} isn't recorded in this locale's batch state — checking directly with OpenAI...`,
    );
    let remoteBatch;
    try {
      remoteBatch = await getBatch({ apiKey: process.env.OPENAI_API_KEY, batchId: batchFilter });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `batch ${batchFilter} is not recorded locally and OpenAI doesn't recognize it either (${errorMsg})`,
        { cause: error },
      );
    }
    jobsToCheck = [await reconstructJobFromBatch({ batch: remoteBatch, corpus })];
    foundRemotely = true;
  }

  const stillRunning = [...untouchedJobs];
  let feedback;
  let anyTerminal = false;
  let totalClean = 0;
  let totalFlagged = 0;
  let totalFailed = 0;
  let totalCostCents = 0;
  let costUnknown = false;

  try {
    for (const job of jobsToCheck) {
      console.log(
        `[${loc}] checking batch ${job.batchId} (submitted ${job.submittedAt}, ${String(job.candidates.length)} entries)...`,
      );
      let batch;
      try {
        batch = await getBatch({ apiKey: process.env.OPENAI_API_KEY, batchId: job.batchId });
      } catch (error) {
        // Batch no longer exists (404/orphaned) — can't be checked again, so it's dropped from
        // the job list either way. Whether its entries go back to pending for resubmission is
        // gated on --reset: without it, this only reports the problem and leaves tracking alone.
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (reset) {
          if (feedback === undefined) feedback = await readFeedback(feedbackPath);
          const now = new Date().toISOString();
          console.error(
            `[${loc}] ⚠️ ORPHANED batch ${job.batchId} (${errorMsg}) — resetting ${String(job.candidates.length)} entries for resubmission (--reset)`,
          );
          for (const candidate of job.candidates) {
            const entry = corpus.find((e) => identityOf(e) === identityOf(candidate));
            if (entry) {
              const existingTracking = findTracking(tracking, entry);
              upsertTracking(tracking, {
                key: entry.key,
                locale: entry.locale,
                clean: undefined, // Mark as pending (neither clean nor flagged)
                evaluationCount: (existingTracking?.evaluationCount ?? 0) + 1,
                updatedAt: now,
              });
              console.log(`[${loc}] RESET ${entry.key} — eligible for resubmission after batch orphan detection`);
            }
          }
        } else {
          console.error(
            `[${loc}] ⚠️ ORPHANED batch ${job.batchId} (${errorMsg}) — dropping from tracked state without touching its ${String(job.candidates.length)} entries; pass --reset to requeue them now`,
          );
        }
        anyTerminal = true;
        continue; // Skip to next batch, don't add to stillRunning
      }
      if (!isBatchTerminal(batch)) {
        const counts = batch.request_counts;
        const { shouldAbandon, reason, nextTracking } = detectStalledBatch(batch, job, stallThresholdMinutes);
        console.log(
          `[${loc}] batch ${job.batchId} still ${batch.status}${counts ? ` (${String(counts.completed)}/${String(counts.total)} done, ${String(counts.failed)} failed)` : ''}${reason ? ` — ${reason}` : ''}`,
        );

        // Update tracking for next check (even if not yet abandoned)
        // This persists the current state to disk at the end of this function
        if (nextTracking) {
          job.lastSeenCounts = nextTracking;
        }

        // Exceeding the threshold is reporting-only by itself (`reason` above already surfaced
        // it) — it only actually abandons the batch and resets its entries when --reset is also
        // passed. Without --reset, the batch just keeps being reported as stalled on every check.
        if (shouldAbandon && reset) {
          if (feedback === undefined) feedback = await readFeedback(feedbackPath);
          const now = new Date().toISOString();
          console.error(
            `[${loc}] ⚠️ ABANDONING batch ${job.batchId} (${reason}) — resetting ${String(job.candidates.length)} entries for resubmission (--reset)`,
          );
          for (const candidate of job.candidates) {
            const entry = corpus.find((e) => identityOf(e) === identityOf(candidate));
            if (entry) {
              const existingTracking = findTracking(tracking, entry);
              upsertTracking(tracking, {
                key: entry.key,
                locale: entry.locale,
                clean: undefined, // Mark as pending (neither clean nor flagged)
                evaluationCount: (existingTracking?.evaluationCount ?? 0) + 1,
                updatedAt: now,
              });
              console.log(`[${loc}] RESET ${entry.key} — eligible for resubmission after batch abandonment`);
            }
          }
          anyTerminal = true;
          continue; // Skip to next batch
        }
        if (shouldAbandon && !reset) {
          console.log(
            `[${loc}] batch ${job.batchId} is past the stall threshold but --reset was not passed — leaving it in place and reporting; pass --reset to abandon and requeue its entries`,
          );
        }

        stillRunning.push(job);
        continue;
      }
      // A cancelled/failed/expired batch will not be retried by OpenAI, but it isn't necessarily
      // empty — it can still carry real results for whatever requests completed before it stopped
      // (confirmed against a real cancelled batch, #381: 749/750 completed with a populated output
      // file). So this always attempts extraction first, same as a cleanly completed batch, rather
      // than discarding a mostly-finished job just because of how it ended.
      const isDeadBatch = ['failed', 'cancelled', 'expired'].includes(batch.status);
      console.log(
        `[${loc}] batch ${job.batchId} is ${batch.status}${isDeadBatch ? ' (will not be retried by OpenAI; retrieving whatever results it has)' : ' — retrieving results...'}`,
      );
      anyTerminal = true;

      if (feedback === undefined) feedback = await readFeedback(feedbackPath);

      // Rebuild this job's own candidates from the identity list captured at submission time,
      // against the corpus as it stands now — same key lookup convention as
      // corpus-feedback.mjs/eval-tracking.mjs.
      const byIdentity = new Map(corpus.map((entry) => [identityOf(entry), entry]));
      const candidates = job.candidates.map(({ key }) => {
        const entry = byIdentity.get(identityOf({ key }));
        const placement = entry ? parsePlacementKey(entry.key) : undefined;
        return entry && placement ? { entry, placement } : undefined;
      });

      let results;
      try {
        results = await extractBatchResults({ apiKey: process.env.OPENAI_API_KEY, batch });
      } catch (error) {
        // Genuinely nothing came back (e.g. cancelled/failed before a single request completed)
        // — print a user-friendly message. Same as any other unrecoverable job: its entries only
        // go back to pending for resubmission if --reset was passed; otherwise this just reports
        // the failure and leaves tracking alone.
        if (error instanceof Error && error.name === 'BatchJobFailed') {
          console.error(`[${loc}] ❌ ${error.message}`);
        } else {
          console.error(`[${loc}] ❌ Batch check failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (reset) {
          const now = new Date().toISOString();
          for (const candidate of job.candidates) {
            const entry = corpus.find((e) => identityOf(e) === identityOf(candidate));
            if (entry) {
              const existingTracking = findTracking(tracking, entry);
              upsertTracking(tracking, {
                key: entry.key,
                locale: entry.locale,
                clean: undefined, // Mark as pending (neither clean nor flagged)
                evaluationCount: (existingTracking?.evaluationCount ?? 0) + 1,
                updatedAt: now,
              });
              console.log(`[${loc}] RESET ${entry.key} — eligible for resubmission (--reset)`);
            }
          }
        } else {
          console.error(`[${loc}] ⚠️ entries left untouched; pass --reset to requeue them now`);
        }
        // Don't add to stillRunning — this batch is unrecoverable.
        continue; // Skip to next batch in loop
      }
      const applied = applyBallotResults({
        loc,
        candidateKeys: job.candidates,
        resolvedCandidates: candidates,
        results,
        model: job.model,
        votesCount: job.votes,
        tracking,
        feedback,
        costTier: 'batch',
      });
      totalClean += applied.totalClean;
      totalFlagged += applied.totalFlagged;
      totalFailed += applied.totalFailed;
      totalCostCents += applied.totalCostCents;
      if (applied.costUnknown) costUnknown = true;
    }
  } catch (error) {
    // Unexpected error in batch loop — log and continue with cleanup
    console.error(
      `[${loc}] ⚠️ Unexpected error processing batches: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (error instanceof Error && error.stack) {
      console.error(`[${loc}] Stack: ${error.stack}`);
    }
  }

  if (anyTerminal) {
    await mkdir(dirname(feedbackPath), { recursive: true });
    // Ensure feedback is defined even if no successful batches processed results
    await writeFeedback(feedbackPath, feedback ?? []);
    await mkdir(dirname(trackingPath), { recursive: true });
    await writeTracking(trackingPath, tracking);
    console.log(
      `\n[${loc}] evaluation complete: ${String(totalClean + totalFlagged + totalFailed)} checked — ${String(totalClean)} clean, ${String(totalFlagged)} flagged, ${String(totalFailed)} failed`,
    );
    console.log(
      `[${loc}] estimated cost: ${formatCents(totalCostCents)}${costUnknown ? ` (+ unknown — no batch pricing on file for one or more models)` : ''}`,
    );
    console.log(`[${loc}] feedback written to ${feedbackPath}`);
    console.log(`[${loc}] tracking written to ${trackingPath}`);
  }

  return { corpus, tracking, trackingPath, feedbackPath, statePath, jobs, stillRunning, anyTerminal, foundRemotely };
}

if (checkOnly && !locale) {
  const stateDir = join(root, 'tools', 'corpus-gen', 'batch-state');
  let files = [];
  try {
    files = await readdir(stateDir);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const locales = files
    .filter((f) => f.startsWith('evaluate-') && f.endsWith('.json'))
    .map((f) => f.slice('evaluate-'.length, -'.json'.length))
    .sort();
  if (locales.length === 0) {
    console.log('no batches in flight for any locale.');
    process.exit(0);
  }
  for (const loc of locales) {
    const { jobs, stillRunning, statePath } = await checkAndApply(loc);
    if (jobs.length === 0) console.log(`[${loc}] no batches in flight.`);
    else if (stillRunning.length > 0)
      console.log(`[${loc}] ${String(stillRunning.length)}/${String(jobs.length)} batch(es) still running.`);
    else console.log(`[${loc}] all recorded batches completed and applied.`);
    if (stillRunning.length > 0) {
      await writeBatchState(statePath, { jobs: stillRunning });
      for (const job of stillRunning) {
        if (job.lastSeenCounts) {
          console.log(
            `[${loc}] persisted stall tracking for ${job.batchId}: ${String(job.lastSeenCounts.completed + job.lastSeenCounts.failed)}/${String(job.totalRequests ?? '?')} done, last changed at ${job.lastSeenCounts.changedAt}`,
          );
        }
      }
    } else await clearBatchState(statePath);
  }
  process.exit(0);
}

const { corpus, tracking, statePath, jobs, stillRunning, anyTerminal, foundRemotely } = await checkAndApply(locale, {
  batchFilter: batchId,
});

if (batchId) {
  // --batch scopes checkAndApply to just this one job, above — every other recorded job for this
  // locale was carried straight through into `stillRunning` untouched. This never falls through
  // to submission below: a batch id names one specific already-submitted job to check/import, not
  // a new selection to run. `foundRemotely` means this locale's state file didn't know about the
  // id at all — checkAndApply fell back to asking OpenAI directly and, finding it, reconstructed
  // its candidate list from the batch's own input file instead of giving up.
  if (foundRemotely) {
    console.log(
      `[${locale}] note: batch ${batchId} was not recorded locally — matched it directly via OpenAI and assumed it belongs to --locale=${locale}.`,
    );
  }
  if (stillRunning.some((job) => job.batchId === batchId)) {
    console.log(`[${locale}] batch ${batchId} still running — nothing to apply yet.`);
  } else {
    console.log(
      `[${locale}] batch ${batchId} checked${anyTerminal ? ' and applied' : ''} — --batch implies --check-only, not submitting anything new.`,
    );
  }
  if (stillRunning.length > 0) await writeBatchState(statePath, { jobs: stillRunning });
  else await clearBatchState(statePath);
  process.exit(0);
}

if (checkOnly) {
  if (jobs.length === 0) console.log(`[${locale}] no batches in flight.`);
  else if (stillRunning.length > 0)
    console.log(
      `[${locale}] ${String(stillRunning.length)} batch(es) still running, ${String(jobs.length - stillRunning.length)} completed and applied — --check-only, not submitting anything new.`,
    );
  else
    console.log(`[${locale}] all recorded batches completed and applied — --check-only, not submitting anything new.`);
  if (stillRunning.length > 0) {
    await writeBatchState(statePath, { jobs: stillRunning });
    for (const job of stillRunning) {
      if (job.lastSeenCounts) {
        console.log(
          `[${locale}] persisted stall tracking for ${job.batchId}: ${String(job.lastSeenCounts.completed + job.lastSeenCounts.failed)}/${String(job.totalRequests ?? '?')} done, last changed at ${job.lastSeenCounts.changedAt}`,
        );
      }
    }
  } else await clearBatchState(statePath);
  process.exit(0);
}

const inFlightIdentities = new Set(stillRunning.flatMap((job) => job.candidates.map(identityOf)));

const selected = corpus
  .filter((entry) => !inFlightIdentities.has(identityOf(entry)))
  .map((entry) => {
    const placement = parsePlacementKey(entry.key);
    return placement === undefined ? undefined : { entry, placement };
  })
  .filter((item) => item !== undefined);

const eligible = force
  ? selected
  : recheckExhausted
    ? selected.filter((item) => findTracking(tracking, item.entry)?.lastResortAttempted === true)
    : selected.filter((item) => !isEvaluationExhausted(findTracking(tracking, item.entry), evaluationLimit));
const alreadyResolved = selected.length - eligible.length;
const candidates = eligible.slice(0, Number.isFinite(limit) ? limit : undefined);

console.log(
  `[${locale}] model: ${model} — ${String(candidates.length)} entries to evaluate${alreadyResolved > 0 ? ` (${String(alreadyResolved)} already resolved, skipped)` : ''}${inFlightIdentities.size > 0 ? ` (${String(inFlightIdentities.size)} already covered by ${String(stillRunning.length)} running batch(es))` : ''}`,
);
if (candidates.length === 0) {
  if (stillRunning.length > 0) await writeBatchState(statePath, { jobs: stillRunning });
  else await clearBatchState(statePath);
  if (stillRunning.length === 0 && !anyTerminal) console.log(`[${locale}] nothing to do.`);
  process.exit(0);
}

const requests = candidates.flatMap(({ entry, placement }, index) => {
  // If Gemini rejected a complaint about this exact entry last round (improve-corpus-batch.mjs's
  // UNCHANGED verdict), hand that rejection back to this judge now — reviewing with the other
  // side's reasoning already in view, not re-flagging the same thing blind every round (#381).
  const priorRejection = findTracking(tracking, entry)?.lastRejection;
  const { systemInstruction, userContent } = buildEvaluationPrompt({
    factsDescription: factsDescription(placement),
    entryText: entry.text,
    ...(priorRejection ? { priorRejection } : {}),
  });
  return Array.from({ length: votes }, (_, vote) =>
    buildBatchRequest({
      customId: `${String(index)}:${String(vote)}`, // position in `candidates`, and which vote
      model,
      systemInstruction,
      userContent,
      // No temperature override: gpt-6-luna (this script's own default) rejects anything but its
      // own default (1) — see openai-batch.mjs's buildBatchRequest doc comment, found via a real
      // batch job's error file, not guessed.
      responseSchema: EVALUATION_RESPONSE_SCHEMA,
      schemaName: 'evaluation',
    }),
  );
});

if (sync) {
  console.log(
    `\n[${locale}] running ${String(requests.length)} request${requests.length === 1 ? '' : 's'} (${String(votes)} vote${votes === 1 ? '' : 's'} per entry) synchronously (--sync — standard-tier pricing, not the Batch API's 50% discount)...`,
  );
  // No batch-job bookkeeping here: nothing is submitted, so there's nothing for a future run to
  // check. A modest concurrency cap keeps this from either serializing one call at a time (slow
  // for more than a couple of entries) or firing everything at once (risking rate limits) — fine
  // for the small rescue runs this flag is meant for.
  const concurrency = Math.min(5, requests.length);
  const results = new Array(requests.length);
  let nextIndex = 0;
  async function worker() {
    for (;;) {
      const index = nextIndex++;
      if (index >= requests.length) return;
      results[index] = await callChatCompletionSync({ apiKey: process.env.OPENAI_API_KEY, request: requests[index] });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const feedbackPath = join(root, 'tools', 'corpus-gen', 'feedback', `${locale}.json`);
  const trackingPath = join(root, 'tools', 'corpus-gen', 'eval-tracking', `${locale}.json`);
  const feedback = await readFeedback(feedbackPath);
  const { totalClean, totalFlagged, totalFailed, totalCostCents, costUnknown } = applyBallotResults({
    loc: locale,
    candidateKeys: candidates.map(({ entry }) => ({ key: entry.key })),
    resolvedCandidates: candidates,
    results,
    model,
    votesCount: votes,
    tracking,
    feedback,
    costTier: 'standard',
  });
  await mkdir(dirname(feedbackPath), { recursive: true });
  await writeFeedback(feedbackPath, feedback);
  await mkdir(dirname(trackingPath), { recursive: true });
  await writeTracking(trackingPath, tracking);
  // Nothing new was submitted — only write back whatever other jobs were already running.
  if (stillRunning.length > 0) await writeBatchState(statePath, { jobs: stillRunning });
  else await clearBatchState(statePath);

  console.log(
    `\n[${locale}] evaluation complete (sync): ${String(totalClean + totalFlagged + totalFailed)} checked — ${String(totalClean)} clean, ${String(totalFlagged)} flagged, ${String(totalFailed)} failed`,
  );
  console.log(
    `[${locale}] estimated cost: ${formatCents(totalCostCents)}${costUnknown ? ` (+ unknown — no standard pricing on file for one or more models)` : ''}`,
  );
  console.log(`[${locale}] feedback written to ${feedbackPath}`);
  console.log(`[${locale}] tracking written to ${trackingPath}`);
  process.exit(0);
}

console.log(
  `\n[${locale}] submitting ${String(requests.length)} request${requests.length === 1 ? '' : 's'} (${String(votes)} vote${votes === 1 ? '' : 's'} per entry) as one batch job...`,
);
const submitted = await submitBatch({ apiKey: process.env.OPENAI_API_KEY, requests });
const newJob = {
  batchId: submitted.id,
  submittedAt: new Date().toISOString(),
  model,
  votes,
  candidates: candidates.map(({ entry }) => ({ key: entry.key })),
};
await writeBatchState(statePath, { jobs: [...stillRunning, newJob] });
console.log(
  `[${locale}] submitted batch ${submitted.id} covering ${String(candidates.length)} entries${stillRunning.length > 0 ? ` (${String(stillRunning.length)} other batch(es) still running for this locale)` : ''} — OpenAI batches can take up to 24h; run this script again later (same --locale) to check status and apply results once it's done.`,
);
