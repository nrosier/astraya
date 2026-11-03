# UI/UX spec review — 2026-11-03

- **Status:** Rendered-UI audit; no product behaviour changed
- **Build:** `main` at `b21960d` (v0.46.0 plus UI review tooling), served by the real server from `dist/`
- **Reference:** `docs/ui/UI-UX_GUIDELINES.md`, `docs/ui/UI-UX_IMPLEMENTATION_PLAN.md`, closed owner decisions, and the open issues in milestone M14
- **Method:** the `ui-ux-spec-review` skill (`.claude/skills/ui-ux-spec-review/SKILL.md`)

## Summary

The app is in good shape on structure, contrast, focus visibility and theme parity: every captured page passed the automated colour-contrast check in both themes, has one `<main>` and one `<h1>`, and never scrolls horizontally.

The main gap is target size. On a touch phone almost every control is below the 44px minimum of guidelines §6, and a few controls fall below the WCAG 2.2 AA 24px minimum even on desktop. Component sizing and spacing-token use are only partly consistent. Pass 2 found one more High finding: the page language stays English in Dutch. Every finding is now tracked by an M14 issue (see Issue coverage).

## Method and limits

- **Routes (31):** People, Overview, Birth record, the six chart views (Wheel, Aspects, Matrix, Elements, Placements, Patterns), Consultation, Interpretation, Astrocartography, Synastry, Composite, Transits, Forecast, Timing timeline, Progressions, Profections, Solar arc, Primary directions, the six Tools pages, Documents, PDF builder, Preferences and About. Person routes used the seeded e2e person Albert Einstein.
- **Viewports:** 390×844 (touch and mobile emulation), 1280×800 and 3440×1440, each in light and dark: 186 captures.
- **Capture:** a temporary Playwright spec (deleted afterwards) on the e2e harness, recording a full-page screenshot, the box and computed styles of every interactive element, off-token spacing, multi-column grids and clipped overflow, and an axe run (`color-contrast`, `target-size`, `button-name`, `link-name`, `label`, `landmark-one-main`, `region`, `heading-order`). At 1280×800 light, the first 12 Tab stops per page were checked for a visible focus indicator.
- **Font:** the real system font stack (Segoe UI on the Windows host), not the e2e pinned font, so text widths differ slightly from CI.
- **Spacing scale:** the root font size is 14px (`src/ui/app.css:330`), so the spacing tokens resolve to 3.5, 7, 10.5, 14, 21, 28 and 42px. Spacing was scored against those values.
- **Not checked:** contrast of hover, disabled and selected states by hand; the 768×1024 and 1440×900 sizes; screen readers. Dialogs, signed-in and admin routes and the Dutch locale were covered by pass 2 (below).

## Passed

- Colour contrast (WCAG AA): no axe `color-contrast` violation on any of the 186 captures, in either theme.
- One `<main>` and one `<h1>` on every page.
- No horizontal page scroll at any viewport.
- A visible focus indicator on every checked Tab stop.
- No hex colour literal in `app.css` outside token definitions (§11).
- No console errors, apart from a 401 on People when signed out (finding 16).
- Horary: the date and location cards share one bottom edge, and the parameters card spans the full row.

## Findings

Severity follows the skill: **Critical** (unusable or unreadable), **High** (WCAG AA failure, touch target below 44px, missing primitive), **Medium** (§10.1 layout, off-token spacing, a component that differs from its primitive), **Low** (1–4px near-misses, cosmetic).

