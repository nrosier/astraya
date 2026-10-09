/**
 * Batch runner for #56's corpus entries: the text every reader sees for a placement.
 *
 * planet-in-sign/-house and aspect-pair cover every computed body (all 20 —
 * the 10 traditional/modern planets, both nodes, all three Lilith variants
 * and the four main-belt asteroids), so no placement a chart can produce is
 * left without a default entry. dignity-state covers the 7 bodies with a
 * traditional rulership (all four states) and, since #426, Uranus, Neptune
 * and Pluto (ruler and detriment only — no tradition gives them an
 * exaltation or fall). That is a correctness constraint, not a scope choice:
 * an asteroid, Chiron or a node has no dignity to describe, so generating one
 * would be inventing astrology, not omitting coverage. synastry-aspect (#359) reuses aspect-pair's own
 * corePairs() x ASPECTS coverage, stored once per pair in alphabetical order and
 * written from the first body's owner's side ("your … their …", #427) — the
 * prompt says so, and so does the Synastry screen when it shows the text.
 *
 * Resumable and idempotent: every successful entry is written to
 * src/interpretation/corpus/<locale>.json immediately, and a re-run skips
 * any key that file already has. Runs one locale
 * at a time by design, so `--locale=en` and `--locale=nl` can run
 * concurrently or be resumed independently, per #56.
 *
 *   npx tsx --env-file=.env.local tools/corpus-gen/generate-batch.mjs --locale=en [--limit=N] [--concurrency=N] [--delay-ms=N] [--skip-final-checks] [--provider=gemini|ollama] [--force] [--max-language-retries=N] [--batch]
 *
 * `--max-language-retries` (default 4): a response that fails lint's own
 * `language-mismatch` rule (text in the wrong locale entirely) is re-requested
 * from the same model against the same prompt, rather than accepted or given
 * up on after one draw — qwen2.5:14b in particular only *sometimes* ignores
 * the locale directive in its system prompt, so another sample at the same
 * (non-zero) temperature has a real chance of landing in the right language.
 * A key still wrong after every retry counts as failed, same as any other bad
 * response, and leaves whatever was already at that key (if anything)
 * untouched.
 *
 * `--batch` (Gemini only — `--provider=ollama` has no batch equivalent) submits every pending
 * placement as one inline Gemini Batch API job instead of one HTTP call per placement, at
 * Google's own 50%-of-standard-rate batch pricing. `--concurrency`/`--delay-ms` are meaningless
 * under `--batch` (there is exactly one submission, not N parallel callers) and are ignored.
 * `--max-language-retries` still applies, just reshaped for an async job: each "retry" above is a
 * whole further batch round submitted for only the keys still wrong after the previous round, not
 * a same-request retry — Gemini rarely needs more than round 1 for this (see
 * lib/gemini-batch.mjs's own doc comment), so in practice this costs nothing extra. A batch round
 * can take anywhere from under a minute to Google's documented "usually well under 24 hours, up
 * to a 48-hour hard expiry" — this command blocks and polls for the whole wait, same as the
 * non-batch path blocks for its own (much shorter) wall-clock run.
 *
 * `--force` (#368) turns this from a gap-filler into a full regeneration:
 * every placement in scope is (re)generated, replacing its existing entry in
 * place (same array index — never appended as a duplicate of the same key).
 * Hand-written `anchor: true` entries are never touched by `--force`, even
 * though they're otherwise ordinary corpus entries — they're the "3
 * gold-standard fragments" reference examples, not something a batch run
 * should be able to overwrite with its own output.
 *
 * `--skip-final-checks` skips the whole-locale lint/dedupe pass at the end — useful when
 * running many rounds back-to-back, since that pass is quadratic in the locale's total entry
 * count and repeating it after every round pays a rising cost for no benefit until the last
 * round is done anyway.
 *
 * `--provider=gemini|ollama` (#359, default gemini) picks which machine runs
 * this: Ollama only ever runs against whoever's own machine has it
 * installed, so `--provider=ollama` is for local/dev generation. Actually
 * regenerating the corpus for the production/hosted deployment stays on
 * Gemini for now — a hosted environment has no local model to call.
 *
 * `degree-symbol` (#405) is the one category generated against its own voice, length target and
 * fixed tier instead of the shared disposition ones — `systemInstructionFor`/`userContentFor`
 * branch to `lib/prompt.mjs`'s `buildDegreeSymbolSystemInstruction`/`buildDegreeSymbolUserContent`,
 * `buildEntry` fixes its tier to `'nuance'` regardless of what the model returned, and
 * `retryReason` (what `--max-language-retries` actually retries on, generalized beyond its name)
 * also retries a draft under the 75-word floor, sharing the same retry budget. See those
 * functions' own comments, and `lib/prompt.mjs`'s `DEGREE_SYMBOL_VOICE`, for why.
 */
