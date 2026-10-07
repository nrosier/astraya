# tools/ — Map

No root files (subdirectories only). See each subdirectory's own MAP.md:

- **tools/corpus-gen/** — Build-time interpretation-corpus generation/audit/benchmark scripts (18 scripts + shared lib). Regenerates `src/interpretation/corpus/en.json` and `nl.json`. Costs real API money.
- **tools/mcp/** — MCP (Model Context Protocol) servers exposing Astraya's build-time tooling as callable tools for agent sessions.

**Import boundary:** `tools/` can never be imported from `src/` (lint-enforced). Everything here is build-time-only; shipping a build-time LLM client in the browser bundle is a critical error.
