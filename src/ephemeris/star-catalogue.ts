/**
 * @module ephemeris/star-catalogue
 * @purpose Parses the shipped Swiss Ephemeris star file (`sefstars.txt`) into naming records, searches them by name or designation, and hashes the file bytes for the "source-file version" stored with a chosen star (#803).
 * @conventions Pure and engine-free: it reads text and bytes handed to it and never imports `sweph-wasm`, so positions still go through `EphemerisProvider`. Line format is the one documented in the header of Astrodienst's own file, https://github.com/aloistr/swisseph/blob/master/ephe/sefstars.txt (see also the `swe_fixstar2` section of https://www.astro.com/swisseph/swephprg.htm): comma-separated `traditional name, nomenclature name, equinox, RA h/m/s, Dec d/m/s, pm RA, pm Dec, radial velocity, parallax, magnitude V` with two optional trailing DM fields; `#` starts a comment, including after a record. Names are naming data only; no interpretive text is carried. Search results are capped at `STAR_SEARCH_LIMIT`. SHA-256 uses Web Crypto so it runs in the browser and in Node.
 * @exports StarCatalogueEntry, StarLineRejection, ParsedStarCatalogue, StarSearchResult, STAR_SEARCH_LIMIT, USER_STAR_CONJUNCTION_ORB_DEGREES, parseStarCatalogueLine, parseStarCatalogue, searchStarCatalogue, swissStarId, sha256Hex
 */

/** Maximum number of results `searchStarCatalogue` returns. */
export const STAR_SEARCH_LIMIT = 50;

/**
 * Conjunction orb, in degrees, for stars a user picks from the catalogue (D-803d).
 * This is the Astraya convention and is UNCITED: no source is claimed for 1.0.
 */
export const USER_STAR_CONJUNCTION_ORB_DEGREES = 1.0;

/** One star record: the two name fields of a sefstars.txt line plus its magnitude. */
export interface StarCatalogueEntry {
  /** Traditional name; empty when the record only has a nomenclature name. */
  readonly name: string;
  /** Nomenclature name (Bayer/Flamsteed style designation, e.g. `alLeo`). */
  readonly designation: string;
  readonly equinox: string;
  readonly magnitude: number;
}

export interface StarLineRejection {
  /** 1-based line number within the text. */
  readonly line: number;
  readonly text: string;
  readonly reason: string;
}

export interface ParsedStarCatalogue {
  readonly entries: readonly StarCatalogueEntry[];
  readonly rejected: readonly StarLineRejection[];
}

/** Name, designation and magnitude only (the picker shows magnitude); no interpretive text. */
export interface StarSearchResult {
  readonly name: string;
  readonly designation: string;
  readonly magnitude: StarCatalogueEntry['magnitude'];
}

const MIN_FIELDS = 14;
const MAX_FIELDS = 16;
const EQUINOXES: ReadonlySet<string> = new Set(['1950', '2000', 'ICRS']);
const NUMERIC_FIELDS_FROM = 3;
const NUMERIC_FIELDS_TO = 14;
const MAGNITUDE_FIELD = 13;

/**
 * Parse one non-comment line. Returns the entry, or a string reason when the
 * line is malformed. Callers skip blank and comment lines before this.
 */
export function parseStarCatalogueLine(line: string): StarCatalogueEntry | string {
  const hash = line.indexOf('#');
  const body = (hash >= 0 ? line.slice(0, hash) : line).trim();
  if (body === '') return 'empty record';
  const fields = body.split(',').map((f) => f.trim());
  if (fields.length < MIN_FIELDS || fields.length > MAX_FIELDS) {
    return `expected ${String(MIN_FIELDS)}-${String(MAX_FIELDS)} fields, found ${String(fields.length)}`;
  }
  const name = fields[0] ?? '';
  const designation = fields[1] ?? '';
  const equinox = fields[2] ?? '';
  if (name === '' && designation === '') return 'no name or designation';
  if (!EQUINOXES.has(equinox)) return `equinox must be 1950, 2000 or ICRS, found "${equinox}"`;
  for (let i = NUMERIC_FIELDS_FROM; i < NUMERIC_FIELDS_TO; i++) {
    const f = fields[i] ?? '';
    if (f === '' || !Number.isFinite(Number(f))) return `field ${String(i + 1)} is not a number: "${f}"`;
  }
  return { name, designation, equinox, magnitude: Number(fields[MAGNITUDE_FIELD]) };
}

/**
 * Parse a whole file. Blank and `#` comment lines are skipped; bad lines are reported, not thrown.
 * The file repeats some stars under separate records, so records with the same
 * trimmed name and designation are merged: the first record's fields are kept.
 */
export function parseStarCatalogue(text: string): ParsedStarCatalogue {
  const entries: StarCatalogueEntry[] = [];
  const rejected: StarLineRejection[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (const [i, raw] of lines.entries()) {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const result = parseStarCatalogueLine(raw);
    if (typeof result === 'string') rejected.push({ line: i + 1, text: raw, reason: result });
    else {
      const key = `${result.name}\u0000${result.designation}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(result);
    }
  }
  return { entries, rejected };
}

/**
 * Case-insensitive substring search over name and designation. The file lists
 * `parseStarCatalogue` already merges repeated records. At most
 * `STAR_SEARCH_LIMIT` results; an empty query returns none.
 */
export function searchStarCatalogue(entries: readonly StarCatalogueEntry[], query: string): StarSearchResult[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const out: StarSearchResult[] = [];
  for (const e of entries) {
    if (!e.name.toLowerCase().includes(q) && !e.designation.toLowerCase().includes(q)) continue;
    out.push({ name: e.name, designation: e.designation, magnitude: e.magnitude });
    if (out.length >= STAR_SEARCH_LIMIT) break;
  }
  return out;
}

/**
 * The identifier Swiss Ephemeris accepts for this star: the traditional name,
 * or `,designation` when there is none (swe_fixstar2 documentation).
 */
export function swissStarId(star: StarSearchResult): string {
  return star.name !== '' ? star.name : `,${star.designation}`;
}

/** Lowercase hex SHA-256 of the given bytes: the source-file version (D-803c). */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
