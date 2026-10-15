# .claude/skills/ — Map

Repo-specific Claude Code skills: in-the-moment guidance while coding, distinct from the PR-review agents in `.claude/agents/`. Each skill cross-references its owning agent instead of duplicating its checklist.

- `astraya-calculation-integrity/` — sweph-wasm import boundary, the `cusps[0]` indexing landmine, golden-chart gate discipline. Deps: `docs/adr/0001-swiss-ephemeris-as-the-engine.md`, agent `astrologer`.
- `astraya-release-gate/` — flags when a code change needs a Dockerfile/`.env.example`/CI-workflow update, and the non-shipped-files parts of a release (versioning, four files, tag sequence). Deps: skill `release-shipped-files-check`, agent `release-engineer`.
- `astraya-corpus-integrity/` — never run paid corpus-gen scripts unattended, derive keys/category instead of hand-typing, anchor provenance, lint-vs-schema coverage gap in admin overrides. Deps: `tools/corpus-gen/MAP.md`, `src/interpretation/schema.ts`, `src/interpretation/lint.ts`, agent `astrologer`.
- `astraya-security-sync-review/` — opt-in rate limiting, hand-mirrored client/server contract, op-log `Spine` immutability, synchronous-SQLite scan bounds — checklist while coding `server/auth/`, `server/ops/`, `src/sync/`. Deps: agents `security-auditor`, `db-integrity`, `api-contract`, `query-performance`, skill `server-route-rate-limit`.

Note: the 16 `ui-*` and 4 implementation-guidance skills from #577 (`i18n-compile-time-parity`, `release-shipped-files-check`, `server-route-rate-limit`, `verify-tooling-exists-before-proposing`) are not present in this directory on disk — despite commit `c5a6c8e`'s message, that commit only added `next-issue-recommendations.html`; those 20 skills exist only under the user's global `~/.claude/skills/`, never committed to this repo. Flagged here rather than silently assumed fixed; not corrected in this change since it wasn't asked for.
