# tools/mcp/ — Map

MCP (Model Context Protocol) servers exposing Astraya's build-time tooling as callable tools for agent sessions (not one-off human-run scripts).

- `mcp-linter.mjs` — MCP server (`astraya-linter`, stdio transport) for interpretation-corpus validation **before** writing. Three tools: `lint_corpus_entry` (schema + tone/style), `validate_corpus_key` (schema-only), `check_locale_parity` (en/nl key-set parity). Re-exports rules directly from `src/interpretation/lint.ts` and `src/interpretation/schema.ts` (never hardcodes phrase list/length/key shape twice). Deps: @modelcontextprotocol/sdk.