/**
 * @module generate-batch
 * @purpose Batch-generates (or regenerates) every placement's corpus entry across the full
 *   restricted scope (#56) — the primary writer of src/interpretation/corpus/<locale>.json.
 * @conventions CLI flags: --locale=en|nl (required), --limit=N, --concurrency=N, --delay-ms=N,
 *   --skip-final-checks, --provider=gemini|ollama, --force, --max-language-retries=N, --batch,
 *   --seed-anchors-from=<path>. Costs real API money (Gemini) unless --provider=ollama.
 *   Resumable/idempotent: every successful entry is written immediately and a re-run skips any
 *   key already shipped unless --force. Never regenerates a hand-written `anchor: true` entry.
 * @exports CLI entry point, no exports.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSystemInstruction,
  buildUserContent,
  buildDegreeSymbolSystemInstruction,
  buildDegreeSymbolUserContent,
} from './lib/prompt.mjs';
import { buildBatchRequest, submitBatch, pollBatch, extractBatchResults } from './lib/gemini-batch.mjs';
import { writeCorpus } from './lib/write-corpus.mjs';
import {
  buildPlacements,
  placementDescription,
  buildSymbolismContext,
  symbolismScopeFor,
  degreeSymbolExcerpt,
} from './lib/placements.mjs';
import { CORPUS_ENTRY_RESPONSE_SCHEMA, placementKey } from '../../src/interpretation/schema.ts';
import { lintCorpus, lintEntry } from '../../src/interpretation/lint.ts';
import { findNearDuplicates } from '../../src/interpretation/dedupe.ts';
import { estimateCostCentsForCall, formatCents } from './lib/cost-estimate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne));
  return results;
}

const rawArgs = process.argv.slice(2);
function flag(name, fallback) {
  const found = rawArgs.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}
if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(
    [
      'Usage: npx tsx --env-file=.env.local tools/corpus-gen/generate-batch.mjs --locale=en [--limit=N] [--concurrency=N] [--delay-ms=N] [--skip-final-checks] [--provider=gemini|ollama] [--force] [--max-language-retries=N] [--batch] [--seed-anchors-from=<path>]',
      '',
      "The primary corpus writer (#56): generates every placement's entry across the full restricted",
      'scope, resumably and idempotently — every successful entry is written to',
      'src/interpretation/corpus/<locale>.json immediately, and a re-run skips any key the file',
      'already has. Runs one locale at a time by design, so --locale=en and --locale=nl can run',
      'concurrently or be resumed independently.',
      '',
      'Options:',
      '  --locale=en|nl        Required. Which corpus file to generate/fill gaps in.',
      '  --limit=N             Caps how many placements to generate this run. Default: unlimited.',
      '  --concurrency=N       How many generation calls to run in parallel. Ignored under --batch.',
      '                        Default: 3.',
      '  --delay-ms=N          Pause between launching each call, outside --batch. Ignored under',
      '                        --batch. Default: 200.',
      '  --skip-final-checks   Skips the whole-locale lint/dedupe pass at the end — useful when',
      '                        running many rounds back-to-back, since that pass is quadratic in',
      "                        the locale's total entry count.",
      '  --provider=gemini|ollama',
      '                        Which model generates the text. --provider=ollama is for local/dev',
      '                        generation only; production stays on Gemini. Default: gemini.',
      '  --force               Regenerates every placement in scope, replacing its existing entry in',
      '                        place, instead of only filling gaps. Never touches a hand-written',
      '                        `anchor: true` entry, even under --force.',
      '  --max-language-retries=N',
      "                        How many times to re-request a response that fails lint's own",
      '                        language-mismatch rule, from the same model/prompt, before giving up',
      '                        on that key. Default: 4.',
      '  --batch               Gemini only. Submits every pending placement as one inline Gemini',
      '                        Batch API job (50%-of-standard-rate pricing) instead of one HTTP call',
      '                        per placement. --concurrency/--delay-ms are ignored under --batch.',
      '                        --max-language-retries still applies, reshaped as a further batch',
      '                        round per retry. Blocks and polls for the whole run, which can take',
      "                        anywhere from under a minute to Google's documented 48-hour hard",
      '                        expiry.',
      '  --seed-anchors-from=<path>',
      "                        Only acts when the target locale's own corpus has zero hand-written",
      "                        `anchor: true` entries. Copies that locale's anchor entries from the",
      '                        corpus file at <path> (e.g. a backup or git-restored copy) into the',
      '                        target corpus before generating, instead of proceeding anchor-free.',
      '                        Anchors are optional — a model capable of reasoning to the house',
      '                        style without one can run with none.',
      '',
      'Costs real API money (Gemini) unless --provider=ollama.',
    ].join('\n'),
  );
  process.exit(0);
}
const locale = flag('locale');
if (locale !== 'en' && locale !== 'nl') throw new Error('--locale=en|nl is required');
const limit = Number(flag('limit', Infinity));
const concurrency = Number(flag('concurrency', '3'));
const delayMs = Number(flag('delay-ms', '200'));
const skipFinalChecks = rawArgs.includes('--skip-final-checks');
const force = rawArgs.includes('--force');
const MAX_LANGUAGE_RETRIES = Number(flag('max-language-retries', '4'));
// Matches lib/prompt.mjs's DEGREE_SYMBOL_LENGTH_CONSTRAINT's own stated floor (#405).
const DEGREE_SYMBOL_MIN_WORDS = 75;
const useBatch = rawArgs.includes('--batch');

const provider = flag('provider', 'gemini');
if (provider !== 'gemini' && provider !== 'ollama')
  throw new Error(`--provider must be "gemini" or "ollama", got "${provider}"`);
if (useBatch && provider !== 'gemini') {
  throw new Error("--batch requires --provider=gemini — Gemini's Batch API has no Ollama equivalent");
}
const { generateStructured } = await import(provider === 'ollama' ? './lib/ollama.mjs' : './lib/gemini.mjs');
const model = provider === 'ollama' ? process.env.OLLAMA_MODEL || 'gemma4' : process.env.GEMINI_MODEL;
const baseUrl = provider === 'ollama' ? process.env.OLLAMA_BASE_URL : process.env.GEMINI_BASE_URL;

const corpusPath = join(root, 'src', 'interpretation', 'corpus', `${locale}.json`);
let corpus;
try {
  corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
} catch (error) {
  // No corpus file for this locale yet: start from scratch rather than crashing — writeCorpus()
  // (called via persist(), below) bootstraps the same way once the first entry is generated.
  if (error.code !== 'ENOENT') throw error;
  corpus = [];
}
// buildAnchorsBlock() (lib/prompt.mjs) originally required at least one hand-written `anchor:
// true` entry per locale to few-shot every prompt against — #56's "3 gold-standard fragments".
// Now optional (#368): anchors are used when present, but a from-scratch corpus (none) or a
// model judged capable of reasoning to the house style without an example (the user's own call
// for a full qwen2.5:14b regeneration) proceeds with no anchors and no seed file needed.
// `--seed-anchors-from=<path>` still works if you *want* to prime a from-scratch corpus with
// existing hand-written examples (a backup, or a git-restored copy) rather than going anchor-free.
const seedAnchorsFrom = flag('seed-anchors-from');
if (seedAnchorsFrom && corpus.filter((e) => e.anchor === true && e.locale === locale).length === 0) {
  const seedCorpus = JSON.parse(await readFile(resolve(seedAnchorsFrom), 'utf8'));
  const seedAnchors = seedCorpus.filter((e) => e.anchor === true && e.locale === locale);
  if (seedAnchors.length === 0) {
    throw new Error(`--seed-anchors-from=${seedAnchorsFrom} has no anchor entries for locale "${locale}" either`);
  }
  corpus.push(...seedAnchors);
  await writeCorpus(corpusPath, corpus);
  console.log(
    `[${locale}] seeded ${String(seedAnchors.length)} anchor entr${seedAnchors.length === 1 ? 'y' : 'ies'} from ${seedAnchorsFrom}`,
  );
}
if (corpus.filter((e) => e.anchor === true && e.locale === locale).length === 0) {
  console.log(`[${locale}] no anchor entries for this locale — generating with no few-shot example.`);
}

// Maps a key to its position in `corpus`, so a `--force` regeneration replaces
// the entry in place instead of pushing a second entry with the same key.
const existingIndex = new Map();
corpus.forEach((entry, i) => {
  existingIndex.set(entry.key, i);
});

const allPlacements = buildPlacements();
const pending = allPlacements
  .map((placement) => ({ placement, key: placementKey(placement) }))
  .filter(({ key }) => {
    const idx = existingIndex.get(key);
    if (idx === undefined) return true; // genuinely missing — always generate
    if (!force) return false; // already shipped, not forcing — gap-filler behavior
    return corpus[idx].anchor !== true; // forcing, but never regenerate a hand-written anchor
  })
  .slice(0, Number.isFinite(limit) ? limit : undefined);

console.log(
  `[${locale}] provider: ${provider} (model: ${String(model)}) — restricted scope: ${String(allPlacements.length)} placements, ` +
    `${String(existingIndex.size)} already shipped, ${String(pending.length)} to ${force ? 'regenerate' : 'generate'}${force ? ' (--force)' : ''}`,
);
if (pending.length === 0) {
  console.log(`[${locale}] nothing to do.`);
  process.exit(0);
}

let usageIn = 0;
let usageOut = 0;
let done = 0;
let failed = 0;
const lock = { writing: Promise.resolve() };

// A redrawing bar only makes sense against a real terminal — piped to a file or CI log, `\r`
// just produces one giant unreadable line, so fall back to the old periodic plain-line logging.
const useProgressBar = process.stdout.isTTY === true;
const BAR_WIDTH = 30;
function renderProgress() {
  const finished = done + failed;
  const pct = pending.length > 0 ? finished / pending.length : 1;
  const filled = Math.round(pct * BAR_WIDTH);
  const bar = '#'.repeat(filled) + '-'.repeat(BAR_WIDTH - filled);
  const elapsedMin = (Date.now() - startedAt) / 60000;
  const etaMin = finished > 0 ? (elapsedMin / finished) * (pending.length - finished) : 0;
  const rate = finished > 0 ? finished / elapsedMin : 0;
  const line =
    `[${locale}] [${bar}] ${String(finished)}/${String(pending.length)} (${(pct * 100).toFixed(1)}%)` +
    ` — ${String(done)} ok, ${String(failed)} failed — ${elapsedMin.toFixed(1)}min elapsed, ~${etaMin.toFixed(1)}min left` +
    ` — ${rate.toFixed(1)}/min`;
  process.stdout.write(`\r${line.padEnd(process.stdout.columns ?? line.length)}`);
}

async function persist() {
  lock.writing = lock.writing.then(() => writeCorpus(corpusPath, corpus));
  await lock.writing;
}

// Built per placement, not hoisted once: #379 made the symbolism half of this placement-scoped
// (only the relevant body/sign's symbolism, not every planet and sign on every request), so this
// now varies per item exactly like userContent already does.
//
// degree-symbol (#405) branches to its own voice/constraints builder — the shared disposition
// voice (buildSystemInstruction) assumes a chart placement to reason about from astrological
// symbolism, which does not apply to a traditional degree-image rewrite. See
// lib/prompt.mjs's DEGREE_SYMBOL_VOICE for why this category needs its own voice.
function systemInstructionFor(placement) {
  if (placement.category === 'degree-symbol') {
    return buildDegreeSymbolSystemInstruction({ locale, forceLanguageDirective: provider === 'ollama' });
  }
  return buildSystemInstruction({
    symbolismContext: buildSymbolismContext(locale, symbolismScopeFor(placement)),
    locale,
    forceLanguageDirective: provider === 'ollama',
  });
}

/** degree-symbol's "fact" is its own 1655 seed excerpt, not a derived placement description — see placementDescription's own degree-symbol case for why. */
function userContentFor(placement) {
  if (placement.category === 'degree-symbol') {
    return buildDegreeSymbolUserContent({ excerpt: degreeSymbolExcerpt(placement.degree) });
  }
  return buildUserContent({
    placementDescription: placementDescription(placement),
    corpusEntries: corpus,
    locale,
    aspectKey: placement.aspect,
  });
}

