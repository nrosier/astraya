# tools/corpus-gen/lib/ — file map

Shared library modules imported by the batch/CLI scripts in `tools/corpus-gen/` (see that
directory's own `MAP.md` for the scripts themselves, and for the build-time-only / no-src-import
/ costs-real-money context that applies to this whole area). Most files here are prompt
builders, provider clients, or small persistence helpers with no CLI entry point of their own.

## Modules

### `batch-state.mjs`
**Domain purpose:** Lets a batch-API job (which can take up to 24-48h) be submitted and checked across separate process runs instead of blocking a terminal. **Responsibility:** Reads/writes/clears a per-(script, locale) JSON state file under `batch-state/`. **Key dependencies:** none (plain `node:fs`).

### `benchmark-charts.mjs`
**Domain purpose:** Grounds `benchmark-batch.mjs`'s comparison in real, shared chart data rather than a hypothetical placement. **Responsibility:** Fetches a fixed pool of real charts from astrologyapi.com and derives every in-scope placement (sign/house/aspect) from them with Astraya's own pure math. **Key dependencies:** `src/astrology/bodies.ts`, `src/astrology/signs.ts`, `src/astrology/emphasis.ts`, `src/astrology/aspects.ts`, `src/interpretation/schema.ts`; calls astrologyapi.com.

### `benchmark-db.mjs`
**Domain purpose:** Persistence layer behind `benchmark-batch.mjs`/`benchmark-dashboard.mjs` so repeated runs don't re-pay for already-checked placements. **Responsibility:** Opens/manages a local sqlite database with two tables — durable scores (`benchmark_results`, never holds third-party prose) and a temporary, purgeable third-party-text cache (`thirdparty_cache`). **Key dependencies:** `node:sqlite`.

### `classical-triage.mjs`
**Domain purpose:** Supplies the rubric for comparing a modern `dignity-state` entry against a genuine classical source. **Responsibility:** Builds the judge's system/user prompt content and response schema. **Key dependencies:** none; consumed by `classical-triage-batch.mjs`.

### `corpus-audit.mjs`
**Domain purpose:** Codifies the manual checks that first caught a corpus key-scheme problem, so they run automatically on every regeneration. **Responsibility:** Validates key shape/duplicates/locale-parity and runs a sign/house theme-shift heuristic over the full corpus. **Key dependencies:** `lib/placements.mjs`, `src/interpretation/schema.ts`; consumed by `audit-corpus.mjs`.

### `corpus-evaluation.mjs`
**Domain purpose:** The independent-second-opinion half of #381's feedback loop — looks for fact errors and the "generic trope" failure mode the generator's own prompt tries to avoid. **Responsibility:** Builds the evaluation prompt/schema and computes a majority verdict across multiple judge ballots. **Key dependencies:** none directly; consumed by `evaluate-corpus-batch.mjs`, which calls OpenAI's Batch API.

### `corpus-feedback.mjs`
**Domain purpose:** The hand-off point between #381's two batch stages. **Responsibility:** Reads/writes/updates the per-locale `feedback/<locale>.json` file that `evaluate-corpus-batch.mjs` writes to and `improve-corpus-batch.mjs` reads from. **Key dependencies:** none (plain `node:fs`).

### `corpus-improvement.mjs`
**Domain purpose:** Lets the original generating model critically review a judge's complaint rather than applying it blindly. **Responsibility:** Builds the revision prompt/schema, including a narrowly-scoped last-resort variant for entries stuck in disagreement. **Key dependencies:** none directly; consumed by `improve-corpus-batch.mjs`, which calls Gemini's Batch API.

### `cost-estimate.mjs`
**Domain purpose:** Gives every corpus-gen script a consistent, visible cost estimate after a run, so a run's real-money impact is never silently invisible. **Responsibility:** Maps provider/model/tier/token-usage to an estimated USD cost in cents, from pricing tables kept current against OpenAI's and Gemini's own pricing pages. **Key dependencies:** none; consumed by nearly every script in `tools/corpus-gen/`.

