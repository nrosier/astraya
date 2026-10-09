/**
 * One-off smoke test for #405: rewrites N degree-symbol ("Sabian-style") entries from the
 * verified CC0 1655 Angelus/Turner seed text (`classical-texts/degree-symbol.en.json`) into
 * Astraya's own house style, and prints the raw result plus a cost estimate — the step #405's
 * own commit (b80387e) says must happen, on a small sample, before deciding whether to spend on
 * regenerating all 360 degrees (720 with nl).
 *
 * Not `generate-sample.mjs`: that script's placement abstraction (`buildSystemInstruction`/
 * `buildUserContent` from `lib/prompt.mjs`) assumes a chart *disposition* to reason about from
 * astrological symbolism (a planet's nature, a sign's nature). A degree-symbol entry is a
 * different kind of task — rewrite one specific traditional *image* into the house voice,
 * without inventing a disposition-essay structure the source material was never shaped like.
 * The two scripts share `generateStructured`, `CORPUS_ENTRY_RESPONSE_SCHEMA`, and most of the
 * house style's HARD CONSTRAINTS (`NEGATIVE_CONSTRAINTS`, length line swapped — see below), not
 * the whole prompt.
 *
 * Runs the full #381 feedback loop per degree, not just a single Gemini draft — the production
 * pipeline (generate-batch.mjs → evaluate-corpus-batch.mjs → improve-corpus-batch.mjs) never
 * ships a draft without the independent second opinion, so a quality smoke test that skipped it
 * would be judging an easier task than the real one. The three stages reuse the exact same
 * prompt/schema builders those batch scripts use (`lib/corpus-evaluation.mjs`,
 * `lib/corpus-improvement.mjs`), swapped from their Batch-API transport (`lib/openai-batch.mjs`,
 * `lib/gemini-batch.mjs` — up to 24-48h turnaround) to synchronous calls (`lib/openai.mjs`,
 * `lib/gemini.mjs`) so ten degrees judge and revise in seconds, not overnight. `--votes` (if
 * ever raised above 1) still calls `majorityVerdict` the same way evaluate-corpus-batch.mjs does.
 *
 * `degree-symbol` IS now a registered corpus category (schema.ts) and generate-batch.mjs is the
 * real production path for it — this script stays as a quick, no-write sanity check against
 * that real pipeline's own voice/constraints (`lib/prompt.mjs`'s `buildDegreeSymbolSystemInstruction`/
 * `buildDegreeSymbolUserContent`, imported here rather than duplicated, closing the exact drift
 * risk this file's own header used to warn about before that promotion), not a pre-registration
 * gate. Still never writes to src/interpretation/corpus/<locale>.json. en only: the seed text is
 * English-only, and generate-batch.mjs's own nl runs write fresh Dutch text from the same English
 * excerpt (DEGREE_SYMBOL_VOICE.nl), not a translation of an English draft — this script doesn't
 * need its own nl path to exercise that, since the voice/constraints are what's being sanity
 * checked here, not per-locale output.
 *
 * Tier is NOT asked of the model for this category (unlike every other category's
 * CORPUS_ENTRY_RESPONSE_SCHEMA use): a degree-symbol has no body/entity to anchor a tier
 * decision to the way #427's planet/aspect categories do (it attaches to whichever body happens
 * to occupy that degree, decided at display time, not generation time), so there is nothing for
 * a per-entity tier rule to key off and the model was observed guessing inconsistently when
 * asked anyway. Fixed to 'nuance' uniformly instead, matching generate-batch.mjs's own
 * buildEntry override.
 *
 * Length target is 75-150 words, not the rest of the corpus's shared 50-80 — a degree-symbol
 * entry carries a vivid image AND the quality it points to, which the rest of the corpus doesn't
 * (a planet-in-sign entry is just the quality). This is safe to diverge on: the only *enforced*
 * length bound is lint.ts's MIN_LENGTH/MAX_LENGTH (40-1600 characters, global, category-agnostic
 * — a garbage backstop, not a style target), and 75-150 words (≈450-900 characters) sits well
 * inside it, same as every other category's 50-80 words does. See
 * `buildDegreeSymbolNegativeConstraintsBlock` (lib/prompt.mjs) for the exact swap.
 *
 * `--max-length-retries` (default 4) re-requests a draft that comes back under the 75-word
 * floor, same shape as generate-batch.mjs's own `--max-language-retries` (which now also retries
 * on this exact condition for degree-symbol, via its `retryReason` helper) — a do/while
 * re-request on a specific failure condition, just inlined per-call since this script has no
 * concurrent queue to reshape it against. A draft still short after every retry is kept anyway
 * (flagged in the console output), not discarded — this is a smoke test, not a batch run with
 * accept/reject semantics.
 *
 *   npx tsx --env-file=.env.local tools/corpus-gen/sample-degree-symbol.mjs
 *   npx tsx --env-file=.env.local tools/corpus-gen/sample-degree-symbol.mjs --count=5
 *   npx tsx --env-file=.env.local tools/corpus-gen/sample-degree-symbol.mjs --degrees=1,91,181,271
 *   npx tsx --env-file=.env.local tools/corpus-gen/sample-degree-symbol.mjs --provider=ollama
 *
 * Plain `node` cannot run this file: schema.ts/lint.ts import bodies.ts/signs.ts as real runtime
 * values through `.js` specifiers that only a TS-aware loader (tsx) remaps back to the sibling
 * .ts files.
 */