function buildEntry({ key, placement, text, tier }) {
  return {
    key,
    locale,
    // degree-symbol has no body/entity to key a per-placement tier decision off (#405) — fixed
    // uniformly rather than asked of the model, which was observed guessing inconsistently.
    // Still requested via CORPUS_ENTRY_RESPONSE_SCHEMA like every category (no schema change);
    // the model's guess is just ignored here.
    tier: placement.category === 'degree-symbol' ? 'nuance' : tier,
    text,
    tags: placement.category === 'dignity-state' ? [placement.state] : [],
    provenance: {
      source: 'generated',
      model,
      generatedAt: new Date().toISOString().slice(0, 10),
    },
  };
}

/**
 * Why a draft entry needs regenerating: a lint language-mismatch (every category) or, for
 * degree-symbol only, a draft under the 75-word floor (#405) — the model was observed under-
 * complying even with the stronger wording in `DEGREE_SYMBOL_LENGTH_CONSTRAINT`. Both share this
 * file's `--max-language-retries` budget rather than a second flag, same shape as the user asked
 * for this exact mechanism. Returns the retry reason's message, or `undefined` if the entry is
 * fine as-is.
 */
function retryReason(entry, placement) {
  const languageIssue = lintEntry(entry).find((issue) => issue.rule === 'language-mismatch');
  if (languageIssue) return languageIssue.message;
  if (placement.category === 'degree-symbol') {
    const words = entry.text.trim().split(/\s+/).filter(Boolean).length;
    if (words < DEGREE_SYMBOL_MIN_WORDS) {
      return `degree-symbol entry is ${String(words)} words, under the ${String(DEGREE_SYMBOL_MIN_WORDS)}-word floor`;
    }
  }
  return undefined;
}

