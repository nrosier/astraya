# sources.json record format

Layout (2026-11-05, #864): the real layout is `docs/references/sources/` (original PDFs in `pdf/`, `apa/`, `ocr/`), `text/` (extracted text), `new/` (documents awaiting processing) and `processed/`. There is no `docs/references/originals/` directory.

`docs/references/sources.json` is a JSON array with one record per source. Owner decision 2026-11-07: `sources.json` is tracked by git. It holds citation metadata, status, sha256, and access route only, with no copyrighted text. Extracted text stays local under `docs/references/text/`. Fields:

- `id` — Stable slug for the source, also the base name of its processed files. Convention: `<surname>-<short-title>-<year>`, lowercase kebab-case, with `undated` as the year fallback. Pattern: `^[a-z0-9]+(-[a-z0-9]+)*-(\d{4}|undated)$`. Ids that do not match (currently `unidentified-1`, `unidentified-2`, `unidentified-3`) are provisional: they carry `provisional: true` and are renamed once the source is identified. Renaming is Mac-only work.
- `title` — Title of the work.
- `author` — Author, editor or translator as cited.
- `year` — Year of the edition used.
- `edition` — Edition or translation description.
- `licence` — Licence or public-domain status of the work.
- `access_route` — Where the original was obtained or can be re-fetched.
- `original_name` — File name of the original as received.
- `processed_path` — Repo-root-relative path of the original under `docs/references/sources/` (`pdf/`, `apa/` or `ocr/`) when kept, or null when missing.
- `sha256` — Hash of the original file.
- `text_path` — Repo-root-relative path of the extracted text under `docs/references/text/`.
- `pages_path` — Path of per-page text, or null when none exists.
- `page_count` — Number of pages, or null when unknown.
- `status` — One of `extracted`, `ocr-needed`, `provisional`, `archived-record`, `missing`. `missing` marks a record whose file is absent, with null `processed_path` and `sha256`. The Placidus PDF, Valens PDF and Yemen verification CSV are recorded as `missing` and are never reconstructed.
- `copyrighted` — Whether the work is under copyright; its text stays local only.
- `provisional` — Whether the record is provisional and awaiting confirmation.
- `used_by` — Array of repo-root-relative paths of the code, test or doc that reads the source.
- `notes` — Free-form remarks.

Values are authoritative in the file itself; this page only describes the fields.
