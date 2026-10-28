# docs/references/ — Map

Local reference archive for the astrology corpus; not published (per owner, nothing from the source material is pushed to GitHub).

- `MAP.md` — This index. Deps: none.
- `ORB_SOURCES.md` — What has been checked for each orb value (#590): Astraya defaults versus cited. Deps: `src/astrology/orb-profiles.ts`, `orb-conventions.references.json`.
- `orb-conventions.references.json` — Lilly's 1647 orb table, combustion bands, fortitudes and horary considerations, with page and scan locators (#590). Deps: `src/astrology/orb-profiles.ts`, `test/astrology-cited-orb-presets.test.ts`.
- `derived-points.references.json` — Curated Part of Fortune and Part of Spirit passages with source, locator and verbatim flag (#517). Deps: `tools/corpus-gen/classical-texts/derived-point.rules.json`, `test/docs-references.test.ts`.
- `aaf-chunks.references.json` — AAF'97 chunk and field grammar with section numbers (#591). Deps: `src/domain/aaf.ts`.
- `sources.json` — Index of 45 source records (licence, original name, processed, text and pages paths, status). Known discrepancy: 124 path values use the old `docs/references/processed/...` prefix and do not resolve on disk.
- `text/` — Extracted text per source: a `.txt` and a `.pages.tsv` for each of 41 sources (82 files). Deps: `sources.json`.
- `sources/pdf/` — 10 original book and scan PDFs (7 named, 3 `unidentified-*`). Deps: `sources.json`.
- `sources/apa/` — 20 article PDFs (Huber, Hopewell, Konig and others). Deps: `sources.json`.
- `sources/ocr/` — 11 OCR text files (Bonatti Liber Astronomiae translations and introduction, Lilly Christian Astrology). Deps: `sources.json`.
- `new/` — Empty folder for new reference documents that still need processing.
- `processed/` — Holds only original files that have been processed; currently empty, the originals listed in `sources.json` are not on disk.

Git state: everything in `docs/references/` is gitignored except `MAP.md` and `SCHEMA.md`, per the `docs/references/*` rule in `.gitignore`. Nothing else here is pushed to GitHub. The `ORB_SOURCES.md` and `*.references.json` files above are local copies, untracked as of this change, so they will not appear on `main`. Code and tests that read them run only on a machine that has these local files.
