# docs/references/ — Map

Tracked index of source citations. Source texts and originals live in the local, gitignored `processed/` (see `processed/MAP.md`); copyrighted text is never committed.

- `MAP.md` — This index. Deps: `processed/MAP.md`.
- `SCHEMA.md` — Record format of `processed/sources.json`. Deps: `processed/sources.json`.
- `orb-sources.md` — What has been checked for each orb value (#590): Astraya defaults versus cited. Deps: `src/astrology/orb-profiles.ts`, `topics/orb-conventions.json`.
- `topics/orb-conventions.json` — Lilly's 1647 orb table, combustion bands, fortitudes and horary considerations, with page and scan locators (#590). Deps: `src/astrology/orb-profiles.ts`, `test/astrology-cited-orb-presets.test.ts`.
- `topics/derived-points.json` — Curated Part of Fortune and Part of Spirit passages with source, locator and verbatim flag (#517). Deps: `tools/corpus-gen/classical-texts/derived-point.rules.json`, `test/docs-references.test.ts`.
- `topics/aaf-chunks.json` — AAF'97 chunk and field grammar with section numbers (#591). Deps: `src/domain/aaf.ts`.

The Placidus _Primum Mobile_ (Cooper, 1814) scan is no longer kept here; it is recorded as missing in `processed/sources.json`.
