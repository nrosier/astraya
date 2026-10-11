# docs/references/ — Map

Public-domain source material for seeding the corpus, reduced to clean, parseable files. Raw OCR dumps are not kept: each source's re-fetch address is recorded in the JSON's `sources` block. Do not add a copyrighted translation.

- `derived-points.references.json` — Curated passages on the Part of Fortune and Part of Spirit from Ptolemy, Lilly, Wilson, Leo and Placidus, with source, locator and a verbatim/ocr-normalised flag per passage, plus a coverage block stating what no source supplies. Deps: `tools/corpus-gen` (#517 seeding), `docs/CORPUS_KEYS.md`.
- `placidus-primum-mobile-cooper-translation-1814-google-books.pdf` — Placidus de Titis, _Primum Mobile_, John Cooper's 1814 translation (479 pages, Google Books scan), kept only to check the three glyph-normalised Cooper passages against the page image (it has no re-fetch address). Public domain text; Google's scan terms apply to the file.

Pending source (not yet extracted): Vettius Valens, _Anthologiarum libri_, Kroll's 1908 Greek edition, archive.org `bub_gb_OQ_gAAAAMAAJ` (page-image PDF, 441 pages; its OCR text is Greek read as Latin gibberish and was discarded). Needed pages: Book II ch. 17-21 (printed pp. 79-85, PDF pages 98-104, on the Lots of Fortune and of the Daimon) and Book IV ch. 4 (printed p. 160, PDF page 179); transcribe the Greek from the page image, then translate, and flag the result as an unreviewed machine translation.
