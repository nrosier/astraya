# Consultation view (target design)

**Scope:** The consultation dashboard (`ConsultationView.tsx`): the summary of core planetary indicators at the top of the page and the layout of the sections below it. Target design only; general rules live in `docs/ui/UI-UX_GUIDELINES.md`.

Each section ends with a **Status** line. Verified against the code on 2026-10-25.

## 1. Summary tile grid for core planetary indicators

The "At a glance" block is replaced by a horizontal grid of summary tiles for the core planetary indicators (the big three, chart ruler, and sect). Target grid: 2 columns by default, 4 from the `md` width, and 6 from the `lg` width, with a `0.75rem` gap (`var(--space-3)`). Native CSS equivalent: `display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3);`, with `repeat(4, ...)` and `repeat(6, ...)` at the `md` and `lg` breakpoints.

**Status:** Not yet built. The summary is still a vertical `<dl>` (`ConsultationView.tsx:432-441`, styled by `.consultation-glance` at `app.css:4905-4923`), with one term and one value per row. The heading "At a glance" exists (`chart-overview.messages.ts:8`, used at `ConsultationView.tsx:433`), so the name is available for the tile block.

## 2. Current section grid (for reference)

The four data sections sit in a two-column grid once the page container is at least `48rem` wide. The class is `consultation-grid` (`ConsultationView.tsx:444`). Its CSS is `grid-template-columns: minmax(0, 1fr)` by default, switching to `repeat(2, minmax(0, 1fr))` inside `@container consultation (min-width: 48rem)` (`app.css:4884-4894`).

This is a two-column grid, not the `grid-cols-2 md:grid-cols-4 lg:grid-cols-6` tile grid in section 1. Line 131 of `ConsultationView.tsx` is the component declaration (`export function ConsultationView`), not the grid.

**Status:** Built as a container query (`app.css:4884-4894`, rendered at `ConsultationView.tsx:444`). It is not the target tile grid for the summary, which is not yet built (section 1).

## 3. Consultation page container

The page wrapper is a size container named `consultation`. Its `consultation-layout` root is at `app.css:4878-4882`, rendered at `ConsultationView.tsx:431`.

**Status:** Built. `.consultation-layout` (`app.css:4878`) sets `container: consultation / inline-size` and is used at `ConsultationView.tsx:431`.
