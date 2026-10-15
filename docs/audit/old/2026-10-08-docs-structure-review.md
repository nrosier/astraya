# docs/ structure review — 2026-10-08

Prompted by a cleanup pass (archiving dead LAYA/Ollama/astrologyapi.com tooling docs, splitting HTML
renders into `html/`, consolidating "reviews" into the existing `audit/` convention). This records
what changed, what was found along the way, and what's deliberately left open rather than guessed at.

## What changed in this pass

- `LAYA_INTERPRETATION_COMPARISON.md`, `OLLAMA_CORPUS_GENERATION.md` → `archive/`. Both document
  tooling (`tools/corpus-gen/archive/benchmark-batch.mjs` and friends) that already lives under its
  own `archive/` directory and isn't wired into any `npm run` script — the docs were stale by the same
  measure the code already used.
- `BENCHMARK_ASTROLOGYAPI.md` → `archive/` too, for the same reason: it's the write-up for `#368`'s
  astrologyapi.com comparison, whose scripts (`benchmark-batch.mjs`, `benchmark-dashboard.mjs`) are
  already archived code. This one wasn't named by the original request but matched its own stated
  criterion, so it moved along with the other two rather than being left as the one top-level doc
  describing dead tooling.
- `CORPUS_KEYS.html` and `adr/0001-swiss-ephemeris-as-the-engine.html` → `html/` (mirroring their
  source's subdirectory, so the ADR's HTML sibling is `html/adr/...`, not flattened into `html/`
  directly).
- `CODEX_REVIEW.md` → `audit/2026-10-07-codex-review.md` (datestamped from the audit date inside the
  document itself). Per instruction, audits and reviews are treated as the same bucket — there is no
  separate `docs/reviews/`; the pre-existing `audit/2026-09-26-full-audit.md` and the newly-moved
  Codex review now sit side by side under one convention.
- Added `docs/MAP.md` — this repo's `CLAUDE.md` requires one per major directory, and `docs/` didn't
  have one despite having grown to five subdirectories.
- Every cross-reference to a moved file was grepped for and updated: `CHANGELOG.md`,
  `docs/CORPUS_KEYS.md`, `docs/DEPENDENCIES.md`, `docs/archive/BENCHMARK_ASTROLOGYAPI.md`'s own
  internal links, `.gitignore`, and three `tools/corpus-gen/*.mjs` files that cited a doc path in a
  comment or user-facing message string.

## Findings not acted on, left for a decision

- **The HTML-first docs policy's actual reach is inconsistent.** Only `CORPUS_KEYS.md` and
  `adr/0001-swiss-ephemeris-as-the-engine.md` have an HTML counterpart; `DEPENDENCIES.md`,
  `RELEASING.md`, ADRs 0002/0003, and both `audit/` entries do not. If the policy is meant to apply
  to every doc going forward, that's six-plus backfills; if it's meant only for docs explicitly
  chosen for a nicer render (the original #399 pilot framing), the current state is already correct
  and nothing is owed. This review doesn't resolve that either way — `docs/MAP.md` states the
  narrower reading ("docs meant for repeat consultation") as the working rule, but that's this
  review's judgment call, not a ratified policy change.
- **`docs/agents/` is easy to misread as Astraya domain content** ("agents" meaning astrologers' or
  users' "agents") when it's actually generic Claude Code skill-system documentation
  (`domain-modeling`'s `CONTEXT.md`/ADR conventions), unrelated to this app's subject matter. Left the
  directory as-is since renaming it means updating whatever skill tooling expects that path by
  convention — not confirmed safe to do blind. Noted in `docs/MAP.md` so at least the mislabeling risk
  is flagged for a reader rather than left silent.
- **`audit/2026-09-26-full-audit.md` is referenced by two `.claude/agents/*.md` subagent
  definitions** (`db-integrity.md`, `security-auditor.md`). It didn't need to move in this pass (it
  was already in the right bucket), but any future rename or relocation of anything under `audit/`
  needs to grep those two files too, not just the usual doc cross-references.
