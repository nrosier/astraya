# sources.json record format

`processed/sources.json` (local, gitignored) is a JSON array with one record per source. Fields:

- `id` — Stable slug for the source, also the base name of its processed files.
- `title` — Title of the work.
- `author` — Author, editor or translator as cited.
- `year` — Year of the edition used.
- `edition` — Edition or translation description.
- `licence` — Licence or public-domain status of the work.
- `access_route` — Where the original was obtained or can be re-fetched.
- `original_name` — File name of the original as received.
- `processed_path` — Path of the original under `processed/originals/`, or null when missing.
- `sha256` — Hash of the original file.
- `text_path` — Path of the extracted text under `processed/text/`.
- `pages_path` — Path of per-page text, or null when none exists.
- `page_count` — Number of pages, or null when unknown.
- `status` — One of `extracted`, `ocr-needed`, `provisional`, `archived-record`, `missing`.
- `copyrighted` — Whether the work is under copyright; its text stays local only.
- `provisional` — Whether the record is provisional and awaiting confirmation.
- `notes` — Free-form remarks.

Values are authoritative in the file itself; this page only describes the fields.
