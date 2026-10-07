# src/interpretation — Map

The prose corpus (committed JSON per locale) and the composition pipeline that turns a
`ChartData` + corpus into a written report, the schema/key format every corpus entry
follows, lint/dedupe quality checks, and the Tier 2 (opt-in, per-request LLM-customized)
client contract. `tools/` (a sibling top-level directory, not under here) is the
build-time generator that drafts the corpus and is never imported from `src/`.

The sibling `corpus/` subdirectory holds the committed JSON interpretation corpus data
(`en.json`, `nl.json`) and has its own `corpus/MAP.md`.

Files below are listed alphabetically.

### `compose.ts`

**Domain purpose:** Guarantees a report is never blank even where the corpus has no
entry for a placement yet. **Responsibility:** Mechanically composes a plain,
locale-aware sentence for a `CorpusPlacement` from reference data alone (body/sign/aspect
names, dignity predicates), and resolves a placement's text as "corpus entry if present,
else this fallback." **Key dependencies:** `astrology/bodies.ts`, `astrology/aspects.ts`,
`astrology/signs.ts`, `./schema.ts`. Used by `report.ts` and `symbolism.ts` (for its
exported name tables).

### `corpus-client.ts`

**Domain purpose:** Lets the browser load only the one locale's corpus text it actually
needs, instead of bundling both. **Responsibility:** Fetches a build-generated per-locale
JSON chunk and layers in any admin-authored corpus overrides from the server, soft-failing
to the base chunk if overrides are unavailable. **Key dependencies:** `./schema.ts`
(types only); used by `ReportView.tsx`.

### `dedupe.ts`

**Domain purpose:** Keeps the generated corpus from reading as templated once it reaches
its full size. **Responsibility:** Finds near-duplicate entries within a locale via
character-trigram Jaccard similarity and formats a human-readable report of the pairs
found. **Key dependencies:** `./schema.ts` (types only); used by corpus review tooling.

### `focus-context-schema.ts`

**Domain purpose:** Defines and guards the wire shape of a Tier-2 "focus" request — the
one request type that reaches a third-party model with structured chart data instead of
only placement keys. **Responsibility:** Declares `FocusContext` and friends, and
validates untrusted input against closed sets (known bodies, signs, aspects, houses)
before it can reach a prompt. **Key dependencies:** `astrology/aspects.ts`,
`astrology/bodies.ts`, `astrology/rulership.ts`, `astrology/signs.ts`. Imported by
`focus-context.ts` (which re-exports it) and by the server's validation path.

### `focus-context.ts`

**Domain purpose:** Produces the enriched, de-identified context a model needs to explain
one selected planet's tensions, for the opt-in Tier-2 "focus" interpretation mode.
**Responsibility:** Computes a focus body's sign/house/dispositor/ruled-houses/angle and
its aspects (natal or transiting), applying the reader's rulership choice.
**Key dependencies:** `astrology/aspects.ts`, `astrology/bodies.ts`,
`astrology/rulership.ts`, `astrology/emphasis.ts`, `astrology/signs.ts`,
`domain/chart-compute.ts`, `ephemeris/types.ts`, `./focus-context-schema.ts`.

### `index.ts`

**Domain purpose:** The one place the full, both-locales corpus is loaded synchronously
for validation and tests. **Responsibility:** Statically imports `corpus/en.json` and
`corpus/nl.json`, runs them through `loadCorpus`, and re-exports the schema module.
**Key dependencies:** `./corpus/en.json`, `./corpus/nl.json`, `./loader.ts`, `./schema.ts`.
Not meant for the browser bundle (see `corpus-client.ts` for that path).

### `lint.ts`

**Domain purpose:** The style gate every corpus entry — hand-written or
generator-produced — must pass before shipping. **Responsibility:** Heuristic,
deterministic checks for length, fatalistic phrasing, medical/legal/financial claims,
gendered pronouns, language mismatch, and (corpus-wide) repetitive openings.
**Key dependencies:** `./schema.ts` (types only). Its exported phrase/term lists and
`containsTermFromWordStart` are reused by `prompt-guardrail.ts`.

### `loader.ts`

**Domain purpose:** The final gate a corpus must pass before the app will use it.
**Responsibility:** Validates each locale's raw entries via `schema.ts` and enforces
en/nl key parity, throwing one aggregated error listing every problem rather than
silently dropping entries. **Key dependencies:** `./schema.ts`. Used by `index.ts`.