| #   | Severity | Finding                                                                                                     | Measured                                                                                                                                                                                                                                                                       | Spec                                                 | Source                                                                                                                                    |
| --- | -------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High     | Touch targets below 44×44px on phones, on every page                                                        | Standard buttons 40.5px tall; selects 38.4; Disclosure triggers 38.5; Menu 36.3; "Local only" sync badge 12.6; symbol toggle 31.5; table sort headers 18.3; Copy and Download CSV 30.3; Export toggle 34; "← BACK" link 15; checkboxes 13×13. 375 distinct controls at 390×844 | §6 (44px on touch); §4 (Disclosure trigger row 44px) | Base button padding `0.55rem 1rem` (`app.css:1452`); the coarse-pointer rule only restores compact to standard size (`app.css:5959-5970`) |
| 2   | High     | Targets below the WCAG 2.2 AA 24×24px minimum on desktop too                                                | "About dispositors" 6.1×24.1 (Patterns); "About Rx" 15.4×15.4 and a sort header 13.8×18.3 (Placements); Overview "Next" links 19px tall                                                                                                                                        | §9, WCAG 2.5.8                                       | `button[aria-label="About dispositors"]`, `button[aria-label="About Rx"]`, Overview link list                                             |
| 3   | Medium   | Heading levels skip on 8 routes                                                                             | Cycles, Eclipses, chart Wheel (Selection inspector heading), Transits, Forecast, Progressions, Solar arc, Primary directions                                                                                                                                                   | §9 (semantic headings)                               | axe `heading-order`; e.g. `#selection-inspector-heading`                                                                                  |
| 4   | Medium   | The narrow-screen sub-view Select sits outside every landmark                                               | `.tab-row__fallback` on all 15 sub-view pages at 390×844, both themes                                                                                                                                                                                                          | §9                                                   | axe `region`                                                                                                                              |
| 5   | Medium   | One button type comes in several heights and paddings                                                       | `.quiet` buttons 30.3, 38.1 and 40.5px; `.page-header-export-toggle` 34; `.chart-overlay-trigger` and `.extended-settings-trigger` 36.3; compact 30.9; primary horizontal padding 15.4px against 14px for the default button                                                   | §6 ("do not create feature-specific heights")        | `.primitive-button-primary` `0.55rem 1.1rem` (`app.css:5940`) against `button` `0.55rem 1rem` (`app.css:1452`)                            |
| 6   | Medium   | Spacing bypasses the tokens                                                                                 | 112 distinct off-token values at 1280×800. Every text field and select pads 9.8px (`0.7rem`); table cells 4.9px; Export toggle 5.6/11.2px. 189 of 601 spacing declarations in `app.css` use `var(--space-*)`                                                                   | §11                                                  | `src/ui/app.css`                                                                                                                          |
| 7   | Medium   | The guidelines and the code disagree on the spacing grid                                                    | §11 says "Keep layout spacing on the 4px grid"; with the 14px root the tokens are on a 3.5px grid                                                                                                                                                                              | §11 against `app.css:330` (commit `fbf4186`)         | `docs/ui/UI-UX_GUIDELINES.md` §11                                                                                                         |
| 8   | Medium   | PDF builder: the summary column is far shorter than the form, and the header crowds four items into one row | Columns 152px and 1006px tall (15%). Title, Starting point select, disabled Build PDF and its hint share one row at 1280×800                                                                                                                                                   | §10.1 rule 2; §5                                     | `div.pdf-builder-grid`                                                                                                                    |
| 9   | Medium   | Consultation on phones: the transits table is cut off at the right edge with no visible scroll cue          | State column truncated ("Separatin…") at 390×844                                                                                                                                                                                                                               | §10 (tables scroll within labelled containers)       | Consultation "Major active transits" table                                                                                                |
| 10  | Medium   | Transits contacts table header reads "Aspect Aspect"                                                        | The sort button and the glossary tooltip trigger both render the word; the Aspects table uses a "?" trigger for the same purpose                                                                                                                                               | §12 (one term, one pattern)                          | `button "Aspect"` + `button.primitive-tooltip-trigger "Aspect"`                                                                           |
| 11  | Medium   | Tool pages do not yet follow the 60/40 tool-page layout                                                     | Cycles, Ephemeris research, Electional, Eclipses and Rectification stack one full-width form                                                                                                                                                                                   | Tool-page rule (to be written by #1057)              | Tools views                                                                                                                               |
| 12  | Low      | Chart wheel and Selection inspector end on different bottom edges                                           | 20.9px apart at 1280×800 and 3440×1440                                                                                                                                                                                                                                         | §10.1 rule 1                                         | `div.chart-workbench`                                                                                                                     |
| 13  | Low      | 1px left-edge near-misses                                                                                   | "← BACK" against data tables (table border) on Aspects, Placements, Eclipses, Progressions, Solar arc; Consultation headings against tables; Birth record "Notes" against a Disclosure; Preferences card title against EN/NL                                                   | §10.1 rule 4                                         | Measured left edges                                                                                                                       |
| 14  | Low      | Primary directions checkbox columns misalign                                                                | 2–3px between rows (Venus/Pluto, Saturn/Neptune); the options wrap rather than sit on a grid                                                                                                                                                                                   | §6                                                   | `label.primitive-choice` in the significator groups                                                                                       |
| 15  | Low      | Most routes keep the generic document title                                                                 | 25 of 31 routes show "Astraya — astrological charts"; only the chart views set their own                                                                                                                                                                                       | WCAG 2.4.2                                           | `document.title`                                                                                                                          |
| 16  | Low      | People logs a 401 on load when signed out                                                                   | `Failed to load resource: 401` on every viewport                                                                                                                                                                                                                               | §7 (unhappy paths stay quiet)                        | Session probe on People                                                                                                                   |

## Pass 2: dialogs, signed-in and admin routes, Dutch

Run the same day with a second temporary spec: 98 captures, none failed.

- **Dialogs and popovers** (signed out, seeded people), at 390×844 and 1280×800 in light and dark: Extended settings, Overlay settings, transit filters, Map settings, Sign in, the profile popover, the sync badge popover, the page-header Export menu, the phone menu, and the Add a person form. For each: role, modal state, accessible name, whether focus moves in, Tab stops that leave it (25 presses), whether Escape closes it, and whether focus returns to the trigger.
- **Signed in** as the bootstrap admin: People, Admin, Admin usage, corpus candidates, corpus overrides, Preferences, PDF builder, and the signed-in profile popover. The test server ran without `ASTRAYA_ENCRYPTION_KEY`, so the sync relay was off and some pages log a 503 from it; that is the test setup, not a defect.
- **Dutch:** 14 routes at 390×844 and 1280×800 in light, after switching the interface to Nederlands, checked for text that overflows or is cut off, and for the page language.

### Passed in pass 2

- Extended settings, Map settings, the transit filters dialog and Sign in are modal, labelled, take focus on open, keep it inside (0 of 25 Tab stops leave), close on Escape and return focus to the trigger on desktop.
- The Admin pages, the Add a person form and the signed-in pages render cleanly at 1280×800, with no axe failures.
- **Dutch strings fit:** no button, label, heading or table cell overflows or is cut off in any of the 28 Dutch captures, despite longer labels such as "Astrologische standaarden" and "PDF samenstellen".
- The phone menu is an in-flow panel (§10) and returns focus to its toggle on Escape.

### Pass 2 findings

| #   | Severity | Finding                                                                | Measured                                                                                                                                                   | Spec                              | Source                      |
| --- | -------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------- |
| 17  | High     | The page language stays English when the interface is Dutch            | `<html lang="en">` on all 28 Dutch captures; nothing in `src/` updates it                                                                                  | WCAG 3.1.1 (level A)              | `index.html:2`              |
| 18  | Medium   | Overlay settings is a staged drawer but not modal                      | `:modal` false; 18 of 25 Tab stops land on the page behind, where Extended settings, Map settings and transit filters keep all 25 inside                   | §4, §9                            | Overlay settings `<dialog>` |
| 19  | Medium   | On phones, focus is lost when a chart settings drawer closes           | At 390×844 the trigger sits in the collapsed Chart actions menu; after Escape focus is not on any visible control (Extended settings and Overlay settings) | §9 (restore focus to the trigger) | Chart actions menu          |
| 20  | Medium   | The sync badge popover ignores Escape                                  | `#syncbadge-popover` (`role="status"`) stays open on Escape, does not take focus, and its link is 16px tall on a phone                                     | §9                                | `#syncbadge-popover`        |
| —   | High     | Touch targets in dialogs, the phone menu and Preferences, as finding 1 | Dialog controls all below 44px (checkboxes 13×13, Close 39.7×40.5); menu items 41.3px; Preferences tabs 39.1px; birth record status icon 15.4×15.4         | §6                                | Added to #1073              |
| —   | Medium   | The narrow-screen sub-view Select misses a landmark on Admin pages too | axe `region` on `#/admin`, usage, corpus candidates and corpus overrides at 390×844                                                                        | §9                                | Added to #1050              |
| —   | Low      | Disabled Overlay settings labels are low contrast                      | 2.66:1 light, 3.35:1 dark; WCAG exempts inactive controls                                                                                                  | §9                                | Noted in #1080              |

Not concluded: the profile popover and the Export menu closed when the focus test tabbed out of them (which §9 asks for), so whether Escape returns focus to their trigger was not measured.

## Look and feel

**Strong**

- The light and dark palettes are coherent and complete, and contrast holds everywhere.
- Calculated pages share a clear "Feature · Subject" title.
- Cards share one radius and surface treatment.
- Consultation on a phone reads well: dense, but scannable.

**Weak**

- **Overview** is sparse: four bulleted links in a narrow column, with most of a 3440px screen empty.
- **Chart wheel at 1280×800:** the wheel is about 350px across in a column of about 650px, beside a tall, empty Selection panel. The fold-fit rule may explain part of this, but it reads as unused space.
- **Transits:** the As-of date field stretches to about 850px for a ten-character date, and the chart legend text is about 8px.
- **Phone header:** "Local only", "Sign in", the account menu and the theme toggle form two rows of small pills; all are below 44px. On desktop the theme toggle wraps onto its own line in the sidebar.

## Issue coverage

Issues were filed or extended on 2026-11-03, after this review. All are in milestone M14.

| Finding                              | Tracked by                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1, 2 (target size)                   | #1073 (new)                                                                                           |
| 3 (heading order)                    | #1064 (route-by-route audit)                                                                          |
| 4 (sub-view Select landmark)         | #1050 (criterion added)                                                                               |
| 5, 6 (button sizing, spacing tokens) | #1074 (new; cross-referenced from #826 and #514)                                                      |
| 7 (4px grid against 14px root)       | #1057 (item added)                                                                                    |
| 8 (PDF builder)                      | #1075 (new)                                                                                           |
| 9 (Consultation table on phones)     | #1076 (new)                                                                                           |
| 10 (duplicate header label)          | #1077 (new; root cause `SortableTable.tsx:209`, the `labelTerm` and `labelTooltip` header-help props) |
| 11 (tool-page layout)                | #1051, #1052, #1053, #1054, #1065                                                                     |
| 12 (wheel and Selection bottom edge) | #900 (Selection card height)                                                                          |
| 13, 14 (alignment near-misses)       | #1064                                                                                                 |
| 15 (document titles)                 | #1078 (new)                                                                                           |
| 16 (401 on People when signed out)   | Not filed; console noise, not a visible defect                                                        |
| 17 (`<html lang>` in Dutch)          | #1079 (new)                                                                                           |
| 18, 19 (chart settings drawers)      | #1080 (new)                                                                                           |
| 20 (sync badge popover)              | #1081 (new)                                                                                           |
| Pass 2 target sizes                  | #1073 (measurements added)                                                                            |
| Pass 2 Admin landmark                | #1050 (comment added)                                                                                 |
| Look and feel: Overview              | Loosely #1058 and #1060; neither redesigns Overview                                                   |
