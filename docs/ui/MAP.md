# docs/ui MAP

- `UI-UX_BASELINE.md` — UI behaviour pinned by the end-to-end suite, generated from test titles; the record any redesign must keep or change on purpose. Deps: `e2e`, `scripts/generate-ui-baseline.mjs`.
- `UI-UX_CONFORMANCE_AUDIT_2026-10-29.md` — Superseded by the 2026-11-05 route audit; kept as history. Deps: `src/ui`, `test`, `e2e`.
- `UI-UX_CONFORMANCE_AUDIT_2026-11-05.md` — Route-by-route conformance audit of all 35 route kinds against the guideline sections, with the failures filed as issues (#1161-#1166) and owner decisions. Deps: `src/ui`, `src/ui/route.ts`, `docs/ui/ROUTE-AUDIT-964.md`.
- `UI-UX_GUIDELINES.md` — Normative UI/UX implementation guide for new UI work by agents and contributors. Deps: `src/ui`, `archive/UI-UX_REVIEW.md`.
- `UI-UX_IMPLEMENTATION_PLAN.md` — Migration plan for reaching the target UI/UX experience. Deps: `ui/UI-UX_GUIDELINES.md`, `archive/UI-UX_REVIEW.md`.
- `proposals/onboarding-goals.md` — Text proposal for goal-based onboarding (#1060), awaiting owner approval; not the §17.2 mockup. Deps: `ui/UI-UX_GUIDELINES.md`, `src/ui/People.tsx`.
- `proposals/consultation-preset-switches.md` — Text proposal for the layer, chart-facts and orb switches the consultation presets need (#1190), awaiting owner approval. Deps: `ui/UI-UX_GUIDELINES.md`, `src/ui/aspect-family-filter.ts`, `src/ui/ChartOverlaySettingsPanel.tsx`.
- `UI-UX_RELEASE_CHECKS.md` — Per-release record of the manual UI/UX checks that no automated test performs. Deps: `ui/UI-UX_GUIDELINES.md`, `ops/RELEASING.md`.
- `UI-UX_SPEC_REVIEW_2026-11-03.md` — Rendered-UI audit of 31 routes at 390/1280/3440 in light and dark, plus dialogs, signed-in and admin routes and Dutch: target size, contrast, alignment, sizing, spacing tokens, focus and page language, mapped to M14 issues. Deps: `.claude/skills/ui-ux-spec-review`, `src/ui/app.css`.
- `views/chart-view.md` — Target design for the natal chart screen: configuration column, page header, share notice, chart workbench. Deps: `src/ui/ChartView.tsx`.
- `views/consultation-view.md` — Target design for the consultation dashboard: planetary indicator summary and section layout. Deps: `src/ui/ConsultationView.tsx`.
- `views/horary-view.md` — Target design for the horary question screen: timestamp, location search, secondary settings. Deps: `src/ui/HoraryView.tsx`.
