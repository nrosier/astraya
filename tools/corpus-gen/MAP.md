# tools/corpus-gen/ — Map

Build-time interpretation-corpus tooling (17 scripts + shared lib in `lib/`). Regenerates `src/interpretation/corpus/en.json` and `nl.json`. Several scripts cost real API money (Gemini, OpenAI, astrologyapi.com).

**Critical:** Check `--help` before running any script. Never run from CI. Some write directly to shipped corpus/scratch state (batch-state/, eval-tracking/, feedback/, backups/, .data/) — not tracked here. This map documents the 17 active scripts only; see `lib/MAP.md` for shared library modules and `archive/MAP.md` for retired ones.

Scripts:

- `apply-batch-output.mjs` — Manual-recovery counterpart to `evaluate-corpus-batch.mjs`: apply an already-downloaded OpenAI batch output file by hand. No API calls.
- `audit-corpus.mjs` — Repeatable corpus checks (#427): key shape, locale parity, sign/house index shifts. Read-only, no API key.
- `benchmark-batch.mjs` — External quality signal (#368 Part 3): compare Astraya's prose vs. astrologyapi.com's for same placement. Samples, judges with Laya + embeddings + LLM. Calls astrologyapi.com, Gemini.
- `benchmark-dashboard.mjs` — Static HTML view of `benchmark-batch.mjs` history (sortable/filterable). Read-only, no API key.
- `classical-triage-batch.mjs` — Check `dignity-state` corpus vs. William Lilly (#359). Judge model over entry + excerpt, tag divergences. Calls Gemini/Ollama.
- `corpus-stats.mjs` — Visibility into #381 feedback-loop progress without re-running. Per-locale counts, in-flight batch jobs. Read-only, no API key.
- `cross-translate-composite.mjs` — One-off #451 cleanup: cross-translate undisputed `composite-*` entries to replace their disputed-language counterpart, instead of regenerating from scratch. Calls Gemini.
- `evaluate-corpus-batch.mjs` — Independent second opinion (#381 stage 1) using different model family (OpenAI). Detects generic-trope/stereotyped-shadow. Calls OpenAI Batch API.
- `generate-batch.mjs` — Primary corpus writer (#56). Generates/regenerates full placement scope, resumably/idempotently; `degree-symbol` (#405) uses its own voice/length/fixed-tier branch. Calls Gemini/Ollama.
- `generate-sample.mjs` — Fast demo + pre-flight provider smoke test: one entry for one placement, print with lint/dedupe diagnostics. No corpus touch. Calls Gemini/Ollama.
- `improve-corpus-batch.mjs` — Close #381 feedback loop: original model reviews judge's complaints, selectively acts on flagged entries. Applies lint-checked rewrites; branches to the degree-symbol voice (#405) when applicable. Calls Gemini Batch API.
- `language-quality-batch.mjs` — Catch fluency problems (typos, mixed-language) that keyword-count can't. Judges each entry's locale fluency, high-confidence auto-fixes + flag rest. Calls Gemini/Ollama.
- `remove-by-model.mjs` — Retract bad/superseded model's output: dry-run-by-default removal per provenance.model, backup + concurrency guard. No API calls.
- `remove-by-tag.mjs` — General cleanup by tag (e.g. language-quality flags): dry-run-by-default removal, backup + concurrency guard. No API calls.
- `remove-same-point-variant-pairs.mjs` — Correction #395, kept for reuse if a future body addition recreates the same situation: remove aspect entries between calculation-method variants of same real point (meanNode/trueNode). No API calls.
- `sample-degree-symbol.mjs` — Pre-decision smoke test for #405: runs the full generate→judge→revise loop over a sample of degree-symbol entries, synchronous transports, no corpus/schema touch. Calls Gemini + OpenAI.
- `verify-batch.mjs` — First trustworthiness signal (#359): check each entry's text vs. computed facts, additively tag mismatches without altering text. Calls Gemini/Ollama.