### `prompt-guardrail.ts`

**Domain purpose:** Keeps the one free-text field in a Tier-2 request — a user's
style/tone/focus instruction — from being used to attack or derail the model.
**Responsibility:** Checks custom prompt text for length, prompt injection, fatalistic
phrasing, medical/legal/financial claims, PII shape, off-topic system/file requests,
fabrication requests, and relationship-verdict requests. **Key dependencies:** `./lint.ts`.
Used by both the server (authoritative) and the client UI (non-authoritative nicety).

### `report.ts`

**Domain purpose:** Turns a computed chart into the actual written report a screen
renders. **Responsibility:** Assembles named sections (temperament, chart ruler, houses,
aspect patterns, dignities/sect, nodes/Chiron axis, etc.) of non-empty paragraphs, each
carrying provenance (corpus vs. fallback, salience factors where ranked).
**Key dependencies:** `astrology/bodies.ts`, `astrology/rulership.ts`,
`astrology/dispositors.ts`, `astrology/emphasis.ts`, `astrology/jones-shapes.ts`,
`astrology/signs.ts`, `domain/chart-compute.ts`, `./compose.ts`, `./rules.ts`,
`./schema.ts`.

### `result-basis.ts`

**Domain purpose:** Lets a saved AI interpretation's history describe what it was
actually based on ("Mars (natal)") rather than a generic label. **Responsibility:**
Defines the closed set of result kinds (`placements`, `whole-chart`, `focus`,
`relationship`), their basis shapes, and (de)serialization of a stored basis.
**Key dependencies:** none (deliberately — imported directly by the server, so it is
listed in the Dockerfile).

### `rules.ts`

**Domain purpose:** Decides which of a chart's many placements are actually worth saying
in a report. **Responsibility:** Scores every placement a chart has against weighted
rules (body category, dignity, sect light, retrograde, angularity, aspect
family/tightness, house class) and ranks them deterministically.
**Key dependencies:** `astrology/aspects.ts`, `astrology/bodies.ts`,
`astrology/emphasis.ts`, `astrology/sect.ts`, `astrology/signs.ts`,
`domain/chart-compute.ts`, `./schema.ts`. Used by `report.ts` and `selection.ts`.

### `schema.ts`

**Domain purpose:** The single source of truth for what a corpus entry is and how its
key is shaped — shared by the AI generator and this app's own runtime validation.
**Responsibility:** Declares every `CorpusCategory`/`CorpusPlacement` shape, derives and
parses placement keys, and validates raw entries against real astrology reference data.
**Key dependencies:** `astrology/bodies.ts`, `astrology/aspects.ts`, `astrology/signs.ts`,
`astrology/nakshatras.ts`, `astrology/dignities.ts`. Depended on by nearly every other
file in this directory.

### `selection.ts`

**Domain purpose:** Keeps the chart wheel's click-to-interpretation feature consistent
with the written report. **Responsibility:** Parses a wheel selection key
(`body:`/`sign:`/`aspect:`) and filters/orders the chart's placements to just the ones
belonging to that selection, using the same salience ranking as the report.
**Key dependencies:** `astrology/signs.ts`, `chart/body-id.ts`, `domain/chart-compute.ts`,
`./rules.ts`.

### `symbolism.ts`

**Domain purpose:** Keeps generated prose consistent in voice across generation batches.
**Responsibility:** Owns reference symbolism sheets (core meaning + keywords) for the ten
classical planets and twelve signs, in both locales, plus a voice guide, and builds the
context string injected into generation prompts. **Key dependencies:** `astrology/bodies.ts`,
`astrology/signs.ts`, `./compose.ts` (name tables), `./schema.ts`.

### `tier2-client.ts`

**Domain purpose:** The one client-side path that talks (indirectly, via the server) to a
third-party LLM — the opt-in, per-request "AI-customised" interpretation (ADR 0003).
**Responsibility:** A thin `fetch()` wrapper for `POST /api/interpretation/generate`
across its three modes (grounded/freeform/focus), with request/response types that
hand-mirror the server's own shapes. **Key dependencies:** `astrology/bodies.ts`,
`domain/chart-compute.ts`, `domain/synastry.ts`, `./focus-context-schema.ts`,
`./result-basis.ts`, `./schema.ts`.
