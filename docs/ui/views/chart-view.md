# Chart view (target design)

**Scope:** The natal chart screen (`ChartView.tsx`): the sticky configuration column, the page header, the share notice, and the chart workbench. Target design only; general rules live in `docs/ui/UI-UX_GUIDELINES.md`.

Each section ends with a **Status** line. Verified against the code on 2026-11-04 (main at a16b105; #800, #801, #817 and #981 have closed since 2026-10-25).

## 1. Two-column layout with a sticky left panel

The left panel holds the back link on its top line, above the summary or configuration cards. Its native CSS equivalent is `position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow-y: auto;`. The back link and global controls stay visible while the right column scrolls.

The desktop grid is a 12-column grid from the `64rem` breakpoint, with a `1.5rem` gap (`var(--space-6)`), and items aligned to the start. Only the chart workbench in section 4 uses the `68rem` container query.

**Status:** Not yet built. `ChartView.tsx` contains no sticky element (`grep -c sticky` returns 0). The only sticky element is the app header (`app.css:251`). The page renders as one column inside `<main className="shell shell--wide">` (`ChartView.tsx:1541`).

## 2. Back link on the sticky panel

The back link goes at the top of the left panel and reads "← People" in the target design. It is a route link to the person's overview.

**Status:** Partly built. The back link exists (`BackLink.tsx`, rendered at `ChartView.tsx:1542`). It sits above the header in the main column, not on a sticky panel. Its label is the shared "Back" (`shared.messages.ts:12`), not "People".

## 3. Single-row page header

The title, basis line, and export actions sit on one row. The target is a flex row with `align-items: center` and a `0.75rem` gap, with a `0.5rem` bottom margin.

**Status:** Partly built. `PageHeader.tsx` uses `.page-header-row` (`app.css:6596-6601`): flex, centred, wrapping, with a `1rem` gap. `.page-header` (`app.css:6592-6594`) has a `1.5rem` bottom margin, so the gap and margin differ from the target.

## 4. Chart workbench (dial beside its inspector)

Each dial is followed in DOM order by one `SelectionInspector`. The layout is one column below the `68rem` container width. At `68rem` and above it is `minmax(46rem, 1fr) minmax(20rem, 24rem)` with a `2rem` gap. Selecting on the dial updates the inspector without changing the page height.

**Status:** Built (#817, closed). The dial and inspector are wrapped in `.chart-workbench-shell` and `.chart-workbench` (`ChartView.tsx:994-995`). The two-column container query is at `app.css:3185`. The inspector reserves `min-height: 14rem` and scrolls inside itself, overhanging the wheel's row by one `--space-6` (`app.css:3200-3209`), so the first selection does not jump the page.

## 5. Local chart navigation

One row of links on desktop (Wheel, Aspects, Matrix, Elements, Placements, Patterns & condition) and one labelled Select on narrow screens. The links are ordinary route links, not ARIA tabs.

**Status:** Built (#801, #976, #981, closed). `ChartViewNav.tsx` renders the `.chart-view-link` links (six views, `chart-sections.ts:30`) and a `Select` in `.chart-view-select`. It is used at `ChartView.tsx:1100`, below the chart type select (`ChartView.tsx:1096`).

## 6. Standalone share notice

The permanent share-link warning must not sit above the page header or as a standalone banner. Show it as a compact inline badge, or behind an explicit trigger.

**Status:** Resolved by removal (#801, closed). `ChartView.tsx` no longer renders a share link or `share-warning` notice (`grep -rn share-warning src` finds nothing), so there is no banner to place. The only chart-page export is the `PdfCreatorLink` in the `PageHeader` (`ChartView.tsx:419`, `1544`).

## 7. No redundant sub-title above the canvas

The active tab pill already names the view, so the canvas needs no extra heading such as "Chart wheel".

**Status:** Built for the wheel. The Wheel view renders no sub-title above the canvas (`ChartView.tsx:1128-1131`, `chartTabLabel` is gone). The other views still render an `<h2>` with the view name (`ChartView.tsx:1140`), which names a table view, not the canvas.

## 8. Global Sabian symbol notes toggle

The target is one global "Show Sabian symbol notes" checkbox, with no per-card checkboxes on reading cards.

**Status:** Not in this view. `ChartView.tsx` has no `Checkbox` (`grep -c Checkbox` returns 0). The toggle is `DegreeSymbolSetting.tsx`, rendered only in `ReportView.tsx:569`. The per-card-checkbox rule is therefore not placed in this file.

Per-card checkboxes are absent here. The chart cards have no inline `Checkbox` (`grep` finds none in `ChartView.tsx`).
