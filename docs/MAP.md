# docs/ — Map

Project documentation. Pick the right bucket below for a new doc rather than dropping another loose file at the top level.

Topic folders:

- `ui/UI-UX_RELEASE_CHECKS.md` — Per-release record of the manual UI/UX checks and section 16 tasks that no automated test performs (#615). Deps: `ui/UI-UX_GUIDELINES.md`, `ops/RELEASING.md`.
- `ui/UI-UX_BASELINE.md` — The behaviour the end-to-end suite pins (routes, inputs, outputs, selection, exports, persistence), generated from the test titles. Deps: `scripts/generate-ui-baseline.mjs`.
- `ui/UI-UX_GUIDELINES.md` — Normative UI/UX implementation and behavior rules for future features. Deps: `src/ui`, `archive/UI-UX_REVIEW.md`.
- `ui/UI-UX_IMPLEMENTATION_PLAN.md` — Phased coding plan for migrating routes, shell, settings, controls, charts, and Astrocartography to the target experience. Deps: `src/ui`, `test`, `e2e`, `ui/UI-UX_GUIDELINES.md`.
- `ui/views/chart-view.md` — Target design for the natal chart screen: sticky configuration panel, page header, chart workbench, and share notice. Deps: `src/ui/ChartView.tsx`, `src/ui/ChartViewNav.tsx`.
- `ui/views/consultation-view.md` — Target design for the consultation dashboard: summary tile grid and section layout. Deps: `src/ui/ConsultationView.tsx`, `src/ui/chart-overview.messages.ts`.
- `ui/views/horary-view.md` — Target design for the horary screen: location search, Set to Now action, and secondary settings disclosure. Deps: `src/ui/HoraryView.tsx`, `src/ui/BirthPlaceSearch.tsx`, `src/ui/primitives/Disclosure.tsx`.
- `archive/UI-UX_REVIEW.md` — Archived, dated (2026-10-09) code-grounded design and usability audit; a snapshot, not current guidance. Deps: `src/ui`, `e2e/accessibility.spec.ts`.
- `ASTROLOGY_TERMS.md` — Combined 573-term astrology/astronomy glossary merged from six draft sources, staged as source material for #456's glossary tooltip content. Deps: none yet (not wired into `src/ui` — pending integration).
- `domain/CORPUS_KEYS.md` — Corpus key-shape reference (which placements get which key format). Deps: `src/interpretation/schema.ts`.
- `domain/CHART_OVERLAYS.md` — Supported chart-overlay contexts, intentional relationship-chart exceptions, interaction, and export behavior. Deps: `src/ui/ChartView.tsx`, `src/ui/SynastryView.tsx`, `src/chart/multi-wheel.ts`.
- `domain/AAF_INTERCHANGE.md` — AAF birth-record interchange: the AAF'97 source, the field mapping, the Astraya extension chunk, and what is not claimed (#591). Deps: `src/domain/aaf.ts`, `src/domain/aaf-people.ts`, `references/aaf-chunks.references.json`.
- `domain/EXPORT_SCHEMA.md` — Astraya full-export JSON schema reference: shape, compatibility policy, version history (#561). Deps: `src/domain/full-export.ts`, `src/domain/chart-tables.ts`; paired with `schema/astraya-export.schema.json`.
- `domain/FIXED_STAR_REGISTRY.md` — Fixed-star registry reference: sourcing, epoch, and lineage of the entries in `src/astrology/fixed-star-registry.ts`. Deps: `src/astrology/fixed-star-registry.ts`.
- `ASTROLOGICAL_DATA_SOURCES.md` — Public astronomical datasets, historical source texts, current Astraya coverage, and adoption/licensing recommendations. Deps: `src/ephemeris/`, `src/astrology/`, upstream catalogues.
- `ops/DEPENDENCIES.md` — Hand-maintained dependency/licence inventory root `CLAUDE.md`'s onboarding checklist points to. Deps: `node_modules/*/package.json` licence fields.
- `ops/RELEASING.md` — Release policy and tagging scheme (every milestone ends in a release).

Subdirectories:

- `ui-baselines/` — Reference screenshots of the restructured UI surfaces (both themes, 390/1280/1440 wide), written by `e2e/ui-baselines.spec.ts` when asked; documentation, not assertions.
- `adr/` — Architecture Decision Records, one numbered file per decision. Deps: none.
- `agents/` — Generic Claude Code skill docs (`domain-modeling` skill's `CONTEXT.md`/ADR conventions) — not Astraya product documentation.
- `archive/` — Deprecated/retired docs, append-only, never deleted outright: abandoned tooling write-ups (LAYA/Ollama benchmarking, astrologyapi.com comparison), the removed-env-vars log, and the dated UI/UX audit.
- `audit/` — One-off repository audits, reviews, and structural evaluations, filename datestamped `YYYY-MM-DD-description.md`.- `references/` — Curated public-domain source passages for seeding the corpus (structured JSON); see its own `MAP.md` for what is kept and why. Not documentation about Astraya.
- `schema/` — Hand-authored JSON Schema files for Astraya's own stable data formats (`astraya-export.schema.json`, #561), paired with a top-level `.md` reference doc.

## Where does a new doc go?

- A one-time decision with lasting rationale → `adr/`, numbered.
- A one-time audit, review, or structural evaluation → `audit/`, filename datestamped.
- A living reference meant to be read repeatedly → `.md` in the matching topic folder (`ui/`, `domain/` or `ops/`).
- Writeup for tooling or an approach that's since been abandoned → `archive/`, don't delete it outright — git history alone makes old write-ups hard to find later.
- Docs for Claude Code's own generic skills, not specific to this app → `agents/`.
- A third-party source text the corpus is checked or seeded against → `references/`, with its edition and licence recorded in that folder's `MAP.md`.
