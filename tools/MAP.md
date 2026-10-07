# tools/ — Map (root files only)

`tools/` has no files directly in its root — only subdirectories. See each
subdirectory's own MAP.md for everything: `tools/corpus-gen/MAP.md` for the
build-time interpretation-corpus generation/audit/benchmark scripts, and
`tools/mcp/MAP.md` for the MCP servers exposing Astraya's own build-time
tooling to an agent session.

`tools/` can never be imported from `src/` (lint-enforced via
`no-restricted-imports` in `eslint.config.js`) — everything under here is
build-time-only tooling, not code that ships in the browser bundle.
