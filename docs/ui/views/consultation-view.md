# Consultation view (target design)

**Scope:** The consultation dashboard (`ConsultationView.tsx`): the summary of core planetary indicators at the top of the page and the layout of the sections below it. Target design only; general rules live in `docs/ui/UI-UX_GUIDELINES.md`.

Each section ends with a **Status** line. Verified against the code on 2026-11-04 (main at a16b105; #800, #801, #817 and #981 have closed since 2026-10-25).

## 1. Summary tile grid for core planetary indicators

The "At a glance" block is replaced by a horizontal grid of summary tiles for the core planetary indicators (the big three, chart ruler, and sect). Target grid: 2 columns by default, 4 from the `md` width, and 6 from the `lg` width, with a `0.75rem` gap (`var(--space-3)`). Native CSS equivalent: `display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3);`, with `repeat(4, ...)` and `repeat(6, ...)` at the `md` and `lg` breakpoints.

**Status:** Built (#800, closed). The summary is a tile grid, `dl.consultation-tiles` (`app.css:7047-7068`, rendered at `ConsultationView.tsx:526`): 2 columns by default, 4 from `40rem` and 6 from `64rem` of container width, with a `--space-4` / `--space-6` gap rather than the `md`/`lg` breakpoints and `0.75rem` gap in the target text above. The heading comes from `overviewT.heading` (`ConsultationView.tsx:525`).

## 2. Current section grid (for reference)

The data sections sit in a two-column grid once the page container is at least `48rem` wide. The class is `consultation-grid` (`ConsultationView.tsx:536`). Its CSS is `grid-template-columns: minmax(0, 1fr)` by default, switching to `minmax(0, 3fr) minmax(0, 2fr)` (about 60/40) inside `@container consultation (min-width: 48rem)` (`app.css:6977-6989`).

This is a two-column grid, not the `grid-cols-2 md:grid-cols-4 lg:grid-cols-6` tile grid in section 1.

**Status:** Built as a container query (`app.css:6977-6989`, rendered at `ConsultationView.tsx:536`). The summary tile grid of section 1 is built separately.

## 3. Consultation page container

The page wrapper is a size container named `consultation`. Its `consultation-layout` root is at `app.css:6971-6975`, rendered at `ConsultationView.tsx:523`.

**Status:** Built. `.consultation-layout` (`app.css:6971`) sets `container: consultation / inline-size` and is used at `ConsultationView.tsx:523`.