/**
 * @module sample-degree-symbol
 * @purpose One-off smoke test (#405) running the full #381 generate→evaluate→improve feedback
 *   loop over a small sample of the degree-symbol seed text, printing the raw result, judge
 *   verdict, any revision, and a cost estimate, without writing anywhere or touching the schema.
 * @conventions Imports its generation prompt from lib/prompt.mjs's degree-symbol builders (the
 *   real pipeline's own, not a local copy), and lib/corpus-evaluation.mjs/lib/corpus-improvement.mjs's
 *   prompt/schema builders verbatim, over synchronous transports (lib/openai.mjs, lib/gemini.mjs)
 *   instead of the Batch API. Tier is fixed to 'nuance' rather than asked of the model, matching
 *   generate-batch.mjs. en only — the seed source is English. Costs real API money per call
 *   (Gemini + OpenAI) unless --provider=ollama (which only affects the generate stage; the judge
 *   stage always uses OpenAI).
 * @exports CLI entry point, no exports.
 */
import { buildDegreeSymbolSystemInstruction, buildDegreeSymbolUserContent } from './lib/prompt.mjs';
import { degreeSymbolExcerpt } from './lib/placements.mjs';
import { CORPUS_ENTRY_RESPONSE_SCHEMA } from '../../src/interpretation/schema.ts';
import { SIGNS } from '../../src/astrology/signs.ts';
import { estimateCostCentsForCall, formatCents } from './lib/cost-estimate.mjs';
import { EVALUATION_RESPONSE_SCHEMA, buildEvaluationPrompt, majorityVerdict } from './lib/corpus-evaluation.mjs';
import { IMPROVEMENT_RESPONSE_SCHEMA, buildImprovementPrompt } from './lib/corpus-improvement.mjs';
import { generateStructured as openaiGenerateStructured } from './lib/openai.mjs';

