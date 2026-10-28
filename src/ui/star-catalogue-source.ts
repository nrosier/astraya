/**
 * @module ui/star-catalogue-source
 * @purpose Loads the shipped `sefstars.txt` for the fixed-star picker (#803): fetched same-origin from the ephemeris asset path, parsed into naming records and hashed (SHA-256) for the source-file version stored with each chosen star.
 * @conventions The file is fetched once per page and the promise is cached; a failed load is not cached, so reopening the drawer tries again. Same-origin only (`EPHE_BASE_URL`), as the CSP requires. Positions never come from here: the chart asks `EphemerisProvider.fixedStar` for them.
 * @exports LoadedStarCatalogue, loadStarCatalogue
 */
import { EPHE_BASE_URL, FIXED_STARS_ASSET } from '../ephemeris/assets.js';
import { parseStarCatalogue, sha256Hex, type StarCatalogueEntry } from '../ephemeris/star-catalogue.js';

/** The parsed catalogue and the version (hash) of the file it came from. */
export interface LoadedStarCatalogue {
  readonly entries: readonly StarCatalogueEntry[];
  /** Lowercase hex SHA-256 of the file's bytes (D-803c). */
  readonly sha256: string;
}

let cached: Promise<LoadedStarCatalogue> | undefined;

async function fetchCatalogue(): Promise<LoadedStarCatalogue> {
  const response = await fetch(`${EPHE_BASE_URL}${FIXED_STARS_ASSET.file}`);
  if (!response.ok) throw new Error(`${FIXED_STARS_ASSET.file}: HTTP ${String(response.status)}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const { entries } = parseStarCatalogue(new TextDecoder().decode(bytes));
  return { entries, sha256: await sha256Hex(bytes) };
}

/** The shipped catalogue, loaded on first use. */
export function loadStarCatalogue(): Promise<LoadedStarCatalogue> {
  cached ??= fetchCatalogue().catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
