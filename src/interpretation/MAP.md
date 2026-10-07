# src/interpretation/ — Map

Prose corpus (committed JSON per locale) + composition pipeline → written reports, schema/key format, Tier 2 (opt-in per-request LLM-customized) client contract. Build-time generator `tools/corpus-gen/` is a sibling directory; never imported from `src/`. Committed corpus data (`en.json`, `nl.json`) is under subdirectory `corpus/MAP.md`.

- `compose.ts` — Fallback plain-sentence composer when corpus lacks entry. Deps: `astrology/bodies`, `astrology/aspects`, `astrology/signs`.
- `corpus-client.ts` — Lazy-loads one locale's corpus chunk + overlays admin overrides. Deps: `./schema`.
- `corpus/` — Committed JSON interpretation corpus (`en.json`, `nl.json`, mid-regen); see `corpus/MAP.md`.
- `dedupe.ts` — Finds near-duplicate corpus entries via trigram similarity. Deps: `./schema`.
- `focus-context-schema.ts` — Wire shape + validation for Tier 2 "focus" request (structure chart data). Deps: `astrology/aspects`, `astrology/bodies`, `astrology/rulership`, `astrology/signs`.
- `focus-context.ts` — Enriches focus-body context (sign/house/dispositor/aspects/ruled-houses) for Tier 2. Deps: `astrology/aspects`, `astrology/bodies`, `astrology/rulership`, `astrology/emphasis`, `astrology/signs`, `domain/chart-compute`, `./focus-context-schema`.
- `index.ts` — Loads both-locales corpus synchronously for validation/tests. Deps: `./corpus/en.json`, `./corpus/nl.json`, `./loader`, `./schema`.
- `lint.ts` — Style gate for corpus entries (length/fatalistic phrasing/medical claims/pronouns/language mismatch). Deps: `./schema`.
- `loader.ts` — Final gate: validates entries + enforces en/nl key parity. Deps: `./schema`.
- `prompt-guardrail.ts` — Guards Tier 2 custom prompt text (length/injection/claims/PII/fabrication). Deps: `./lint`.
- `report.ts` — Assembles chart → named sections of non-empty paragraphs + provenance. Deps: `astrology/bodies`, `astrology/rulership`, `astrology/dispositors`, `astrology/emphasis`, `astrology/jones-shapes`, `astrology/signs`, `domain/chart-compute`, `./compose`, `./rules`, `./schema`.
- `result-basis.ts` — Stores saved AI interpretation's actual basis (not generic label). Deps: none (imported by server).
- `rules.ts` — Ranks chart placements by weighted rules (dignity/sect/retrograde/angularity/aspects/house class). Deps: `astrology/aspects`, `astrology/bodies`, `astrology/emphasis`, `astrology/sect`, `astrology/signs`, `domain/chart-compute`, `./schema`.
- `schema.ts` — Single source of truth for corpus-entry shape + key parsing + validation. Deps: `astrology/bodies`, `astrology/aspects`, `astrology/signs`, `astrology/nakshatras`, `astrology/dignities`.
- `selection.ts` — Wheel click → matching placements, same salience ranking as report. Deps: `astrology/signs`, `chart/body-id`, `domain/chart-compute`, `./rules`.
- `symbolism.ts` — Reference symbolism sheets (core meaning + keywords, en/nl) + generation context builder. Deps: `astrology/bodies`, `astrology/signs`, `./compose`, `./schema`.
- `tier2-client.ts` — Thin client for opt-in Tier 2 AI-customized interpretation (via server). Deps: `astrology/bodies`, `domain/chart-compute`, `domain/synastry`, `./focus-context-schema`, `./result-basis`, `./schema`.