const rawArgs = process.argv.slice(2);
if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(
    [
      'Usage: npx tsx --env-file=.env.local tools/corpus-gen/sample-degree-symbol.mjs [--count=N] [--degrees=d1,d2,...] [--provider=gemini|ollama] [--max-length-retries=N]',
      '',
      '   e.g.: npx tsx --env-file=.env.local tools/corpus-gen/sample-degree-symbol.mjs',
      '         npx tsx --env-file=.env.local tools/corpus-gen/sample-degree-symbol.mjs --count=5',
      '         npx tsx --env-file=.env.local tools/corpus-gen/sample-degree-symbol.mjs --degrees=1,91,181,271',
      '',
      "Rewrites a sample of #405's degree-symbol seed text (the CC0 1655 Angelus/Turner",
      'excerpts) into Astraya house style, then runs it through the full #381 feedback loop —',
      'an independent OpenAI judge, and (only if flagged) a Gemini revision — the same three',
      'stages generate-batch.mjs/evaluate-corpus-batch.mjs/improve-corpus-batch.mjs run for every',
      'other category, just synchronous instead of via the Batch API. Prints the raw result,',
      'judge verdict and any revision, plus a cost estimate. Never writes to',
      'src/interpretation/corpus/*.json and never touches the "degree-symbol" category in',
      'schema.ts, which is not registered yet — this is purely the pre-decision quality/cost',
      "check #405's own commit (b80387e) asks for. en only.",
      '',
      'Options:',
      '  --count=N                  How many degrees to sample, evenly spread across the zodiac.',
      '                             Ignored if --degrees is given. Default: 10.',
      '  --degrees=d1,d2,...        Exact 1-360 global degree numbers to sample instead of an',
      '                             even spread.',
      '  --provider=gemini|ollama   Which model generates the text (the judge stage always uses',
      '                             OpenAI regardless). --provider=ollama is free (local) but is',
      '                             not the production model. Default: gemini.',
      '  --max-length-retries=N     How many times to re-request a draft that comes back under',
      '                             the 75-word floor, from the same model/prompt, before giving',
      '                             up and keeping the last (short) attempt. Mirrors',
      "                             generate-batch.mjs's own --max-language-retries, keyed on",
      '                             word count instead of language. Default: 4.',
      '',
      'Costs real API money per call (Gemini generate/revise + OpenAI judge) unless',
      '--provider=ollama (which only exempts the generate stage). Must run under npx tsx, not',
      'plain node — imports .ts files via .js specifiers that only a TS-aware loader remaps.',
    ].join('\n'),
  );
  process.exit(0);
}

const providerFlag = rawArgs.find((arg) => arg.startsWith('--provider='));
const provider = providerFlag ? providerFlag.slice('--provider='.length) : 'gemini';
if (provider !== 'gemini' && provider !== 'ollama')
  throw new Error(`--provider must be "gemini" or "ollama", got "${provider}"`);
const { generateStructured } = await import(provider === 'ollama' ? './lib/ollama.mjs' : './lib/gemini.mjs');
const model = provider === 'ollama' ? process.env.OLLAMA_MODEL || 'gemma4' : process.env.GEMINI_MODEL;
const baseUrl = provider === 'ollama' ? process.env.OLLAMA_BASE_URL : process.env.GEMINI_BASE_URL;

const degreesFlag = rawArgs.find((arg) => arg.startsWith('--degrees='));
const countFlag = rawArgs.find((arg) => arg.startsWith('--count='));
const count = countFlag ? Number(countFlag.slice('--count='.length)) : 10;
const maxLengthRetriesFlag = rawArgs.find((arg) => arg.startsWith('--max-length-retries='));
const MAX_LENGTH_RETRIES = maxLengthRetriesFlag
  ? Number(maxLengthRetriesFlag.slice('--max-length-retries='.length))
  : 4;
const MIN_WORDS = 75; // Matches DEGREE_SYMBOL_LENGTH_CONSTRAINT's own stated floor.

/** An even spread across all 360 degrees, so a small sample still crosses several signs rather than clustering in one. */
function evenSpread(n) {
  const step = Math.floor(360 / n);
  return Array.from({ length: n }, (_, i) => ((i * step) % 360) + 1);
}

const degrees = degreesFlag
  ? degreesFlag
      .slice('--degrees='.length)
      .split(',')
      .map((s) => Number(s.trim()))
  : evenSpread(count);

for (const d of degrees) {
  if (!Number.isInteger(d) || d < 1 || d > 360) throw new Error(`degree ${String(d)} out of range 1-360`);
}

/** Plain word count — the same measure DEGREE_SYMBOL_LENGTH_CONSTRAINT's floor is stated in. */
function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** `degree-symbol:<n>`'s sign name and position within that sign, for the console header only — never sent to the model. */
function degreeLabel(n) {
  const signIndex = Math.floor((n - 1) / 30);
  const withinSign = ((n - 1) % 30) + 1;
  return `${SIGNS[signIndex]?.name ?? String(signIndex)} ${String(withinSign)}°`;
}

