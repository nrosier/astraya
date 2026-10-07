# tools/corpus-gen/ — Map

Build-time interpretation-corpus tooling (18 scripts + shared lib in `lib/`). Regenerates `src/interpretation/corpus/en.json` and `nl.json`. Several scripts cost real API money (Gemini, OpenAI, astrologyapi.com).

**Critical:** Check `--help` before running any script. Never run from CI. Some write directly to shipped corpus/scratch state (batch-state/, eval-tracking/, feedback/, backups/, .data/) — not tracked here. This map documents the 18 scripts only; see `lib/MAP.md` for shared library modules.

Scripts:

- `audit-corpus.mjs` — Repeatable corpus checks (#427): key shape, locale parity, sign/house index shifts. Read-only, no API key.
- `benchmark-batch.mjs` — External quality signal (#368 Part 3): compare Astraya's prose vs. astrologyapi.com's for same placement. Samples, judges with Laya + embeddings + LLM. Calls astrologyapi.com, Gemini.
- `benchmark-dashboard.mjs` — Static HTML view of `benchmark-batch.mjs` history (sortable/filterable). Read-only, no API key.
- `classical-triage-batch.mjs` — Check `dignity-state` corpus vs. William Lilly (#359). Judge model over entry + excerpt, tag divergences. Calls Gemini/Ollama.
- `corpus-stats.mjs` — Visibility into #381 feedback-loop progress without re-running. Per-locale counts, in-flight batch jobs. Read-only, no API key.
- `evaluate-corpus-batch.mjs` — Independent second opinion (#381 stage 1) using different model family (OpenAI). Detects generic-trope/stereotyped-shadow. Calls OpenAI Batch API.
- `generate-batch.mjs` — Primary corpus writer (#56). Generates/regenerates full placement scope, resumably/idempotently. Calls Gemini/Ollama.
- `generate-sample.mjs` — Fast demo: one entry for one placement, print with lint/dedupe diagnostics. No corpus touch. Calls Gemini/Ollama.
- `improve-corpus-batch.mjs` — Close #381 feedback loop: original model reviews judge's complaints, selectively acts on flagged entries. Applies lint-checked rewrites. Calls Gemini Batch API.
- `language-quality-batch.mjs` — Catch fluency problems (typos, mixed-language) that keyword-count can't. Judges each entry's locale fluency, high-confidence auto-fixes + flag rest. Calls Gemini/Ollama.
- `pilot-benchmark-cost.mjs` — One-off scouting (#368): one call per astrologyapi.com endpoint, raw responses for manual review. Calls astrologyapi.com.
- `recover-batch.mjs` — Disaster recovery: re-fetch already-completed OpenAI batch job output, write flagged entries to feedback. Calls OpenAI.
- `remove-by-model.mjs` — Retract bad/superseded model's output: dry-run-by-default removal per provenance.model, backup + concurrency guard. No API calls.
- `remove-by-tag.mjs` — General cleanup by tag (e.g. language-quality flags): dry-run-by-default removal, backup + concurrency guard. No API calls.
- `remove-quintile-series-entries.mjs` — One-time correction #396: regen quintile/biquintile aspect entries under better prompt, remove + orphaned loop state. No API calls.
- `remove-same-point-variant-pairs.mjs` — One-time correction #395: remove aspect entries between calculation-method variants of same real point (meanNode/trueNode). No API calls.
- `sample-validate-batch.mjs` — Pre-regen confidence check (#368): sample category, generate candidates, judge for fact-grounding + lint, report-only. Never writes corpus. Calls Gemini/Ollama.
- `verify-batch.mjs` — First trustworthiness signal (#359): check each entry's text vs. computed facts, additively tag mismatches without altering text. Calls Gemini/Ollama.
