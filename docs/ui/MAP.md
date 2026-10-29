# docs/ui MAP

- `UI-UX_BASELINE.md` — UI behaviour pinned by the end-to-end suite, generated from test titles; the record any redesign must keep or change on purpose. Deps: `e2e`, `scripts/generate-ui-baseline.mjs`.
- `UI-UX_CONFORMANCE_AUDIT_2026-10-29.md` — Current-source conformance audit of the UI, with a corrections section. Deps: `src/ui`, `test`, `e2e`.
- `UI-UX_GUIDELINES.md` — Normative UI/UX implementation guide for new UI work by agents and contributors. Deps: `src/ui`, `archive/UI-UX_REVIEW.md`.
- `UI-UX_IMPLEMENTATION_PLAN.md` — Migration plan for reaching the target UI/UX experience. Deps: `ui/UI-UX_GUIDELINES.md`, `archive/UI-UX_REVIEW.md`.
- `UI-UX_RELEASE_CHECKS.md` — Per-release record of the manual UI/UX checks that no automated test performs. Deps: `ui/UI-UX_GUIDELINES.md`, `ops/RELEASING.md`.
- `views/chart-view.md` — Target design for the natal chart screen: configuration column, page header, share notice, chart workbench. Deps: `src/ui/ChartView.tsx`.
- `views/consultation-view.md` — Target design for the consultation dashboard: planetary indicator summary and section layout. Deps: `src/ui/ConsultationView.tsx`.
- `views/horary-view.md` — Target design for the horary question screen: timestamp, location search, secondary settings. Deps: `src/ui/HoraryView.tsx`.
