# docs/ — Map

Project documentation. Pick the right bucket below for a new doc rather than dropping another loose file at the top level.

Root files:

- `CORPUS_KEYS.md` — Corpus key-shape reference (which placements get which key format). Deps: `src/interpretation/schema.ts`; paired with `html/CORPUS_KEYS.html`.
- `DEPENDENCIES.md` — Hand-maintained dependency/licence inventory `CLAUDE.md`'s onboarding checklist points to. Deps: `node_modules/*/package.json` licence fields.
- `RELEASING.md` — Release policy and tagging scheme (every milestone ends in a release).
- `UI-UX_GUIDELINES.md` — Normative UI/UX implementation and behavior rules for future features. Deps: `src/ui`, `docs/UI-UX_REVIEW.md`.
- `UI-UX_IMPLEMENTATION_PLAN.md` — Phased coding plan for migrating routes, shell, settings, controls, charts, and Astrocartography to the target experience. Deps: `src/ui`, `test`, `e2e`, `docs/UI-UX_GUIDELINES.md`.
- `UI-UX_REVIEW.md` — Code-grounded 2026-10-09 design and usability audit with prioritized remediation. Deps: `src/ui`, `e2e/accessibility.spec.ts`.

Subdirectories:

- `adr/` — Architecture Decision Records, one numbered file per decision. Deps: paired HTML render lives in `html/adr/` where one exists.
- `agents/` — Generic Claude Code skill docs (`domain-modeling` skill's `CONTEXT.md`/ADR conventions) — not Astraya product documentation.
- `archive/` — Deprecated/retired docs, append-only, never deleted outright: abandoned tooling write-ups (LAYA/Ollama benchmarking, astrologyapi.com comparison) and the removed-env-vars log.
- `audit/` — One-off repository audits, reviews, and structural evaluations, filename datestamped `YYYY-MM-DD-description.md`. Audits and reviews are the same bucket — there is no separate `reviews/`.
- `html/` — Hand-written standalone HTML counterparts of select `.md` docs (HTML-first docs policy, #399/#427): reuses `src/ui/app.css`'s tokens, no build step, no external deps. Mirrors the source file's subdirectory, e.g. `html/adr/`.

## Where does a new doc go?

- A one-time decision with lasting rationale → `adr/`, numbered.
- A one-time audit, review, or structural evaluation → `audit/`, filename datestamped.
- A living reference meant to be read repeatedly, worth a nicer standalone render → top-level `.md`, optionally paired with `html/<same path>.html`.
- Writeup for tooling or an approach that's since been abandoned → `archive/`, don't delete it outright — git history alone makes old write-ups hard to find later.
- Docs for Claude Code's own generic skills, not specific to this app → `agents/`.
