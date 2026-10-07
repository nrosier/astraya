# tools/corpus-gen/ — file map

Build-time-only tooling. `tools/` can never be imported from `src/` (lint-enforced via
`no-restricted-imports` in `eslint.config.js`) — the corpus generator is a build-time LLM
client; a stray import would ship a model client in the browser bundle. These scripts draft
and maintain the committed interpretation corpus (`src/interpretation/corpus/en.json` and
`nl.json`), which is data checked into the repo, not something the shipped app regenerates.

Several of these scripts cost real API money per invocation (Gemini, OpenAI, or
astrologyapi.com calls) — check each script's own `--help` output (per the repo's own
convention) before running it, and never run one from CI or casually on every change. Some
also write directly to the shipped corpus files or to local scratch state
(`batch-state/`, `eval-tracking/`, `feedback/`, `backups/`, `.data/`) — none of that is
covered by this map; this map documents the 18 scripts directly in this directory only. See
`tools/corpus-gen/lib/MAP.md` for the shared library modules these scripts import.

## Scripts

### `audit-corpus.mjs`
**Domain purpose:** Repeatable, mechanical check (#427) that the committed corpus hasn't drifted — key shape, locale parity, sign/house index shifts. **Responsibility:** Runs `lib/corpus-audit.mjs`'s audit over both locales and exits 1 on failure. **Key dependencies:** `lib/corpus-audit.mjs`. Read-only, no API key.

### `benchmark-batch.mjs`
**Domain purpose:** External quality signal (#368 Part 3) comparing Astraya's own text to a third-party vendor's prose for the same real placement. **Responsibility:** Samples placements, calls astrologyapi.com, judges both texts with Laya + a local embedding model + a local LLM, and persists scores. **Key dependencies:** `lib/benchmark-charts.mjs`, `lib/benchmark-db.mjs`, `lib/prompt.mjs`, `lib/placements.mjs`, `lib/ollama.mjs`, `lib/gemini.mjs`/`lib/cost-estimate.mjs`; calls astrologyapi.com and (optionally) Gemini.

### `benchmark-dashboard.mjs`
**Domain purpose:** Human-readable view of `benchmark-batch.mjs`'s accumulated history. **Responsibility:** Renders a static HTML dashboard from the local sqlite results, with sortable/filterable tables and per-row detail. **Key dependencies:** `lib/benchmark-db.mjs`. No API calls.

### `classical-triage-batch.mjs`
**Domain purpose:** Checks the `dignity-state` corpus slice against a genuine classical astrological source (William Lilly) for substantive agreement (#359). **Responsibility:** Runs a judge model over each entry + its matching excerpt and tags divergences for human review. **Key dependencies:** `lib/classical-triage.mjs`, `lib/write-corpus.mjs`; calls Gemini or Ollama.

### `corpus-stats.mjs`
**Domain purpose:** Visibility into #381's feedback-loop progress without re-running anything. **Responsibility:** Reports per-locale counts of checked/validated/disputed/pending entries and in-flight batch jobs. **Key dependencies:** `lib/eval-tracking.mjs`, `lib/corpus-feedback.mjs`, `lib/batch-state.mjs`. Read-only, no API key, plain Node.

### `evaluate-corpus-batch.mjs`
**Domain purpose:** Independent second opinion on the corpus (#381 stage 1) using a different model family than the generator, catching generic-trope/stereotyped-shadow writing a same-model judge might miss. **Responsibility:** Submits/checks OpenAI Batch API jobs judging entries, writes flagged ones to the feedback file. **Key dependencies:** `lib/corpus-evaluation.mjs`, `lib/openai-batch.mjs`, `lib/placements.mjs`, `lib/corpus-feedback.mjs`, `lib/eval-tracking.mjs`, `lib/batch-state.mjs`, `lib/cost-estimate.mjs`; calls OpenAI's Batch API.

### `generate-batch.mjs`
**Domain purpose:** The primary writer of the shipped interpretation corpus (#56) — every reader-facing placement text originates here. **Responsibility:** Generates or regenerates entries across the full restricted placement scope, resumably and idempotently. **Key dependencies:** `lib/prompt.mjs`, `lib/gemini-batch.mjs`, `lib/write-corpus.mjs`, `lib/placements.mjs`; calls Gemini or Ollama.

### `generate-sample.mjs`
**Domain purpose:** Fast manual smoke test for the generation pipeline and prompt changes, without touching the shipped corpus. **Responsibility:** Generates one entry for one placement and prints it with lint/dedupe diagnostics. **Key dependencies:** `lib/prompt.mjs`, `lib/cost-estimate.mjs`; calls Gemini or Ollama.

### `improve-corpus-batch.mjs`
**Domain purpose:** Closes #381's feedback loop by letting the original generating model critically review and selectively act on the independent judge's complaints. **Responsibility:** Submits/checks Gemini Batch API jobs revising flagged entries, applies lint-checked rewrites to the corpus. **Key dependencies:** `lib/corpus-improvement.mjs`, `lib/gemini-batch.mjs`, `lib/placements.mjs`, `lib/write-corpus.mjs`, `lib/corpus-feedback.mjs`, `lib/eval-tracking.mjs`, `lib/batch-state.mjs`, `lib/cost-estimate.mjs`; calls Gemini's Batch API.

### `language-quality-batch.mjs`
**Domain purpose:** Catches fluency problems (typos, mixed-language slips) that a cheap keyword-count check structurally can't. **Responsibility:** Judges each entry's prose for its declared locale, applying high-confidence mechanical fixes directly and flagging the rest. **Key dependencies:** `lib/language-quality.mjs`, `lib/gemini-batch.mjs`, `lib/write-corpus.mjs`, `lib/cost-estimate.mjs`; calls Gemini (default `gemini-3.5-flash-lite`) or Ollama.

### `pilot-benchmark-cost.mjs`
**Domain purpose:** One-off scouting pass (#368) to see whether astrologyapi.com's prose is even a usable comparison point before building the real benchmark tooling. **Responsibility:** Makes one real call per mapped report endpoint and keeps the raw responses for manual review. **Key dependencies:** none from `lib/`; calls astrologyapi.com directly.

### `recover-batch.mjs`
**Domain purpose:** Disaster-recovery utility for an OpenAI batch job whose results were never applied (e.g. a crashed run). **Responsibility:** Re-fetches an already-completed batch's output and writes any flagged entries into the feedback file. **Key dependencies:** none from `lib/` (talks to the OpenAI API directly); calls OpenAI.

### `remove-by-model.mjs`
**Domain purpose:** Lets a bad or superseded generation model's output be cleanly retracted from the corpus. **Responsibility:** Dry-run-by-default removal of every entry attributed to a given `provenance.model`, with backup and a concurrency guard. **Key dependencies:** `lib/write-corpus.mjs`.

### `remove-by-tag.mjs`
**Domain purpose:** General-purpose counterpart to `remove-by-model.mjs` for any tag-based cleanup (e.g. language-quality flags). **Responsibility:** Dry-run-by-default removal of every entry carrying a given tag, with backup and a concurrency guard. **Key dependencies:** `lib/write-corpus.mjs`.

### `remove-quintile-series-entries.mjs`
**Domain purpose:** One-time (but reusable) correction for #396: regenerates quintile/biquintile aspect entries under a prompt that actually gives them a distinctive flavor. **Responsibility:** Removes every quintile-series aspect-pair/synastry-aspect entry plus its orphaned loop state. **Key dependencies:** `lib/write-corpus.mjs`, `lib/eval-tracking.mjs`, `lib/corpus-feedback.mjs`.

### `remove-same-point-variant-pairs.mjs`
**Domain purpose:** One-time (but reusable) correction for #395: removes aspect entries between calculation-method variants of the same real point (e.g. meanNode/trueNode), which never had independent meaning. **Responsibility:** Same removal shape as the two scripts above, scoped to same-point-variant pairs. **Key dependencies:** `lib/write-corpus.mjs`, `lib/eval-tracking.mjs`, `lib/corpus-feedback.mjs`, `src/astrology/bodies.ts`.

### `sample-validate-batch.mjs`
**Domain purpose:** Pre-regeneration confidence check (#368) for a category/provider combination, especially Ollama's long-tail categories, before committing to a full run. **Responsibility:** Samples a category's placement space, generates candidates with the real prompt builder, and judges them against fact-grounding + lint — report-only, never writes to the shipped corpus. **Key dependencies:** `lib/prompt.mjs`, `lib/verify.mjs`, `lib/placements.mjs`, `lib/cost-estimate.mjs`; calls Gemini and/or Ollama.

### `verify-batch.mjs`
**Domain purpose:** The first trustworthiness signal (#359) for corpus content that previously shipped with zero verification. **Responsibility:** Checks each shipped entry's text against its own computed facts and additively tags any mismatch for human review (#292), without altering the text. **Key dependencies:** `lib/verify.mjs`, `lib/write-corpus.mjs`, `lib/placements.mjs`, `lib/cost-estimate.mjs`; calls Gemini or Ollama.
