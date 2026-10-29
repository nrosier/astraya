# UI/UX conformance audit — 2026-10-29

Corrections made 2026-10-29 after a source check (see the Corrections section at the end).

**Status:** Current-source audit; no product behavior changed  
**Reference:** `docs/ui/UI-UX_GUIDELINES.md`, `docs/ui/UI-UX_IMPLEMENTATION_PLAN.md`, and the Charts workspace  
**Scope:** Application shell, primary routes, shared UI primitives, responsive behavior, state feedback, and test coverage

## Executive conclusion

The Charts workspace is the best current expression of Astraya's target UI system: a wide data shell, a compact calculation-basis line, a labelled Chart type control, route-backed local navigation, shared controls, staged settings, and a nearby selection inspector. It should be the implementation reference for _mechanics_, not copied blindly as a complete page template.

The rest of the application is only partly migrated. The main structural gap is that `PageHeader` and its page-local export/action contract are implemented by Charts, Astrocartography, and Consultation only. Most person, timing, relationship, tool, Preferences, and Documents views still assemble a bare `<h1>` and bespoke controls. This leaves equivalent pages with inconsistent context, action placement, export treatment, and visual hierarchy.

The guide is **not presently a fully correct executable authority**. Its chart taxonomy and workbench measurements conflict with the implementation plan, current code, and tests. Resolve those contradictions before using the guide as a pass/fail gate for further UI work.

## Method and evidence limits

- Reviewed the current source, CSS, route metadata, E2E/component tests, and existing UI baseline artefacts.
- The stored baseline screenshots were captured on **2026-10-11** (`9da10e8`), so they were used only to understand the intended visual direction, not as evidence of current runtime behavior.
- A live Vite review could not run in this sandbox because loopback binding failed with `listen EPERM` on **2026-10-29**. Findings below are therefore source- and test-grounded. A release-candidate visual/manual pass remains required by the guide and release-check document.
- No calculations, corpus prose, persistence behavior, or production UI files were modified by this audit.

## What Charts establishes well

| Pattern                            | Current evidence                                                                                                                               | Reuse status                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Page-local context                 | `PageHeader` can contain a title, basis, page action, and registered exports.                                                                  | Reuse for calculated and exportable pages.                            |
| Route-backed local navigation      | `ChartViewNav` uses real links on wide layouts and the shared `Select` on narrow layouts; it does not misuse ARIA tabs.                        | Reuse when a view is a substantial, bookmarkable task.                |
| Shared controls                    | The chart type and mobile chart-view controls use the shared `Select`; settings are staged rather than written from individual child controls. | Reuse on all new inputs/settings work.                                |
| Responsive visualisation ownership | The wheel and `SelectionInspector` are adjacent in DOM order and the workbench uses an inline-size container.                                  | Reuse for any interactive visualization with a selection explanation. |
| Wide data shell                    | Charts deliberately opts into `shell--wide` rather than forcing dense data into prose width.                                                   | Reuse for tables, maps, builders, and visualisations.                 |

The Chart mechanics are useful reference material. Its current title, six-view taxonomy, comparison layout, and desktop inspector scrolling are **not** automatically guide-conformant; they are audited below.

## Guide correctness and conflicts

| Decision                                    | Guide says                                                                                                      | Plan / implementation / test say                                                                     | Assessment and required resolution                                                                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chart local views                           | Four views: Wheel, Aspects, Placements, Patterns & condition.                                                   | Six route views: `wheel`, `aspects`, `matrix`, `elements`, `placements`, `patterns`.                 | Direct contradiction. Decide whether Matrix and Elements remain first-class route views or merge into two of the four guide views; then update the guide, plan, release tasks, messages, and tests together.    |
| Workbench tracks                            | At `68rem`: `minmax(46rem, 1fr) minmax(20rem, 24rem)`, `2rem` gap.                                              | CSS uses `minmax(38rem, 7fr) minmax(20rem, 5fr)`; E2E explicitly asserts the 7:5 split.              | Direct contradiction. The code does not cap the inspector at `24rem` and cannot guarantee a `46rem` visualization track at the stated threshold. Choose one contract and make CSS and test assertions match it. |
| Inspector scrolling                         | The inspector must not independently scroll.                                                                    | Desktop CSS sets `max-height: 100vh; overflow-y: auto`; the source comment says this is intentional. | Direct contradiction. Either remove the internal scroll as the guide requires, or document the accessibility/usability rationale and amend the guide after a real-user check.                                   |
| Number of chart views in verification prose | The guide's E2E section says “six view links.” The guide's target-page section and release checklist name four. | The app renders six.                                                                                 | The guide internally contradicts itself even before comparing it with code.                                                                                                                                     |

