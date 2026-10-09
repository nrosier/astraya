# tools/corpus-gen/lib/ — Map

Shared library modules for `tools/corpus-gen/` scripts (see parent directory for scripts). Most files are prompt builders, provider clients, or persistence helpers with no CLI entry point.

- `batch-state.mjs` — Batch-API job persistence: submit/check across separate runs instead of blocking (24-48h jobs). Reads/writes per-(script, locale) JSON under `batch-state/`. Deps: node:fs.
- `benchmark-charts.mjs` — Ground comparison in real chart data (astrologyapi.com pool), derive every in-scope placement (sign/house/aspect) via Astraya math. Deps: src/astrology/*, src/interpretation/schema.
- `benchmark-db.mjs` — Local sqlite for `benchmark-batch.mjs` (persistent scores, purgeable third-party-text cache). Deps: node:sqlite.
- `classical-triage.mjs` — Rubric for comparing `dignity-state` entry vs. genuine classical source. Builds judge system/user prompt + response schema. Deps: none.
- `corpus-audit.mjs` — Codifies manual corpus checks (#427). Validates key/duplicates/locale-parity, sign/house theme-shift heuristic. Deps: placements, src/interpretation/schema.
- `corpus-evaluation.mjs` — Independent second-opinion judge (#381 stage 1) for fact errors + generic-trope failure mode. Builds prompt/schema, majority verdict. Deps: none.
- `corpus-feedback.mjs` — Hand-off between #381 two batch stages: reads/writes `feedback/<locale>.json` (evaluate→improve). Deps: node:fs.
- `corpus-improvement.mjs` — Let original model review judge's complaint before applying blindly. Revision prompt/schema + narrowly-scoped last-resort. Deps: none.
- `cost-estimate.mjs` — Consistent post-run cost estimate (provider/model/tier/tokens → USD cents). Pricing tables kept current vs. OpenAI/Gemini pages. Deps: none.
- `eval-tracking.mjs` — Prevent re-checking already-judged-clean/exhausted entries (#381). Reads/writes `eval-tracking/<locale>.json`. Deps: node:fs.
- `gemini-batch.mjs` — Gemini Batch API jobs (discounted bulk rate). Submit inline requests, poll/fetch status, extract per-request results keyed by caller. Deps: gemini.
- `gemini.mjs` — Default structured-output generation/judging backend (sync, retry-on-5xx). Deps: none (calls Gemini API).
- `language-quality.mjs` — Catch subtle non-mechanical fluency (typos, mixed-language). GOOD/FIXED/BAD proofreading judge prompt/schema per locale. Deps: none.
- `ollama.mjs` — Local free generation/judging against Ollama server (mirrors `gemini.mjs` contract). Plus `/api/embed` helper. Deps: none (calls localhost:11434).
- `openai-batch.mjs` — OpenAI Batch API: upload JSONL, create/poll/retrieve job, detect stalled in-progress, parse output + error files. Deps: none (calls OpenAI Batch/Files API).
- `openai.mjs` — Synchronous OpenAI structured-output client, `openai-batch.mjs`'s sibling (reuses its request-body builder, swaps the transport). Deps: openai-batch (calls OpenAI chat/completions API).
- `placements.mjs` — Single definition of "every corpus placement" (sign/house/aspect/dignity/profection/astro-line/composite/degree-symbol). Renders as generator description or judge facts; loads the #405 seed JSON for degree-symbol. Deps: src/interpretation/symbolism, src/astrology/bodies/signs/aspects/dignities, classical-texts/degree-symbol.en.json.
- `prompt.mjs` — House-style voice + hard constraints, system instruction + user content for generation request. Builds once; `generate-batch.mjs` and `generate-sample.mjs` never drift. Also has degree-symbol's (#405) own voice/constraints/builders (`DEGREE_SYMBOL_*`, `buildDegreeSymbol*`), not the shared disposition ones. Deps: none.
- `verify.mjs` — Narrowest quality check (mechanical fact-grounding only). Judge prompt/schema checking text vs. placement's computed facts. Deps: none.
- `write-corpus.mjs` — Only sanctioned way scripts write `src/interpretation/corpus/<locale>.json` (unrelated entries never reformatted). Atomic `writeCorpus`, surgical span-based delete. Deps: prettier.
