# Astraya Corpus Integrity

Use while editing `src/interpretation/corpus/en.json`/`nl.json` by hand, running anything in `tools/corpus-gen/`, or touching `server/corpus-overrides.ts`/`CorpusOverridesPanel.tsx` — not for judging whether a corpus entry's astrology is *correct* (that's the `astrologer` agent's job at review time; this skill is the workflow/mechanics guardrail while you're producing or editing corpus content).

## Never run a paid-API corpus script in automation

`tools/corpus-gen/` scripts that call Gemini, OpenAI, or astrologyapi.com cost real money per run (`generate-batch.mjs`, `evaluate-corpus-batch.mjs`, `improve-corpus-batch.mjs`, `cross-translate-composite.mjs`, `language-quality-batch.mjs`, `classical-triage-batch.mjs`, `benchmark-batch.mjs`). None of these belong in CI, in a hook, or in any script that runs unattended — `npm run corpus:audit` and the scripts under `tools/corpus-gen/` are explicitly human-invoked, API-keys-required, never-in-CI per `CLAUDE.md`. Before running any script here:

- Check `--help` first — several have a `--dry-run` (e.g. `generate-batch.mjs`) that prints the plan and first prompts with **no API call**; use it before spending money.
- The no-cost scripts (`audit-corpus.mjs`, `corpus-stats.mjs`, `apply-batch-output.mjs`, `remove-by-model.mjs`, `remove-by-tag.mjs`, `remove-same-point-variant-pairs.mjs`, `sample-degree-symbol.mjs`'s generate-sample path) are safe to run freely; everything else that calls out to a provider is not.
- `tools/` cannot be imported from `src/` (lint-enforced boundary) — a corpus-gen helper that needs to be shared with runtime code belongs in `src/interpretation/`, not the other way around.

## The schema is the one source of truth for key shape — never hand-type a key

`src/interpretation/schema.ts`'s `placementKey` derives every key from a `CorpusPlacement`; `category` is always the key's first segment (`categoryOfKey`), never a separate stored field. Before hand-editing a corpus JSON entry or writing a new corpus-gen helper:

- Don't hand-type a `key` string — construct the placement and derive the key, or the generator/lint/rule-engine will disagree about the entry's identity.
- Don't add or edit a `category` field independently — if a form or tool stores `category` as its own state instead of re-deriving it from `key`, it can drift from the key it's supposed to describe.
- **`aspect-pair` bodies are alphabetized** (`canonicalPair`, symmetric relationship); **`transit-aspect`'s `transiting`/`natal` are not interchangeable** (and may legitimately be the same body, for a return). Alphabetizing a transit-aspect's bodies, or failing to alphabetize an aspect-pair's, produces a key `validateKey` will reject — that's correct behavior, not a bug to work around.
- Numbers in a key are plain integers with category-specific meaning: `SIGN` is zero-based (0 = Aries), `HOUSE` is one-based (1–12) — the same digit means something different depending on which category it's in. Don't assume one convention applies everywhere in a key.

## `anchor: true` entries need provenance, every time

`isAcceptableAnchorProvenance` in `schema.ts` requires an anchor entry's provenance to be either `hand-written`, or `generated` **and** reviewed (`reviewedBy` and `reviewedAt` both set). A new or edited anchor entry with only `generated` provenance and no review fields will fail `validateCorpusEntries` — don't hand-edit the JSON to bypass that check; get the review fields set instead.

## The lint pass is heuristic, not semantic — know what it does and doesn't catch

`src/interpretation/lint.ts`'s `lintEntry`/`lintCorpus` check length (40–1600 chars), fatalistic/absolute phrasing, medical/legal/financial claims, gendered assumptions, and repetitive openings across the corpus — all keyword/length heuristics, deterministic and CI-cheap by design. They will catch a badly-*phrased* entry; they will **not** catch an astrologically *wrong* one (a "square" entry written in a trine's easy-flow language passes lint cleanly). Run `lintEntry`/`lintCorpus` on anything you add or edit, but don't treat a lint pass as astrological sign-off — that's still a human (or the `astrologer` agent) call.

## Admin overrides run lint, not full schema validation — know the gap

`server/corpus-overrides-routes.ts` calls `lintEntry` before `upsertCorpusOverride` (#353/#354), so an admin's hand-written replacement paragraph gets the same tone/length/claim checks a generator entry gets. It does **not** run `validateKey`/`validateCorpusEntries` — a key-shape or schema error in an admin edit is not caught the way a generator entry's is. If you're changing the override save path, don't assume lint coverage means schema coverage too; that gap is still open.

## Cross-reference, don't duplicate

Whether a specific entry's astrology is *correct* for the placement it names (dignity-state language matching the actual dignity, a timing-technique entry naming its convention) is the `astrologer` agent's review-time job — this skill only covers producing/editing corpus content safely and cheaply. For running `tools/corpus-gen/` scripts, check `tools/corpus-gen/MAP.md` for which script does what before reaching for one from memory.
