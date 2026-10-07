# tools/mcp/ — file map

MCP (Model Context Protocol) servers that expose parts of Astraya's own build-time tooling as
callable tools for an agent session, rather than one-off scripts a human runs by hand.

## Modules

### `mcp-linter.mjs`
**Domain purpose:** Lets an agent drafting interpretation-corpus text validate it against Astraya's own enforced rules *before* writing it, instead of a human catching a violation after the fact in a diff. **Responsibility:** Runs an MCP server (`astraya-linter`, stdio transport) exposing three tools — `lint_corpus_entry` (schema + tone/style), `validate_corpus_key` (schema-only), and `check_locale_parity` (en/nl key-set parity for a given set of keys). **Key dependencies:** `@modelcontextprotocol/sdk`; re-exports rules directly from `src/interpretation/lint.ts` and `src/interpretation/schema.ts` rather than reimplementing them (never hardcodes a phrase list, length bound, or key shape a second time).
