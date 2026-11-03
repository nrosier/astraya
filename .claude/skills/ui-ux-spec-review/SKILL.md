---
name: ui-ux-spec-review
description: Audits Astraya UI against the component specs in docs/ui — visual alignment, component uniformity, spacing tokens, WCAG AA contrast and touch-target size — from screenshots and computed styles captured with Playwright. Use when asked to review a route or component for UI/UX consistency, before an owner visual check, or for a conformance audit such as #1064.
---

# UI/UX Spec Review

Measures what the browser actually renders and compares it with the specs. The specs are the authority: `docs/ui/UI-UX_GUIDELINES.md` (§5 hierarchy, §6 controls, §9 accessibility, §10 and §10.1 layout, §11 tokens), `docs/ui/UI-UX_IMPLEMENTATION_PLAN.md` and `docs/ui/views/*.md`. Closed issues are the baseline where they record a later owner decision than the guidelines; check the open guideline-sync issue (#1057) for the known differences before flagging one.

This skill reviews and reports. It does not change product code. File or update issues only when the user asks.

## Step 0: Scope

- Name the routes or components under review, using the route list in `docs/ui/ROUTE-AUDIT-964.md`.
- Read the relevant guideline sections and `docs/ui/views/<view>.md` before measuring, so every finding can cite a rule.
- Build once: `npm run build`. Playwright runs against `dist/` through the real server.

## Step 1: Capture visuals and DOM metrics

Write a temporary spec at `e2e/zz-spec-review.tmp.spec.ts`. Reuse the e2e harness rather than a new one: `build()` from `server/index.ts`, `newSeededContext` and `openSharedPerson` from `e2e/shared-people.ts`, and `gotoAndSettle` from `e2e/support.ts` (see `e2e/accessibility.spec.ts` for the pattern). Run only it with `npx playwright test e2e/zz-spec-review.tmp.spec.ts`. **Delete it afterwards; never commit it.** Write screenshots and JSON output to the session scratchpad, not the repo.

- **Viewports:** 390×844 (with `hasTouch: true`, `isMobile: true`), 1280×800 and 3440×1440, each in light and dark theme. These are the owner-check sizes (decision 2026-11-03). Add 768×1024 and 1440×900 only when the change targets them (§10).
- **Screenshots:** a full-page shot per route, viewport and theme, plus element shots of each component under review.
- **Computed styles:** for each targeted element record `getBoundingClientRect()` and `getComputedStyle()` values for `padding-*`, `margin-*`, `gap`, `font-size`, `line-height`, `font-weight`, `height`, `min-height`, `border-radius`, `color` and `background-color`, along with its selector and the primitive it should come from.
- Wait for the page to settle (no `aria-busy="true"`) before measuring.

## Step 2: Spec and alignment checks

- **Alignment axes:** form fields, buttons and card text in one column should share the same left edge. Group elements by column and compare `left` values. Flag offsets of 1–4px as **near-miss** bugs (likely a stray padding or border); larger offsets are layout bugs. Also check §10.1 rule 4: the grid edges match the page content width.
- **Multi-card layout (§10.1):** the bottom row's cards share one bottom edge; in a side-by-side pair the shorter column is at least about 90% of the taller one at all three viewports. Tool pages use the 60/40 split (form 60, panel 40, results full width below, stacked on phones). Report shortfalls with the measured heights; do not suggest fixed heights as the fix.
- **Component uniformity:** every primary button matches the `Button` primitive (`src/ui/primitives/Button.tsx`): the same `height`, `border-radius` and horizontal padding per size (`standard` or `compact`). A navigation action styled as a button must be an anchor with the shared button classes, not a `<button>` (#1048). Fields come from `TextField`, `DateField`, `NumberField` and `Select` (§6, §11). Anything that looks like a primitive but isn't one is a finding.
- **Spacing scale:** padding, margins and gaps must resolve to the `app.css` tokens: `--space-1` 4px, `--space-2` 8px, `--space-3` 12px, `--space-4` 16px, `--space-6` 24px, `--space-8` 32px, `--space-12` 48px (the 4px grid, §11). Radii must resolve to `--radius-sm` or `--radius`. Off-scale values are findings unless they are chart or visualization geometry, which §11 exempts. Confirm a suspect value with a grep for a literal in `src/ui/**/*.css` or an inline `style` object.

## Step 3: Visual and UX audit

- **Contrast (WCAG AA):** 4.5:1 for normal text, 3:1 for large text (24px, or 18.66px bold) and for non-text UI such as borders of inputs and the focus indicator (§9). Run `AxeBuilder` with the `color-contrast` rule in both themes, then compute ratios by hand for states axe skips: hover, focus-visible, disabled, selected and text over chart graphics. A theme that fails where the other passes is a finding (§11: both themes must be complete).
- **Touch targets:** at 390×844 with touch emulation, every interactive element is at least 44×44 CSS px (§6, and §4 for disclosure trigger rows). Desktop pointer layouts deliberately use tighter rows (`app.css`, #513), so do not flag 36px controls at 1280 or wider unless the pointer is coarse.
- **Remaining §9 basics seen in the capture:** a visible focus indicator on every control (tab through the page), one `<main>`, icon-only controls with accessible names. An axe pass is a floor, not proof (§9).
- **Severity:**
  - **Critical:** content or an action is unusable or unreadable: text contrast below 3:1, a control unreachable by keyboard or touch, content clipped at a supported viewport.
  - **High:** a WCAG AA failure (contrast 3:1 to 4.5:1 on normal text, targets below 44px on touch), a navigation action built as a button, a missing primitive on a shared control.
  - **Medium:** a §10.1 layout failure, off-scale spacing, a component that differs from its primitive's height, radius or padding.
  - **Low:** 1–4px near-miss alignment, cosmetic differences between themes that keep contrast.

## Report

One table per route: severity, finding, measured value, expected value with its spec citation (`UI-UX_GUIDELINES.md §n`, or the closed issue), the source location (`file:line`) where found, and the screenshot path. Order findings most severe first. List checks that passed, so the reader knows what was covered, and anything not checked and why.

Before reporting, confirm the temporary spec is deleted and `git status` shows no stray files from the review.

Deps: `docs/ui/UI-UX_GUIDELINES.md`, `docs/ui/ROUTE-AUDIT-964.md`, `e2e/shared-people.ts`, `e2e/support.ts`, `@axe-core/playwright`, agents `ui-ux-reviewer` and `a11y-specialist`.
