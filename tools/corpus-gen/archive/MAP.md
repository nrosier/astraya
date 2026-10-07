# tools/corpus-gen/archive/ — Map

Retired corpus-gen scripts, kept for reference (git history + rationale) rather than deleted outright. None of these are part of the live generate/evaluate/improve/clean-up pipeline anymore — see `../MAP.md` for what is. Not wired into any npm script; run only by hand, if ever, with full awareness that the thing it exists for is already done.

- `pilot-benchmark-cost.mjs` — One-off #368 pilot that confirmed astrologyapi.com's endpoint shapes/cost before `benchmark-batch.mjs` was built. Superseded now that `benchmark-batch.mjs` exists and cites this pilot's own findings.
- `sample-validate-batch.mjs` — #368 pre-regen "sample a sparse category, judge fact-grounding + lint, report-only" confidence check. Redundant with the real loop's existing coverage: `verify-batch.mjs` (fact-grounding) + `evaluate-corpus-batch.mjs` (second-opinion judge) on real, already-generated entries.
- `remove-quintile-series-entries.mjs` — One-time #396 correction. Already applied (`bc239f9`, quintile/biquintile aspect entries regenerated under the corrected prompt) — no stated reason to keep for reuse, unlike its sibling `remove-same-point-variant-pairs.mjs` which stayed in the active list.
- `recover-batch.mjs` — Manually re-fetched a completed OpenAI batch's results into `feedback.json`. Fully superseded by `evaluate-corpus-batch.mjs`'s `--batch=<id>` flag, which does the same live fetch plus handles partial results from a cancelled/failed batch and reconstructs an unrecorded job's candidates from OpenAI directly.