### `eval-tracking.mjs`
**Domain purpose:** Prevents #381's feedback loop from re-checking (and re-paying for) entries already judged clean or already exhausted. **Responsibility:** Reads/writes/updates the per-locale `eval-tracking/<locale>.json` file and judges whether an entry still needs evaluation. **Key dependencies:** none (plain `node:fs`).

### `gemini-batch.mjs`
**Domain purpose:** Lets corpus-gen scripts process a whole array of generation/judging requests as one discounted-rate Gemini job instead of one call per item. **Responsibility:** Submits inline batch requests, polls/fetches job status, and extracts per-request results keyed by a caller-supplied key. **Key dependencies:** `lib/gemini.mjs` (shares `toGeminiSchema`/`DEFAULT_BASE_URL`); calls the Gemini Batch API.

### `gemini.mjs`
**Domain purpose:** The default synchronous generation/judging backend for most corpus-gen scripts. **Responsibility:** One structured-output request/response round-trip against the Gemini API, with retry-on-5xx behavior. **Key dependencies:** none; calls the Gemini API directly.

### `language-quality.mjs`
**Domain purpose:** Catches subtle, non-mechanical fluency problems a cheap keyword-count rule can't. **Responsibility:** Builds the GOOD/FIXED/BAD proofreading judge prompt/schema for one entry's text in its declared locale. **Key dependencies:** none directly; consumed by `language-quality-batch.mjs`, which calls Gemini or Ollama.

### `ollama.mjs`
**Domain purpose:** Lets corpus-gen scripts run generation/judging for free against a local model instead of a paid hosted API. **Responsibility:** Mirrors `gemini.mjs`'s `generateStructured` contract against a local Ollama server, plus an `/api/embed` embedding helper. **Key dependencies:** none; calls a local Ollama server (`localhost:11434` by default).

### `openai-batch.mjs`
**Domain purpose:** OpenAI's half of the two-provider batch-judging setup #381 relies on. **Responsibility:** Uploads a JSONL batch file, creates/polls/retrieves the batch job, detects a stalled in-progress job, and parses both output and error result files. **Key dependencies:** none; calls the OpenAI Batch/Files API.

### `placements.mjs`
**Domain purpose:** The single definition of "every placement the corpus covers," so no two scripts can quietly disagree about scope. **Responsibility:** Builds the full placement list (sign/house/aspect/dignity/profection/astro-line/composite) and renders each as a generator-facing description or a judge-facing facts statement. **Key dependencies:** `src/interpretation/symbolism.ts`, `src/astrology/bodies.ts`, `src/astrology/signs.ts`, `src/astrology/aspects.ts`, `src/astrology/dignities.ts`; consumed by most generation/validation scripts.

### `prompt.mjs`
**Domain purpose:** The one place the corpus's house-style voice and hard constraints live, so the real batch runner and the demo script can never drift apart (#56). **Responsibility:** Builds the system instruction (voice + negative constraints + symbolism context + optional language directive) and user content (target placement + anchors + aspect flavor hints) for a generation request. **Key dependencies:** none directly; consumed by `generate-batch.mjs`, `generate-sample.mjs`, `sample-validate-batch.mjs`, `benchmark-batch.mjs`.

### `verify.mjs`
**Domain purpose:** The narrowest, cheapest-to-trust quality check in this directory — mechanical fact-grounding only. **Responsibility:** Builds the fact-grounding judge prompt/schema checking an entry's text against its own placement's computed facts. **Key dependencies:** none directly; consumed by `verify-batch.mjs` and `sample-validate-batch.mjs`.

### `write-corpus.mjs`
**Domain purpose:** The only sanctioned way any script writes to the committed `src/interpretation/corpus/<locale>.json` files, so unrelated entries never get reformatted as a side effect. **Responsibility:** Writes only changed/appended entries back to disk atomically (`writeCorpus`), and offers a surgical span-based delete for cleanup scripts (`removeCorpusEntries`). **Key dependencies:** `prettier` (for canonical per-entry formatting).
