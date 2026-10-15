# Astraya Release Gate

Use while preparing a release commit, or while making any change that touches `server/`'s import graph, adds an environment variable, or adds a `server/`-imported `src/` file — not just when explicitly asked to "cut a release." Astraya's local gates (`npm run check`, the e2e suite) run from the working tree, where every file exists; they cannot catch a packaging file (Dockerfile, `.env.example`) falling out of sync with the code. v0.24.0 shipped a Docker image that crashed on start because of exactly this gap. For the full release *procedure* (versioning, CHANGELOG, tagging, CI verification) use the `release-engineer` agent — this skill is the in-the-moment check for the change you're making right now.

## While coding: does this change need a packaging-file update?

Ask this the moment you add or change one of these, not later at release time:

- **New or moved `src/` file that `server/` imports (directly or transitively)** → needs a `COPY` line in `Dockerfile`'s named `src/` list. `test/docker-runtime-files.test.ts` computes the real runtime import closure and fails with the exact lines to add — run it, don't guess.
- **New environment variable read anywhere in `server/`** → needs an entry in `.env.example` (with its default and what happens when unset), and in the README's configuration section, and in any compose file.
- **New npm script that a workflow or doc refers to** → check `.github/workflows/*.yml` and the docs that mention it.
- **New runtime dependency** → must be in `dependencies`, not `devDependencies` — the Docker image installs with `npm ci --omit=dev`.
- **New migration in `server/db.ts`** → `test/server-db.test.ts`'s version expectation needs updating, and the changelog needs a note for people running their own server.
- **New external resource/origin the client needs to reach** → is a CSP change (`server/csp.ts`), not a header to widen without scrutiny — see `astraya-security-sync-review` for the connect-src 'self' constraint this interacts with.

If any of these applies, fix the packaging file in the same change, then run `npm run check` again — don't defer it to "the release PR will catch it," because the release checklist below only re-verifies against the state at tag time, not against every intermediate PR.

## The release-shipped-files-check skill covers the mechanical diff

Use the existing `release-shipped-files-check` skill for the actual Dockerfile/`.dockerignore`/`.env.example`/package.json/CI-workflow comparison recipe — don't re-derive it here. This skill's job is to flag *when* that check matters (every PR that touches the packaging surface, not just release day) and to name the parts of the release-engineer agent's checklist that aren't purely about shipped files.

## The parts of the full release sequence that aren't "shipped files"

The `release-engineer` agent owns the end-to-end procedure; the pieces worth knowing before you're mid-release:

1. **Versioning is milestone-driven** (`docs/RELEASING.md`'s M0–M9 → v0.1.0–v1.0.0 table), not calendar- or commit-count-driven. A milestone landing is a minor bump; work in between is a patch — check which applies before assuming "patch."
2. **Four files, every release**: `package.json` (`version`), `package-lock.json` (**two** occurrences — top-level and `packages[""].version`, anchor by context not line count), `CHANGELOG.md` (seeded by `npm run changelog:draft`, then hand-reviewed — the script drops chore/test/ci/build commits and needs a human ruling on style/revert commits), `README.md` (the badge **and** the `## Status` section's hard-coded version string in prose — routinely forgotten because nothing else names it).
3. **`npm run docker:smoke` must pass before the tag is pushed**, not after. If Docker isn't running, stop — don't tag without it.
4. **The tag triggers three separate workflows** (`release.yml`, `docker.yml`, `pages.yml`) — confirm all three went green for that tag, not just the first one.
5. **If an image was ever pushed** (even one that then failed its own smoke test), the version is spent — don't move the tag; bump the patch and release again.

## Verifying CI without polling

Release workflows take minutes across three jobs — use a scheduled wakeup rather than polling `gh run list` in a tight loop.
