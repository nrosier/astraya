---
name: astraya-visual-review
description: Hands a finished, merged UI batch to the owner for visual sign-off. Use when UI issues on main are waiting for the owner's 1920x1080 and 1280x800 light and dark check, or when the user asks for a visual review, a screenshot review, or a sign-off page. Builds main, captures the screens, produces the review page, publishes it privately, and records each verdict on its issue.
---

# Astraya Visual Review

Use this to hand merged UI work to the owner for their own look. It is the agent-side half of `docs/ops/VISUAL-REVIEW.md`. That document is the authority on the steps, the file formats and the coherence rules, so read it rather than working from this summary. This skill adds the order of operations, the issue bookkeeping and the guardrails.

The owner judges the screenshots. A coder never ticks the visual box from its own look.

**Size mismatch to resolve before a handoff.** The owner's current sign-off on open issues is 1920x1080 and 1280x800, in light and dark. `docs/ops/VISUAL-REVIEW.md` and `e2e/visual-review.spec.ts` still capture 390x844, 1280x800 and 3440x1440. Until the process doc and the capture spec agree with the owner, confirm which sizes to capture with the user. Do not silently pick one set.

**Screen coverage gap.** `e2e/visual-review-screens.json` has no screen for several open UI issues, so a batch can have nothing to capture. Report unmapped issues rather than inventing screens. Adding a screen is a code change and goes through a PR.

## Procedure

Run the steps in order. Stop at the first step that fails and report why.

1. **Find what is waiting.** List open issues whose body has an unticked sign-off box:
   `gh issue list --state open --json number` then, per issue, `gh issue view <N> --json body -q .body | grep -E '^- \[ \].*(visual sign-off|Checked at|1920x1080|1280x800)'`.
   Keep only issues whose fix is merged to main. A box on an unmerged issue is not ready for review.

2. **Build main in a clean worktree.** Use a detached worktree of `origin/main`, never the main checkout. Run `npm ci`, `npm run ephe:sync`, `npm run corpus:split`, `npm run build`. Without `corpus:split` the Interpretation screen fails to load, which is a capture problem, not a defect.

3. **Map issues to screens.** Read `e2e/visual-review-screens.json`. Each entry's `issues` field names the issues it covers. Report any waiting issue that no screen covers. Do not invent a screen. Add a step to `e2e/visual-review.spec.ts` only through a normal PR.

4. **Capture.** `VISUAL_REVIEW_OUT=<dir> npx playwright test e2e/visual-review.spec.ts --project=chromium`, in the worktree. Confirm the expected files exist before going on.

5. **Build the page.** `node scripts/build-visual-review.mjs <dir> <page.html> [slugs]`. Pass only the slugs for the batch when there are more than about 18 screens. Keep the file under the 16 MB artifact limit.

6. **Check the visual coherence rules before showing anything.** Use the list in `docs/ops/VISUAL-REVIEW.md`: aligned and equal-height controls, the time selector, Now and Export right-aligned, titles inside cards, shared card surface. Measure the rendered heights and bottoms. Fix or report a failure before the owner sees the page, so they don't review a defect the coder could have caught.

7. **Publish privately and hand over the link.** Use the available publishing tool if one exists in this session. If none exists, say so plainly, give the built file's path, and say how the owner can open it. Never invent a link.

8. **Record the outcome on each issue.** Post the owner's verdict verbatim as a comment on each issue, with the date. Then:
   - "Looks right" on every screen for an issue: tick that issue's visual box, and if it is the last unticked box, use the `astraya-issue-close` skill for the labels.
   - "Needs a change": leave the box unticked. Open or extend a PR for the change, and the next review shows that screen again.

## Guardrails

- The owner's verdict is the only thing that ticks the visual box. Do not tick it from a passing e2e run, a screenshot the coder took, or a comment that says the screens look fine.
- Do not decide for the owner which screens are acceptable. Report what was captured and what was measured.
- Do not merge, close or change labels as part of the handoff itself. The handoff ends with the link and the recording step.
- Record every decision the owner gives through the AskUserQuestion dialogue box, and post the question and answer as a comment on the issue, per the project rules.
- If the page cannot be built or a screen cannot be captured, report the exact failure. Do not hand over a partial page as complete.