console.log(`PROVIDER: ${provider}  MODEL: ${String(model)}  TEMPERATURE: ${process.env.GEMINI_TEMPERATURE}`);
console.log(`SAMPLING ${String(degrees.length)} DEGREES: ${degrees.join(', ')}\n`);

const OPENAI_JUDGE_MODEL = 'gpt-6-luna'; // evaluate-corpus-batch.mjs's own validated default (lib/corpus-evaluation.mjs).
const FIXED_TIER = 'nuance'; // See header: no entity to key a per-placement tier decision off.

let totalCostCents = 0;
let costUnknown = false;
let flaggedCount = 0;
let improvedCount = 0;
let stillShortCount = 0;
const results = [];

function trackCost(costCents) {
  if (costCents === undefined) costUnknown = true;
  else totalCostCents += costCents;
  return costCents;
}

for (const n of degrees) {
  const key = `degree-symbol:${String(n)}`;
  const excerpt = degreeSymbolExcerpt(n);
  // The judge's and reviser's ground truth for this entry — the degree's own traditional image,
  // the same role a planet-in-sign entry's factsDescription plays for its judge.
  const factsDescription = `The traditional (1655 Angelus/Turner) image for this exact degree is: ${excerpt}`;

  console.log('='.repeat(80));
  console.log(`${key} — ${degreeLabel(n)}`);
  console.log('-'.repeat(80));
  console.log(`SOURCE: ${excerpt}`);
  console.log('-'.repeat(80));

  // STAGE 1 — generate (Gemini by default; --provider=ollama for the free local smoke test).
  // Reuses the real pipeline's own degree-symbol builders (lib/prompt.mjs) rather than a local
  // copy — see module header.
  const systemInstruction = buildDegreeSymbolSystemInstruction({
    locale: 'en',
    forceLanguageDirective: provider === 'ollama',
  });
  const userContent = buildDegreeSymbolUserContent({ excerpt });

  // Retry-until-long-enough, same shape as generate-batch.mjs's own --max-language-retries loop
  // (a do/while re-requesting the same model/prompt on a specific failure condition, here word
  // count instead of language), just inlined per-call since this script has no concurrent queue
  // to reshape it against.
  let draft;
  let draftWords;
  let attempt = 0;
  try {
    do {
      attempt += 1;
      let usage;
      draft = await generateStructured({
        apiKey: process.env.GEMINI_API_KEY,
        model,
        baseUrl,
        temperature: Number(process.env.GEMINI_TEMPERATURE ?? '0.75'),
        systemInstruction,
        userContent,
        responseSchema: CORPUS_ENTRY_RESPONSE_SCHEMA,
        onUsage: (u) => {
          usage = u;
        },
      });
      trackCost(
        estimateCostCentsForCall({
          provider,
          model,
          promptTokens: usage?.promptTokenCount,
          outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
        }),
      );
      draftWords = wordCount(draft.text);
      if (draftWords < MIN_WORDS && attempt < MAX_LENGTH_RETRIES) {
        console.log(
          `  (attempt ${String(attempt)}/${String(MAX_LENGTH_RETRIES)} came back at ${String(draftWords)} words, under the ${String(MIN_WORDS)}-word floor — regenerating)`,
        );
      }
    } while (draftWords < MIN_WORDS && attempt < MAX_LENGTH_RETRIES);
  } catch (error) {
    console.error(`GENERATION FAILED for ${key}: ${error.message}`);
    continue;
  }

  if (draftWords < MIN_WORDS) stillShortCount += 1;
  console.log(
    `DRAFT (tier fixed to ${FIXED_TIER}; model guessed "${draft.tier}"; ${String(draftWords)} words` +
      (draftWords < MIN_WORDS
        ? `, still under the ${String(MIN_WORDS)}-word floor after ${String(attempt)} attempt(s)`
        : '') +
      `): ${draft.text}`,
  );

  // STAGE 2 — independent second opinion (#381 stage 1), always OpenAI regardless of --provider:
  // the whole point is a different model family than whatever generated the draft.
  const evalPrompt = buildEvaluationPrompt({ factsDescription, entryText: draft.text });
  let evalUsage;
  let ballot;
  try {
    const evalResult = await openaiGenerateStructured({
      apiKey: process.env.OPENAI_API_KEY,
      model: OPENAI_JUDGE_MODEL,
      systemInstruction: evalPrompt.systemInstruction,
      userContent: evalPrompt.userContent,
      responseSchema: EVALUATION_RESPONSE_SCHEMA,
      schemaName: 'evaluation',
      onUsage: (u) => {
        evalUsage = u;
      },
    });
    ballot = { result: evalResult };
  } catch (error) {
    console.error(`  JUDGE FAILED for ${key}: ${error.message}`);
    ballot = { error: error.message };
  }
  trackCost(
    estimateCostCentsForCall({
      provider: 'openai',
      model: OPENAI_JUDGE_MODEL,
      promptTokens: evalUsage?.prompt_tokens,
      outputTokens: evalUsage?.completion_tokens,
    }),
  );

  const verdict = majorityVerdict([ballot]);
  let finalText = draft.text;
  let revision;
  if (!verdict.correct) {
    flaggedCount += 1;
    console.log(`  JUDGE: flagged — ${verdict.issues.join(' | ')}`);

    // STAGE 3 — the same model that wrote it reviews the complaint critically, not automatically
    // (#381's own explicit design: a second opinion can itself be wrong).
    const improvePrompt = buildImprovementPrompt({
      baseSystemInstruction: systemInstruction,
      factsDescription,
      originalText: draft.text,
      issues: verdict.issues,
    });
    let improveUsage;
    try {
      revision = await generateStructured({
        apiKey: process.env.GEMINI_API_KEY,
        model,
        baseUrl,
        temperature: Number(process.env.GEMINI_TEMPERATURE ?? '0.75'),
        systemInstruction: improvePrompt.systemInstruction,
        userContent: improvePrompt.userContent,
        responseSchema: IMPROVEMENT_RESPONSE_SCHEMA,
        onUsage: (u) => {
          improveUsage = u;
        },
      });
      trackCost(
        estimateCostCentsForCall({
          provider,
          model,
          promptTokens: improveUsage?.promptTokenCount,
          outputTokens: (improveUsage?.candidatesTokenCount ?? 0) + (improveUsage?.thoughtsTokenCount ?? 0),
        }),
      );
      console.log(`  REVIEW: ${revision.verdict} — ${revision.reasoning}`);
      if (revision.verdict === 'IMPROVED') {
        improvedCount += 1;
        finalText = revision.text;
        console.log(`  REVISED: ${finalText}`);
      }
    } catch (error) {
      console.error(`  IMPROVE FAILED for ${key}: ${error.message}`);
    }
  } else {
    console.log(`  JUDGE: clean (${String(verdict.valid)} ballot(s))`);
  }

  results.push({ key, degree: n, label: degreeLabel(n), source: excerpt, text: finalText, tier: FIXED_TIER });
}

console.log('='.repeat(80));
console.log(
  `TOTAL for ${String(results.length)} degrees (generate + judge + any revision): ` +
    (costUnknown ? `${formatCents(totalCostCents)}+ (some calls had unknown pricing)` : formatCents(totalCostCents)),
);
console.log(
  `Flagged by the judge: ${String(flaggedCount)}/${String(results.length)}; revised: ${String(improvedCount)}; ` +
    `still under ${String(MIN_WORDS)} words after retries: ${String(stillShortCount)}/${String(results.length)}`,
);
console.log(
  `\nExtrapolated to all 360 degrees (en only): ~${formatCents((totalCostCents / Math.max(results.length, 1)) * 360)}` +
    ' (double for nl if generated the same way rather than cross-translated).',
);
console.log('\nNot written anywhere — this script only generates and prints, per the smoke-test scope above.');