/** Writes a successfully-generated entry into `corpus` in place (or appends it) and persists. */
async function acceptEntry(key, entry) {
  const existing = existingIndex.get(key);
  if (existing === undefined) {
    corpus.push(entry);
    existingIndex.set(key, corpus.length - 1);
  } else {
    corpus[existing] = entry;
  }
  await persist();
}

const startedAt = Date.now();

/**
 * Batch path for --batch: each round submits one inline Gemini Batch job for every item still
 * remaining (every item, on round 1), waits for it, and routes each result into either `corpus`
 * (good) or the next round's remaining set (language-mismatched, rounds left) or a logged failure
 * (language-mismatched, no rounds left — or any other per-item error the API itself reported).
 * Mirrors the non-batch path's own retry-until-correct-language loop, just reshaped so a "retry"
 * is a further batch round instead of a same-request retry — see this file's own header comment
 * on why that reshaping costs effectively nothing extra against Gemini in practice.
 */
async function runBatchRounds() {
  let remaining = pending;
  for (let round = 1; round <= MAX_LANGUAGE_RETRIES && remaining.length > 0; round += 1) {
    const requests = remaining.map(({ placement, key }) =>
      buildBatchRequest({
        key,
        systemInstruction: systemInstructionFor(placement),
        userContent: userContentFor(placement),
        temperature: Number(process.env.GEMINI_TEMPERATURE ?? '0.75'),
        responseSchema: CORPUS_ENTRY_RESPONSE_SCHEMA,
      }),
    );

    console.log(
      `\n[${locale}] batch round ${String(round)}/${String(MAX_LANGUAGE_RETRIES)}: submitting ${String(requests.length)} request${requests.length === 1 ? '' : 's'}...`,
    );
    const submitted = await submitBatch({
      apiKey: process.env.GEMINI_API_KEY,
      baseUrl,
      model,
      displayName: `astraya-corpus-${locale}-round${String(round)}-${String(Date.now())}`,
      requests,
    });
    console.log(`[${locale}] batch round ${String(round)}: ${submitted.name} — polling...`);

    let lastState;
    const finished = await pollBatch({
      apiKey: process.env.GEMINI_API_KEY,
      baseUrl,
      name: submitted.name,
      onPoll: (state) => {
        if (state !== lastState) {
          lastState = state;
          console.log(`[${locale}] batch round ${String(round)}: ${String(state)}`);
        }
      },
    });

    let results;
    try {
      results = extractBatchResults(finished);
    } catch (error) {
      // Batch failed — print user-friendly message
      console.error(
        `[${locale}] ❌ Batch processing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
    const byKey = new Map(results.map((r) => [r.key, r]));
    const nextRemaining = [];

    for (const item of remaining) {
      const result = byKey.get(item.key);
      if (result === undefined) {
        failed += 1;
        console.error(`[${locale}] FAILED ${item.key}: no result came back for this key`);
        continue;
      }
      if (result.usage) {
        usageIn += result.usage.promptTokenCount ?? 0;
        // Gemini bills thinking tokens as output, confirmed against a real response's own
        // usageMetadata (totalTokenCount = promptTokenCount + candidatesTokenCount + thoughtsTokenCount).
        usageOut += (result.usage.candidatesTokenCount ?? 0) + (result.usage.thoughtsTokenCount ?? 0);
      }
      if (result.error) {
        failed += 1;
        console.error(`[${locale}] FAILED ${item.key}: ${result.error.message}`);
        continue;
      }

      const entry = buildEntry({
        key: item.key,
        placement: item.placement,
        text: result.result.text,
        tier: result.result.tier,
      });
      const retryIssue = retryReason(entry, item.placement);
      if (retryIssue) {
        if (round < MAX_LANGUAGE_RETRIES) {
          nextRemaining.push(item);
        } else {
          failed += 1;
          console.error(
            `[${locale}] FAILED ${item.key}: ${retryIssue} (still wrong after ${String(MAX_LANGUAGE_RETRIES)} rounds)`,
          );
        }
        continue;
      }

      await acceptEntry(item.key, entry);
      done += 1;
    }

    console.log(
      `[${locale}] batch round ${String(round)} complete: ${String(done)} written so far, ${String(failed)} failed so far, ${String(nextRemaining.length)} going to the next round`,
    );
    remaining = nextRemaining;
  }
}

if (useBatch) {
  await runBatchRounds();
} else {
  await withConcurrency(pending, concurrency, async ({ placement, key }) => {
    const systemInstruction = systemInstructionFor(placement);
    const userContent = userContentFor(placement);

    try {
      let entry;
      let issue;
      let attempt = 0;
      do {
        attempt += 1;
        const result = await generateStructured({
          apiKey: process.env.GEMINI_API_KEY,
          model,
          baseUrl,
          temperature: Number(process.env.GEMINI_TEMPERATURE ?? '0.75'),
          systemInstruction,
          userContent,
          responseSchema: CORPUS_ENTRY_RESPONSE_SCHEMA,
          maxRetries: 5,
          onUsage: (usage) => {
            usageIn += usage?.promptTokenCount ?? 0;
            usageOut += (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
          },
        });

        entry = buildEntry({ key, placement, text: result.text, tier: result.tier });

        issue = retryReason(entry, placement);
        if (issue && attempt < MAX_LANGUAGE_RETRIES) {
          if (useProgressBar) process.stdout.write('\n');
          console.error(
            `[${locale}] ${key}: attempt ${String(attempt)}/${String(MAX_LANGUAGE_RETRIES)} — ${issue} — regenerating`,
          );
        }
      } while (issue && attempt < MAX_LANGUAGE_RETRIES);

      // Still bad after every retry: caught below and counted as a failed key, same as any
      // other bad response. A single bad draw from a model that only *sometimes* ignores the
      // locale in its own system prompt (qwen2.5:14b, observed), or a degree-symbol draft that
      // stays short (#405), would otherwise sail through untouched.
      if (issue) throw new Error(`${issue} (still bad after ${String(MAX_LANGUAGE_RETRIES)} attempts)`);

      await acceptEntry(key, entry);
      done += 1;
      if (useProgressBar) {
        renderProgress();
      } else if (done % 10 === 0 || done === pending.length) {
        const elapsedMin = (Date.now() - startedAt) / 60000;
        const rate = done / elapsedMin;
        console.log(
          `[${locale}] ${String(done)}/${String(pending.length)} written (${elapsedMin.toFixed(1)} min elapsed, ${rate.toFixed(1)}/min) — last: ${key}`,
        );
      }
    } catch (error) {
      failed += 1;
      if (useProgressBar) process.stdout.write('\n');
      console.error(`[${locale}] FAILED ${key}: ${error.message}`);
      if (useProgressBar) renderProgress();
    }

    if (delayMs > 0) await sleep(delayMs);
  });
}

console.log(`\n[${locale}] batch complete: ${String(done)} written, ${String(failed)} failed`);

{
  const costCents = estimateCostCentsForCall({
    provider,
    model,
    tier: useBatch ? 'batch' : 'standard',
    promptTokens: usageIn,
    outputTokens: usageOut,
  });
  const costNote =
    costCents === undefined
      ? `cost unknown (no pricing on file for ${model})`
      : `est. cost at ${provider === 'ollama' ? 'local' : useBatch ? 'Batch-tier' : 'Standard-tier'} rates: ${formatCents(costCents)}`;
  console.log(`[${locale}] usage: ${String(usageIn)} input tokens, ${String(usageOut)} output tokens — ${costNote}`);
}

if (skipFinalChecks) {
  console.log(`\n[${locale}] --skip-final-checks set: skipping whole-locale lint/dedupe pass.`);
  process.exit(0);
}

console.log(`\n[${locale}] final lint pass over the whole locale:`);
const lintIssues = lintCorpus(corpus);
if (lintIssues.length === 0) console.log(`[${locale}] clean — no lint issues`);
else for (const issue of lintIssues) console.log(`  [${issue.rule}] ${issue.key}: ${issue.message}`);

console.log(`\n[${locale}] final dedupe pass over the whole locale:`);
const { pairs } = findNearDuplicates(corpus);
if (pairs.length === 0) console.log(`[${locale}] clean — no near-duplicates at or above the threshold`);
else for (const pair of pairs) console.log(`  ${pair.keyA} <-> ${pair.keyB}: ${pair.similarity.toFixed(3)}`);
