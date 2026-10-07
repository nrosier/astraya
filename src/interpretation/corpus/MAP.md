# src/interpretation/corpus — Map

The committed interpretation corpus: prose text per placement, per locale, drafted by an
LLM at build time (via `tools/corpus-gen/`, a sibling top-level directory) and committed
as data. The shipped app's runtime loads this committed data; it makes no model API calls
of its own except for the explicit, opt-in Tier 2 "AI-customised" interpretation (see
`../tier2-client.ts`).

**Note on this listing:** the three files below are mid-regeneration by another process.
Per explicit instruction for this pass, their contents were NOT opened, read, or modified
— only their filenames (from `ls`) and extensions were used to write the one-line
descriptions below.

### `en.json`

Committed English-locale interpretation corpus data — build-time generated prose entries
keyed by placement, loaded by `../index.ts`/`../corpus-client.ts`. Do not inspect or edit
as part of this pass; it is mid-regeneration.

### `nl.json`

Committed Dutch-locale interpretation corpus data — build-time generated prose entries
keyed by placement, loaded by `../index.ts`/`../corpus-client.ts`. Do not inspect or edit
as part of this pass; it is mid-regeneration.
