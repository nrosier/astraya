# docs/references/ — Map

Reference archive for the astrology corpus. Copyrighted extracted text stays local and is never committed; only the index, format docs, JSON data files and `sources.json` are tracked (#864).

- `MAP.md` — This index. Deps: none.
- `SCHEMA.md` — Record format of `sources.json`: fields, id convention, status values. Deps: `sources.json`, `test/docs-references-integrity.test.ts`.
- `orb-conventions.references.json` — Lilly's 1647 orb table, combustion bands, fortitudes and horary considerations with locators (#590). Deps: `src/astrology/orb-profiles.ts`, `test/astrology-cited-orb-presets.test.ts`.
- `derived-points.references.json` — Curated Part of Fortune and Part of Spirit passages with source and locator (#517). Deps: `tools/corpus-gen/classical-texts/derived-point.rules.json`, `test/docs-references.test.ts`.
- `aaf-chunks.references.json` — AAF'97 chunk and field grammar with section numbers (#591). Deps: `src/domain/aaf.ts`.
- `sources.json` — Tracked citation index of 45 source records (metadata, sha256, status; no copyrighted text). Placidus, Valens, the Yemen verification CSV and Lilly book 2 are status `missing` and are never reconstructed. Deps: `test/docs-references-integrity.test.ts`.
- `sources/` — Local, gitignored originals in `pdf/`, `apa/` and `ocr/`; exists only on the Mac checkout holding the sources. Deps: `sources.json`.
- `text/` — Local, gitignored extracted text (`.txt` and `.pages.tsv` per source); exists only on the Mac checkout holding the sources. Deps: `sources.json`.
- `new/` — Local, gitignored intake folder for documents awaiting processing; exists only on the Mac checkout holding the sources.
- `processed/` — Local, gitignored folder for originals already processed; exists only on the Mac checkout holding the sources. Deps: `sources.json`.
- `ORB_SOURCES.md` — Not present; dropped.