> **Correction (2026-10-29, document author's review):** the “six view links” phrase in the last row above is in `docs/ui/UI-UX_IMPLEMENTATION_PLAN.md` (lines 497 and 556), not in the guide. The guide says four everywhere (`docs/ui/UI-UX_GUIDELINES.md:102`, `:354`, `:490`). See Corrections, item 1.

**Recommendation:** retain six route views only if Matrix and Elements each have a distinct user task and selection context. If they remain, rewrite every guide reference to six views. Do not leave the current four/six hybrid: it makes feature work impossible to assess consistently.

## Findings

### UI-01 — High — The shipped workbench violates the guide's exact responsive contract

**Evidence**

- The guide requires a `46rem` visualization minimum, `20rem`–`24rem` inspector, `2rem` gap, and no inspector scrollbar (`docs/ui/UI-UX_GUIDELINES.md:127-152`).
- Current CSS uses a `38rem` / 7:5 split and gives the inspector its own `100vh` scroll container (`src/ui/app.css:2467-2496`).
- Current E2E tests lock that 7:5 implementation in (`e2e/chart-workbench.spec.ts:265-282`).

**Impact**

At the nominal `68rem` container threshold, the visualization can be about `38.5rem` wide rather than the specified `46rem`; the inspector can grow beyond its stated maximum; keyboard and pointer users must manage a nested desktop scroll region. The documented layout diagram and the implementation do not describe the same experience.

**Remediation**

Make a product decision first, then change all three sources of truth in one pull request. If preserving the guide, use the specified grid tracks and let inspector content participate in page scroll. If retaining the shipped 7:5 layout, document its minimum readable wheel size, inspector maximum, nested-scroll keyboard behavior, and why the current rule is preferable.

**Acceptance criteria**

- CSS, guide, plan, and E2E agree on one track formula at `67.99rem` and `68rem`.
- The inspector has either no independent vertical scroll or an explicitly approved, tested exception.
- A visual test measures both tracks, the gap, and overflow at `390×844`, `1280×800`, and `3440×1440`.

### UI-02 — High — The Chart page title omits the feature and selected chart type

**Evidence**

- The guide requires every title to identify both feature and subject, for example “Natal chart · Ada Lovelace” (`docs/ui/UI-UX_GUIDELINES.md:65-68`), and requires chart-type changes to update the title (`docs/ui/UI-UX_GUIDELINES.md:96-99`).
- `ChartView` passes only the person's display name to `PageHeader` in normal and comparison modes (`src/ui/ChartView.tsx:1550-1555`, `src/ui/ChartView.tsx:1615-1622`).

**Impact**

The page's largest heading does not tell a reader, browser-history user, screen-reader user, or exported screenshot whether they are looking at a natal, draconic, harmonic, or return chart. The chart type is visually separated below the title instead of forming one clear page identity.

**Remediation**

Generate the title from the active chart type and person: `Natal chart · Ada Lovelace`, `Draconic chart · Ada Lovelace`, and so on. Give comparison mode a separate, explicit identity such as `Natal and harmonic charts · Ada Lovelace`.

**Acceptance criteria**

- All supported chart types update the `<h1>` and document title on route change.
- The chart type control remains a control, not the sole textual statement of page identity.
- The title is asserted for every chart type in the golden-path test.

### UI-03 — High — Comparison mode is hard-coded to two narrow columns, including on phones

**Evidence**

- Comparison mode uses an inline `gridTemplateColumns: '1fr 1fr'` with no responsive override (`src/ui/ChartView.tsx:1550-1599`).
- The guide requires layouts to respond by content type and explicitly requires mobile and short/wide viewport verification (`docs/ui/UI-UX_GUIDELINES.md:427-444`; `docs/ui/UI-UX_IMPLEMENTATION_PLAN.md:462-474`).

**Impact**

At narrow widths, both charts, their chart-type/navigation rows, and their selection panels are forced into half-width columns. Inline styles prevent a CSS container or media query from stacking them. This is a direct malformed-layout risk for `390×844`, zoom, translated labels, and any comparison with the wheel open.

**Remediation**

Replace the inline style with a named CSS container. Stack comparison charts by default; enable two columns only when each chart's usable content width is proven sufficient. Keep each chart's heading, type control, local navigation, visualization, and inspector in the same comparison item.

**Acceptance criteria**

- No horizontal overflow at `390×844`, `768×1024`, `1280×800`, `1440×900`, and `3440×1440` in both themes.
- At the stack threshold, focus order remains first chart then second chart.
- An E2E test exercises comparison mode, not only single-chart routes.

### UI-04 — High — The common content-header and page-export model is not applied across the product

**Evidence**

- The guide makes title, concise context/basis, page actions, exports, and page-level advanced settings a content-header responsibility (`docs/ui/UI-UX_GUIDELINES.md:72-86`; `docs/ui/UI-UX_IMPLEMENTATION_PLAN.md:70-75`).
- `PageHeader` is imported only by `ChartView`, `AstrocartographyView`, and `ConsultationView`; page exports are registered only by Charts and Astrocartography (`src/ui/PageHeader.tsx:36-143`, `src/ui/ChartView.tsx:971-983`, `src/ui/AstrocartographyView.tsx:202-215`).
- Core screens such as People, Overview, Documents, Preferences, Transit, Forecast, Primary Directions, relationship charts, return charts, and tools render bespoke direct `<h1>` structures instead (`src/ui/People.tsx:86-100`, `src/ui/Overview.tsx:70-92`, `src/ui/DocumentsView.tsx:26-34`, `src/ui/TransitView.tsx:296-320`).

**Impact**

Equivalent screens have no consistent place for effective calculation basis, relevant export action, page action, or advanced setting. This produces the two UI generations the guide expressly says to avoid: the Charts/Map/Consultation header system and many legacy heading/action arrangements.

**Remediation**

Make a small `PageHeader` migration slice for each route family. A simple directory page may use the title-only form, but calculated person views must pass their feature-and-subject title and effective basis; export-capable views must register page-local exports. Do not add an alternative global export menu.

**Acceptance criteria**

- Every primary route is classified as title-only, context-only, or full `PageHeader` in the feature registry or a documented route matrix.
- All calculated person pages display a concise effective basis or an intentional, documented reason why one is not applicable.
- Export actions appear beside the relevant result/title, while Build PDF remains in Documents and backups remain in Preferences.

### UI-05 — Medium — Desktop shell placement contradicts the rail contract and can compete with page headers

**Evidence**

- The guide places Preferences, sync, and account controls at the bottom of the desktop rail (`docs/ui/UI-UX_GUIDELINES.md:72-82`).
- On wide layouts, CSS moves `.app-header-end` to a fixed viewport-top-right cluster rather than keeping it in the rail (`src/ui/app.css:2111-2140`). `App.tsx` places sync, account, Preferences, language, symbols, and theme in that cluster (`src/ui/App.tsx:338-351`).
- The rail is fixed at `16rem` from `64rem` viewport width upward, even when the result is too narrow for the high-information page (`src/ui/app.css:2035-2077`).

**Impact**

The desktop shell no longer matches the guide's single predictable rail. The fixed utility cluster may visually compete with title/export controls at the top-right of a content page, while the fixed `64rem` rail begins taking useful width before a dense page's content container can support its intended layout.

**Remediation**

Choose one intentional shell pattern: either anchor the utility cluster at the rail bottom as specified, or amend the guide with a reserved top-right utility zone and enforce content clearance. Make rail collapse depend on usable result width, not only a global viewport breakpoint.

**Acceptance criteria**

- At desktop widths, page-title/action content cannot pass beneath or visually compete with global utilities.
- A chart workbench that could otherwise meet its wide-layout requirement does not remain unnecessarily stacked solely because of the rail.
- Keyboard order and skip-link behavior remain intact for both expanded and collapsed rail states.

### UI-06 — Medium — Most calculated results do not expose a busy result region during recalculation

**Evidence**

- The guide requires retained results during recalculation, a visible updating state, and `aria-busy` on the result region (`docs/ui/UI-UX_GUIDELINES.md:386-400`; `docs/ui/UI-UX_IMPLEMENTATION_PLAN.md:454-456`).
- Transit and Chart show a loading status and conditionally remove/show result content but do not mark a result region busy (`src/ui/TransitView.tsx:314-371`, `src/ui/ChartView.tsx:1146-1154`).
- Astrocartography is the notable conforming implementation: it preserves the map, shows Updating, and sets `aria-busy` (`src/ui/AstrocartographyView.tsx:258-275`).
- Outside primitive controls, `aria-busy` is not present on the other calculated view result regions (`rg -n 'aria-busy' src/ui --glob '*.tsx'`).
- **Correction (2026-10-29, document author's review):** one other `aria-busy` use exists, on a `fieldset` in `src/ui/PdfAiInterpretationPicker.tsx:128`. It is not a result region, so the rule above excludes it. See Corrections, item 2.

**Impact**

Assistive technology receives a transient status message but not a stable signal about which result is updating. Other calculation views do not consistently preserve the last trustworthy result while newer data is prepared, creating avoidable visual jumps and inconsistent feedback.

**Remediation**

Extract the Astrocartography lifecycle as the shared calculation-result contract: result region, retained last valid result, updating status, `aria-busy`, content-shaped initial placeholder, error/retry behavior, and test helper.

**Acceptance criteria**

- Chart, Transit, Forecast, progressions/directions, returns, relationships, and map results expose a labelled busy region during recomputation.
- A valid previous result remains visible until the replacement is complete when technically safe.
- Loading/error/update behavior is tested by user-visible state rather than only by the presence of a status node.

### UI-07 — Medium — Responsive and visual test coverage is strong for selected routes but incomplete for the full Charts contract

**Evidence**

- The viewport matrix correctly tests both themes and all five specified viewports, but its chart routes include Wheel, Aspects, Placements, and Patterns only; Matrix and Elements are absent (`e2e/viewport-matrix.spec.ts:16-22`, `e2e/viewport-matrix.spec.ts:79-101`).
- Baseline capture includes Matrix and Elements but is skipped by default and is documentary rather than an assertion (`e2e/ui-baselines.spec.ts:1-5`, `e2e/ui-baselines.spec.ts:46-76`).
- The documented baseline images predate this audit by eighteen days and are not a release-candidate record (`git log -- docs/ui-baselines`).

**Impact**

The app can pass its required viewport matrix while two live chart views regress in mobile layout, overflow, focus behavior, or theme contrast. The tests also preserve the obsolete 7:5 workbench decision rather than the guide's documented contract.

**Remediation**

Once the four/six-view decision is resolved, make every retained view part of the mandatory viewport matrix. Add the comparison route and page-header/title assertions. Capture reference images from the release candidate only as review material, not as a substitute for assertions.

**Acceptance criteria**

- The required viewport matrix covers every shipped chart view, comparison mode, and both themes.
- Visual baseline capture records its source commit/date and is refreshed after a design-system slice.
- Tests assert the decided layout contract, not a superseded comment or migration issue number.

## Route-family alignment map

| Route family                     | Current alignment        | Main concern                                                                                                                                | Priority next step                                                                         |
| -------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| App shell                        | Partial                  | Rail exists, but account/preferences utilities leave the rail and reserve no page-header space.                                             | Settle shell ownership and collapse rule.                                                  |
| People and person setup          | Partial                  | Simple hierarchy is understandable; title/action use legacy composition.                                                                    | Migrate to title-only/full header rules and shared primary-action styling.                 |
| Overview                         | Partial                  | It is a focused launchpad with genuine next actions.                                                                                        | Promote effective basis to the standard header/context treatment.                          |
| Charts                           | Partial / reference      | Best adoption of shared navigation, controls, and inspector mechanics; title, workbench contract, and comparison layout are non-conformant. | Resolve the guide conflicts, then fix title and comparison responsiveness.                 |
| Interpretation and report        | Partial                  | Separate route is appropriate; header/action/export treatment remains legacy.                                                               | Add page-local header contract and readable-prose measure verification.                    |
| Timing and forecasts             | Partial                  | Inputs and result tables exist, but lifecycle feedback and headers differ by screen.                                                        | Adopt shared calculation-result and content-header contracts.                              |
| Relationships and derived charts | Partial                  | They reuse chart data but keep separate legacy headings/layouts.                                                                            | Migrate headers and test comparison/derived responsive behavior.                           |
| Astrocartography                 | Strongest outside Charts | Uses `PageHeader`, export registration, staged settings, and an updating region.                                                            | Use as the reference for calculation lifecycle; complete responsive/manual checks.         |
| Explore tools                    | Partial                  | Navigation metadata is organized, but screen-level headers/forms are heterogeneous.                                                         | Apply shared header/control audit per tool.                                                |
| Preferences and Documents        | Partial                  | Correct destinations and scopes are largely present.                                                                                        | Replace legacy heading/action composition and ensure page actions are scoped consistently. |

## Recommended implementation order

1. **Fix the written contract first.** Reconcile four versus six chart views, workbench tracks, inspector scrolling, and the shell utility position across the guide, migration plan, release checklist, and tests.
2. **Finish the Charts reference page.** Correct title identity, replace comparison inline styles with a responsive container, and implement the decided workbench behavior.
3. **Make shared scaffolding enforceable.** Add feature metadata for page-header mode, calculation basis availability, and export registration; test registry completeness.
4. **Migrate by route family.** Start with calculated person screens (Transit, Forecast, timing techniques, relationships/derived charts), then People/Overview, then Explore, Preferences, and Documents.
5. **Standardize result lifecycle.** Reuse the Astrocartography update contract for every calculated result surface.
6. **Close with evidence.** Extend mandatory viewport coverage, then run the release-candidate manual checks with a newer astrology reader and an experienced practitioner.

## Definition of done for this audit's remediation

- One authoritative chart-view taxonomy is used by the guide, plan, route parser, UI labels, release checks, and E2E suite.
- One authoritative workbench geometry and overflow policy is implemented and measured at the stated breakpoint.
- All primary calculated pages have a feature-and-subject title, an effective basis when applicable, page-local actions/exports, and an accessible updating result region.
- Comparison mode stacks before its individual chart workbenches become unusable.
- The shell has a documented and testable reservation rule for global utilities and result width.
- The viewport matrix includes all shipped chart views and comparison mode; visual/manual checks are recorded for the release candidate.

## Corrections

Corrections made 2026-10-29 by the document author's review, after checking each claim against the source. The original findings above are unchanged; each correction is also marked where it applies.

1. **Attribution of “six view links” (Guide correctness and conflicts, last row).**
   - Original: “The guide's E2E section says ‘six view links.’ The guide's target-page section and release checklist name four.”
   - Corrected: The implementation plan's E2E section says “six view links.” The guide says four in its target-page section, its navigation table and its release checklist. The contradiction is between the guide and the plan, not inside the guide.
   - Evidence: `docs/ui/UI-UX_IMPLEMENTATION_PLAN.md:497` and `:556` (six); `docs/ui/UI-UX_GUIDELINES.md:102`, `:354`, `:490` (four); `grep -n "six view links" docs/ui/*.md` matches only the plan.
2. **`aria-busy` outside primitives (UI-06, Evidence).**
   - Original: “Outside primitive controls, `aria-busy` is not present on the other calculated view result regions.”
   - Corrected: Apart from Astrocartography, the only other `aria-busy` in `src/ui` is on a `fieldset` in the PDF AI interpretation picker. That fieldset is not a calculated result region, so the rule excludes it and the finding stands.
   - Evidence: `src/ui/PdfAiInterpretationPicker.tsx:128`; `src/ui/AstrocartographyView.tsx:270`.
3. **Other file and line citations.**
   - Original: all other file:line citations in the audit.
   - Corrected: none needed. Each was checked against the source and still points at the cited code, within the stated ranges. Examples: `src/ui/ChartView.tsx:1555` (inline `1fr 1fr`), `src/ui/app.css:2483` and `:2488` (`max-height: 100vh`, `minmax(38rem, 7fr)`), `src/ui/app.css:2123` and `:2064` (`.app-header-end`, rail `16rem`), `e2e/chart-workbench.spec.ts:265-282` (7:5 assertion), `e2e/viewport-matrix.spec.ts:79-101` (no Matrix or Elements routes).
   - Evidence: grep and line reads of the files named above.
