/**
 * Admin corrections to committed interpretation-corpus entries (#292):
 * CRUD against the `corpus_overrides` table (`server/db.ts` migration 5).
 *
 * Only `import type` from `src/interpretation/schema.ts` here, never a value
 * import: the server runs as raw TypeScript under Node's native type
 * stripping with no build step (`tsconfig.server.json`'s own comment), which
 * resolves import specifiers literally. `schema.ts` itself imports
 * `bodyByKey` etc. from `'../astrology/bodies.js'` — a `.js`-suffixed
 * specifier that only resolves under a bundler (Vite/tsc), not under plain
 * Node — so a *value* import of `schema.ts` would type-check but crash the
 * running server at startup. A type-only import is erased entirely and never
 * hits runtime module resolution, so it's safe.
 *
 * The literal unions below mirror `schema.ts`'s real
 * `CORPUS_LOCALES`/`CORPUS_TIERS`/`CORPUS_CATEGORIES` exports and are
 * duplicated rather than imported, for the same reason.
 * `test/server-corpus-overrides.test.ts` asserts these arrays stay in
 * sync with `schema.ts`'s real exports.
 */
import { randomUUID } from 'node:crypto';
import type { Database } from './db.ts';
import type { CorpusEntry, CorpusProvenance } from '../src/interpretation/schema.ts';

export const LOCALES = ['en', 'nl'] as const;
export type Locale = (typeof LOCALES)[number];

export const TIERS = ['core', 'notable', 'nuance'] as const;
export type CorpusTier = (typeof TIERS)[number];

export const CORPUS_CATEGORIES = [
  'planet-in-sign',
  'planet-in-house',
  'sign-on-cusp',
  'aspect-pair',
  'transit-aspect',
  'synastry-aspect',
  'dignity-state',
  'nakshatra',
  'pattern',
  'profected-house',
  'astro-line',
  'composite-planet-in-sign',
  'composite-planet-in-house',
  'composite-aspect-pair',
] as const;
export type CorpusCategory = (typeof CORPUS_CATEGORIES)[number];

export interface CorpusOverride {
  readonly id: string;
  readonly key: string;
  readonly locale: Locale;
  readonly text: string;
  readonly tier: CorpusTier;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly updatedByUserId: string;
  readonly updatedByUsername: string;
}

interface CorpusOverrideRow {
  readonly id: string;
  readonly key: string;
  readonly locale: string;
  readonly text: string;
  readonly tier: string;
  readonly tags: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly updated_by: string;
  readonly updated_by_username: string;
}

function toCorpusOverride(row: CorpusOverrideRow): CorpusOverride {
  return {
    id: row.id,
    key: row.key,
    locale: row.locale as Locale,
    text: row.text,
    tier: row.tier as CorpusTier,
    tags: JSON.parse(row.tags) as readonly string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by,
    updatedByUsername: row.updated_by_username,
  };
}

/**
 * Materializes an override as the `CorpusEntry` shape the client merge and the export both
 * need. `reviewedBy` is a real admin login username — fine to expose to another admin via the
 * `requireAdmin`-gated export, but the public, unauthenticated route (#353) must not hand out
 * admin usernames for anyone who has ever corrected a public-facing chart term, so that route
 * passes `includeReviewer: false`.
 */
export function toCorpusEntry(
  override: CorpusOverride,
  options: { readonly includeReviewer?: boolean } = {},
): CorpusEntry {
  const { includeReviewer = true } = options;
  const provenance: CorpusProvenance = {
    source: 'hand-written',
    ...(includeReviewer ? { reviewedBy: override.updatedByUsername } : {}),
    reviewedAt: override.updatedAt,
  };
  return {
    key: override.key,
    locale: override.locale,
    text: override.text,
    tier: override.tier,
    tags: override.tags,
    provenance,
  };
}

const SELECT_WITH_USERNAME = `
  SELECT corpus_overrides.*, users.username AS updated_by_username
  FROM corpus_overrides JOIN users ON users.id = corpus_overrides.updated_by
`;

export function listCorpusOverrides(db: Database, locale?: Locale): readonly CorpusOverride[] {
  const rows = db
    .prepare(
      `${SELECT_WITH_USERNAME} WHERE (?1 IS NULL OR corpus_overrides.locale = ?1) ORDER BY corpus_overrides.updated_at DESC`,
    )
    .all(locale ?? null) as unknown as CorpusOverrideRow[];
  return rows.map(toCorpusOverride);
}

export interface UpsertCorpusOverrideParams {
  readonly key: string;
  readonly locale: Locale;
  readonly text: string;
  readonly tier: CorpusTier;
  readonly tags: readonly string[];
  readonly updatedByUserId: string;
}

export function upsertCorpusOverride(db: Database, params: UpsertCorpusOverrideParams): CorpusOverride {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO corpus_overrides (id, key, locale, text, tier, tags, created_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key, locale) DO UPDATE SET
       text = excluded.text, tier = excluded.tier, tags = excluded.tags,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run(
    id,
    params.key,
    params.locale,
    params.text,
    params.tier,
    JSON.stringify(params.tags),
    now,
    now,
    params.updatedByUserId,
  );

  const row = db
    .prepare(`${SELECT_WITH_USERNAME} WHERE corpus_overrides.key = ? AND corpus_overrides.locale = ? `)
    .get(params.key, params.locale) as unknown as CorpusOverrideRow;
  return toCorpusOverride(row);
}

/** Reverts to the committed corpus text. Returns `true` if a row was deleted. */
export function deleteCorpusOverride(db: Database, id: string): boolean {
  const result = db.prepare('DELETE FROM corpus_overrides WHERE id = ?').run(id);
  return result.changes > 0;
}
