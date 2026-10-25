# Chart view (target design)

**Scope:** The natal chart screen (`ChartView.tsx`): the sticky configuration column, the page header, the share notice, and the chart workbench. Target design only; general rules live in `docs/ui/UI-UX_GUIDELINES.md`.

Each section ends with a **Status** line. Verified against the code on 2026-10-25.

## 1. Two-column layout with a sticky left panel

The left panel holds the back link on its top line, above the summary or configuration cards. Its native CSS equivalent is `position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow-y: auto;`. The back link and global controls stay visible while the right column scrolls.

The desktop grid is a 12-column grid from the `64rem` breakpoint, with a `1.5rem` gap (`var(--space-6)`), and items aligned to the start. Only the chart workbench in section 4 uses the `68rem` container query.

**Status:** Not yet built. `ChartView.tsx` contains no sticky element (`grep -c sticky` returns 0). The only sticky element is the app header (`app.css:229`). The page renders as one column inside `<main className="shell shell--wide">` (`ChartView.tsx:2687`).

## 2. Back link on the sticky panel

The back link goes at the top of the left panel and reads "← People" in the target design. It is a route link to the person's overview.

**Status:** Partly built. The back link exists (`BackLink.tsx:33`, rendered at `ChartView.tsx:2687`). It sits above the header in the main column, not on a sticky panel. Its label is the shared "Back" (`shared.messages.ts:12`), not "People".

## 3. Single-row page header

The title, basis line, and export actions sit on one row. The target is a flex row with `align-items: center` and a `0.75rem` gap, with a `0.5rem` bottom margin.

**Status:** Partly built. `PageHeader.tsx:90-91` uses `.page-header-row` (`app.css:4546-4550`): flex, centred, wrapping, with a `1rem` gap. `.page-header` (`app.css:4542-4544`) has a `1.5rem` bottom margin, so the gap and margin differ from the target.

## 4. Chart workbench (dial beside its inspector)

Each dial is followed in DOM order by one `SelectionInspector`. The layout is one column below the `68rem` container width. At `68rem` and above it is `minmax(46rem, 1fr) minmax(20rem, 24rem)` with a `2rem` gap. Selecting on the dial updates the inspector without changing the page height.

**Status:** Built. The dial and inspector are wrapped in `.chart-workbench-shell` and `.chart-workbench` (`ChartView.tsx:2214-2215`, with the inspector at `ChartView.tsx:2230`). The two-column container query is at `app.css:2285-2291`. The inspector reserves `min-height: 14rem` at `app.css:2286-2288`, so the first selection does not jump the page.

## 5. Local chart navigation

One row of links on desktop (Wheel, Aspects, Placements, Patterns & condition) and one labelled Select on narrow screens. The links are ordinary route links, not ARIA tabs.

**Status:** Built. `ChartViewNav.tsx:48-66` renders the `nav` of `.chart-view-link` links and a `Select` in `.chart-view-select`. It is used at `ChartView.tsx:2352`.

## 6. Standalone share notice

The permanent share-link warning must not sit above the page header or as a standalone banner. Show it as a compact inline badge, or behind an explicit trigger.

**Status:** Not yet built. `ShareLink` renders a permanent `<Notice className="share-warning">` (`ChartView.tsx:1753`). It is rendered after the header and chart type selector (`ChartView.tsx:2637`, `2703`), so it is not above the header, but it is a full banner, not a compact badge or trigger.

## 7. No redundant sub-title above the canvas

The active tab pill already names the view, so the canvas needs no extra heading such as "Chart wheel".

**Status:** Not yet built. `renderChartPanel` renders `<h2>{t.chartTabLabel}</h2>` (`ChartView.tsx:2187`, text `ChartView.messages.ts:205`) above the wheel, next to the `ChartViewNav` pills (`ChartView.tsx:2352`).

## 8. Global Sabian symbol notes toggle

The target is one global "Show Sabian symbol notes" checkbox, with no per-card checkboxes on reading cards.

**Status:** Not in this view. `ChartView.tsx` has no `Checkbox`. The toggle is `DegreeSymbolSetting.tsx`, rendered only in `ReportView.tsx:499`. The per-card-checkbox rule is therefore not placed in this file.

Per-card checkboxes are absent here. The chart cards have no inline `Checkbox` (`grep` finds none in `ChartView.tsx`).
