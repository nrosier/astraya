# Owner visual review

How a finished UI change is shown to the owner for a visual check, and how the owner's answer is recorded. It meets the
"Checked at 390x844, 1920x1080 and 1280x800 in light and dark" box that most UI issues carry (guidelines §17.2), which a
unit or e2e test cannot tick. The owner judges the screenshots; the coder does not tick that box on their own look.

## When

After a batch of UI work has merged to `main`, and before the visual boxes on those issues are ticked. One review page
covers every screen the batch changed. Review again after the fixes it asks for.

## Steps

1. **Build `main`**, with the corpus chunks, in a clean worktree: `npm ci`, `npm run ephe:sync`, `npm run corpus:split`,
   `npm run build`. Without `corpus:split` the Interpretation screen says it could not load the reading (it fetches a
   chunk that is not there), which is a capture problem and not a defect.
2. **List the screens.** Each entry in `e2e/visual-review-screens.json` has a `slug`, a `title`, the `issues` it covers and
   a `check`: one or two sentences saying what to look at (alignment, sizes, the rules in "Visual coherence" below). Add a
   step for a new slug in `e2e/visual-review.spec.ts`.
3. **Capture.** `VISUAL_REVIEW_OUT=<dir> npx playwright test e2e/visual-review.spec.ts --project=chromium` writes each screen
   at 390x844, 1920x1080 and 1280x800, in light and dark, as JPEGs. The spec skips without `VISUAL_REVIEW_OUT`, so CI never
   runs it.
4. **Build the page.** `node scripts/build-visual-review.mjs <dir> <page.html> [04,05,...]`. It is one self-contained HTML
   file (keep it under the 16 MB artifact limit: JPEG quality 58 gives about 0.8 MB a screen). Past about 18 screens,
   pass the slug numbers of the screens the batch changed (`04,05,11`), so a review shows what changed and nothing else.
5. **Publish it as a private artifact** and give the owner the link. The page groups the screens by issue, can filter by
   theme or size, opens any shot full size, and has a verdict row per screen (Looks right, Needs a change, a comment) with a
   box that copies the owner's notes. The owner pastes the notes back.
6. **Record every verdict on its issue**, verbatim, with the response and the pull request that fixes it. A screen marked
   "Looks right" ticks the issue's visual box. A screen marked "Needs a change" gets a pull request, and the next review
   shows it again.

## Visual coherence (what the owner checks, and what the coder checks first)

- Buttons, fields and selects in one row share a height and a bottom edge.
- The time selector, Now and Export sit right-aligned in the heading row; Export is the rightmost action.
- Content sits in cards with the title inside; no title on a card's border, no card inside a card.
- Cards share one surface, border, radius, padding and title size.
- Measure before asking: the heights and bottoms of a row's controls at the three sizes.

## Related

`ui/UI-UX_GUIDELINES.md` §17.2 (mockups and owner visual checks), `ops/CI.md` (the e2e runs), `ops/RELEASING.md`
(`ui/UI-UX_RELEASE_CHECKS.md` holds the per-release manual checks).
