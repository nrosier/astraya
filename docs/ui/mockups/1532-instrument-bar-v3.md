# Instrument bar v3 mockup (issue #1532)

## Status

- The mockup was approved on 2026-11-14 (owner verdict "perfect"). The verdict covers the mockup only. No acceptance criterion on #1532 is ticked by it.
- The bar is partly implemented on this branch in commit 8d2a5fb3 and later. The Step A check on 2026-11-14 compared the implementation at 108373d2 with the v3 spec and the approved mockup. It does not match the spec yet.

Step A verdict (MATCH, DIFFERS or NOT PRESENT):

| Spec item                                                                                           | Verdict     | Reason                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bar container: surface background, 1px line border, 999px radius                                    | MATCH       | `.chart-instrument-bar` in `src/ui/app.css` uses `var(--surface)`, a hairline `var(--line)` border and `border-radius: 999px`.                                                     |
| Ring toggle "Natal + transit \| Natal only" on the left, with 1px divider                           | DIFFERS     | The toggle and divider exist in `ChartInstrumentBar.tsx`, but the toggle renders only while a transit ring is on (owner decision 2026-11-13). The mockup shows it unconditionally. |
| Three tone pills Hard, Soft, Minor, with solid, dashed and dotted borders in the tone tokens        | MATCH       | `.chart-tone-pill--hard`, `--soft` and `--minor` in `app.css` use solid, dashed and dotted borders in `--aspect-hard`, `--aspect-soft` and `--aspect-minor`.                       |
| Tri-state checked / partial / off per tone                                                          | DIFFERS     | Pills are binary (`aria-pressed` true or false). There is no partial state and no check or dash mark.                                                                              |
| Second divider, then a Filters pill with `aria-expanded` and `aria-haspopup="dialog"`               | NOT PRESENT | The bar has one divider only. There is no Filters pill.                                                                                                                            |
| Upward popover (`bottom: calc(100% + 0.5rem)`, `right: 0`) with preset row and two-column checklist | NOT PRESENT | No popover, preset row or checklist exists in `src/ui`.                                                                                                                            |
| Two-way sync between pills and popover                                                              | NOT PRESENT | The pills filter the wheel and Aspects table through `wheelTones` in `ChartView.tsx`. There is no popover to sync with.                                                            |
| Custom label when no preset matches                                                                 | NOT PRESENT | No preset state or label exists.                                                                                                                                                   |
| Responsive at 640px and below: radius `var(--radius)`, dividers hidden                              | MATCH       | The `@media (max-width: 40rem)` block in `app.css` sets `border-radius: var(--radius)` and hides `.chart-instrument-bar-divider`. 40rem equals 640px at the default root size.     |
| Responsive: two rows, ring toggle on row 1, tone pills and Filters on row 2                         | DIFFERS     | The bar uses `flex-wrap: wrap`, so it wraps, but the two-row layout is not designed and there is no Filters pill.                                                                  |
| Responsive: Filters opens a bottom sheet at 640px and below                                         | NOT PRESENT | No Filters control and no sheet exist.                                                                                                                                             |
| Aspect tone membership taken from `aspectTone`, not hard-coded                                      | MATCH       | `ChartViewAspects.tsx` uses `aspectTone` for the aspect icons, and the wheel filter reads `aspectByKey(...).tone`. `ALL_ASPECT_TONES` lists only the three tone names.             |

Not verified in this pass: the rendered look of the bar, contrast, keyboard behaviour, and any width between 391 and 640 px.

## Where to start

- Work from this branch, `origin/docs-1532-instrument-bar-mockup`. It is based on `origin/feat-1532-charts-wheel` at 108373d2.
- The other #1532 work is on `feat-1532-charts-wheel`.

## How to view the mockup

The mockup is in `mockups/1532-instrument-bar-v3/` at the repository root. It is self-contained and makes no network requests.

```sh
cd mockups/1532-instrument-bar-v3
python3 -m http.server 8000
```

Then open <http://127.0.0.1:8000/index.html>.

## Owner spec

The text below is the owner spec as posted, unchanged.

````text
### Chart Controls Bar: Adding the Granular Aspect Filter Pill

#### 1. Unified Bottom Instrument Bar Layout
Append the granular aspect filter as a **third segment** on the right end of the centered pill-shaped instrument bar (`background: var(--surface)`, `border: 1px solid var(--line)`, `border-radius: 999px`) beneath the wheel's vertical `MC`–`IC` axis.

```text
╭───────────────────────────────────────────────────────────────────────────────────╮
│ [ Natal + transit | Natal only ]  │  [ ✓ Hard ] [ ✓ Soft ] [ – Minor ]  │  [ Filters ▾ ] │
╰───────────────────────────────────────────────────────────────────────────────────╯
```

* **Segment 1 (Left, Ring Toggle):** The `Natal + transit | Natal only` segmented toggle.
* **Divider 1:** A `1px solid var(--line)` vertical divider (`height: 1.25rem`) separating ring selection from aspect filtering.
* **Segment 2 (Center, Quick Tone Pills):** The three tri-state aspect tone pills (`Hard`, `Soft`, `Minor`), encoded with their stroke styles (solid `--aspect-hard`, dashed `--aspect-soft`, dotted `--aspect-minor`) and displaying `✓` (all active), `–` (partial/indeterminate), or unchecked.
* **Divider 2:** A second `1px solid var(--line)` vertical divider separating quick tone toggles from the preset/granular disclosure pill.
* **Segment 3 (Right, Filter Disclosure Pill):** A compact pill (`border-radius: 999px`, `border: 1px solid var(--line)`) labeled `Filters ▾` (or dynamically displaying the active preset such as `Major ▾` or `Custom ▾`) with `aria-expanded` and `aria-haspopup="dialog"`.

