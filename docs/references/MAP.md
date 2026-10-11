# docs/references/ — Map

Public-domain source material for seeding the corpus, reduced to clean, parseable files. Raw OCR dumps are not kept: each source's re-fetch address is recorded in the JSON's `sources` block. Do not add a copyrighted translation.

- `derived-points.references.json` — Curated passages on the Part of Fortune and Part of Spirit from Ptolemy, Lilly, Wilson, Leo and Placidus, with source, locator and a verbatim/ocr-normalised flag per passage, plus a coverage block stating what no source supplies. Deps: `tools/corpus-gen` (#517 seeding), `docs/CORPUS_KEYS.md`.
- `placidus-primum-mobile-cooper-translation-1814-google-books.pdf` — Placidus de Titis, _Primum Mobile_, John Cooper's 1814 translation (479 pages, Google Books scan), kept only to check the three glyph-normalised Cooper passages against the page image (it has no re-fetch address). Public domain text; Google's scan terms apply to the file.
