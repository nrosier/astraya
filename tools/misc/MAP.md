# tools/misc/ — Map

Standalone one-off build-time scripts that don't belong to a bigger pipeline (unlike `tools/corpus-gen/`). Each is self-contained — no shared `lib/`, no dependency on another subdirectory under `tools/`.

- `generate-astrology-glossary.mjs` — One-off drafting aid for #456: asks Gemini for a markdown bullet list of astrology terms/definitions, as a first draft for the app's glossary tooltip content. Never writes to shipped app data. Calls Gemini.