#### 2. Upward-Anchored Popover Behavior
* **Positioning:** Clicking the `Filters ▾` pill opens a floating popover (`position: absolute; bottom: calc(100% + 0.5rem); right: 0;`) directly above the right end of the instrument bar, overlapping the lower margin of the chart stage without causing layout shift or resizing the wheel.
* **Popover Contents:**
  * **Top Row (Taxonomy Presets):** Single-click preset pills for `Major`, `Hard minor`, `Soft minor`, `Higher harmonic`, and `Nodal & angular`.
  * **Bottom Grid (Individual Aspect Overrides):** A compact 2-column checklist of individual aspects paired with their glyphs (`☌ Conjunction`, `⚹ Sextile`, `□ Square`, `△ Trine`, etc.).

#### 3. Two-Way State Synchronization
* **Popover → Tone Pills:** Selecting a preset or toggling individual aspect checkboxes inside the popover immediately updates the tri-state (`checked`, `indeterminate`, `unchecked`) status of the `Hard`, `Soft`, and `Minor` pills on the bar.
* **Tone Pills → Popover:** Clicking `Hard`, `Soft`, or `Minor` directly on the bar toggles all aspects belonging to that tone family and updates the filter pill label to `Custom ▾` if the resulting selection diverges from a named preset.

#### 4. Responsive Behavior
* **Desktop (`> 640px`):** All three segments sit inline on a single horizontal row inside the pill-shaped container (`border-radius: 999px`).
* **Mobile (`<= 640px`):** The outer container switches to `border-radius: var(--radius)` and hides the vertical dividers so the ring toggle wraps onto row 1 while `Hard`, `Soft`, `Minor`, and `Filters ▾` sit together on row 2; tapping `Filters ▾` opens a bottom sheet instead of a corner-anchored popover.
````

## Owner verdict

The text below is the owner verdict as recorded, unchanged.

```text
Owner review verdict on the instrument bar v3 mockup (2026-11-14), verbatim: "perfect"

Reviewed: /tmp/mockup-instrument-bar-v3/index.html, with bar-1920x1080-dark.png, bar-1920x1080-light.png, bar-390x844-dark.png and bar-390x844-sheet-dark.png in the same folder. Built from the owner spec posted earlier on this issue (/tmp/instrument-bar-spec/owner-update-bar-v3.md).

Scope of the verdict: the mockup as built. Nothing in the app has changed, and no acceptance criterion on this issue is ticked by it. Each criterion still needs the app build and its own evidence.

Builder choices that stand as built (listed in the mockup comment above; the verdict did not single any out):
- The "rest of the catalogue" includes a Nodal & angular contacts row with no tone.
- Some aspect glyphs are plain text (Q, bQ, Dc, S, N).
- Presets are single-select, and a preset label shows only on an exact match.
- The phone sheet has a Done button and a scrim.
- The old "Aspects shown" select is not linked to the new bar.

Still open, not covered by the verdict:
- Minor pill contrast on the dark theme. Its dotted border and partial mark are faint. I raised this in review; the verdict does not address it.
- Keyboard tab order and focus trapping inside the Filters popover: not verified.
- Widths between 391 and 640 px: not checked.

Next: building the bar in the app is not started. It needs your go-ahead. The mockup and spec live only in /tmp on this machine, not on GitHub.
```

## Choices the builder made

These five choices come from the #1532 comment and the owner verdict. The verdict did not single any out.

- The "rest of the catalogue" includes a Nodal & angular contacts row with no tone.
- Some aspect glyphs are plain text (Q, bQ, Dc, S, N).
- Presets are single-select, and a preset label shows only on an exact match.
- The phone sheet has a Done button and a scrim.
- The old "Aspects shown" select is not linked to the new bar.

## Open items

- Minor pill contrast on the dark theme. Its dotted border and partial mark are faint. The owner raised this in review, and the verdict does not address it.
- Keyboard tab order and focus trapping inside the Filters popover are not verified.
- Widths between 391 and 640 px are not checked.
- Dutch aspect names are unreviewed.
- Every DIFFERS and NOT PRESENT item in the Status table is open. The bar is not yet built to the v3 spec.

## Commits not made in the planning session

These six #1532 commits are on this branch. The planning session did not author them. Authors and trailers are listed for transparency.

| Commit   | Author                          | Trailer                         | Subject                                                                                              |
| -------- | ------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 8d2a5fb3 | nrosier <nick.rosier@gmail.com> | Co-Authored-By: Claude Opus 5.5 | feat(#1532): instrument bar under the natal wheel, with a ring toggle and Hard, Soft and Minor pills |
| 3c3ffeec | nrosier <nick.rosier@gmail.com> | Co-Authored-By: Claude Opus 5.5 | test(#1532): e2e for the instrument bar; Wheel-tab specs use the pills instead of the family Select  |
| 72785b40 | nrosier <nick.rosier@gmail.com> | Co-Authored-By: Claude Opus 5.5 | test(#1532): the birth-map fixture uses the adopted light accent                                     |
| 20784fbe | nrosier <nick.rosier@gmail.com> | Co-Authored-By: Claude Opus 5.5 | test(#1532): visual review capture steps for the Charts tabs and the wheel with a transit ring       |
| b9f2c58f | nrosier <nick.rosier@gmail.com> | Co-Authored-By: Claude Opus 5.5 | test(#1532): the select-height check names both measured heights when it fails                       |
| 108373d2 | nrosier <nick.rosier@gmail.com> | Co-Authored-By: Claude Opus 5.5 | fix(#1532): the wheel with overlay rings is drawn by the same dial as the plain wheel                |

## Related

- Issue #1532 and its comments: https://github.com/nrosier/astraya/issues/1532
