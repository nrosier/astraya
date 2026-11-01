# Astraya Issue Close

Use before closing any Astraya GitHub issue, and before changing an issue's progress labels. It applies the rules in the project CLAUDE.md ("Git Workflow") and the global CLAUDE.md ("Auto-close guard"). It does not decide whether the work is done. It checks that the issue's own record agrees with the state of main.

## Procedure

Run these steps in order. Stop at the first step that fails, and report why.

1. **Read the body and count unticked boxes.**
   `gh issue view <N> --json body -q .body | grep -c '^\s*- \[ \]'`
   If the count is non-zero, do not close. Post the unticked items as a comment if the user asked for a status note.

2. **Check the fix is merged.**
   Find the PRs that say "Part of #N" or "Refs #N" (`gh pr list --state merged --search "N in:title"` and `gh pr view <PR> --json state,mergedAt`). Confirm at least one merged PR to main delivers the work the ticked boxes describe. A ticked box with no merged PR behind it is a labelling question, not a closing one: ask the user before changing labels.

3. **Set the progress labels to match the state.**
   - All boxes ticked and the fix is merged: remove `partially-fixed`, add `fixed`.
   - The fix is on main but no release tag contains it yet: keep `fixed`, add `waiting-for-release`.
   - A tagged release contains the fix: remove `waiting-for-release`.
   - Never leave `partially-fixed` on an issue whose boxes are all ticked.
   - Apply with `gh issue edit <N> --remove-label partially-fixed --add-label fixed`.

4. **Close only if every condition holds.** Close when there are zero unticked boxes, the fix is merged to main, and the labels from step 3 are set. Use `gh issue close <N>`.

5. **Write the closing comment with evidence.** Name the merged PR and merge commit, and list the checks that back each ticked box. The comment must not say a criterion is met unless it is ticked and backed by evidence.

## Exceptions

- **User-approved closure with unticked boxes.** Close only if the user has explicitly approved it, then record the approval and the note as a comment before closing. The comment states which boxes were left open and why.
- **Verification-only work.** A box can be ticked from read-only review or a verification run with no code merged. Such an issue gets `fixed` only if the user has confirmed that verification-only ticks count as done. Otherwise leave the label as it is and do not close.

## What this skill does not do

- It does not merge PRs. Merging needs every required check passing in the same call (`gh pr checks <N>`).
- It does not tick boxes. Ticking needs evidence from the change or a verification run.
- It does not cut a release. Use the `release-engineer` agent for that.

Deps: project CLAUDE.md ("Git Workflow"), global CLAUDE.md ("Auto-close guard"), memory `project_issue_labels`.
