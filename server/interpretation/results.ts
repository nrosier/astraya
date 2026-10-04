/**
 * Persists a Tier 2 (#360) generation's own output so a user can reopen it later without
 * regenerating — #392. `sections_json` is encrypted at rest the same way `ops.payload` is
 * (`server/ops/crypto.ts`, AES-256-GCM) — this table holds actual generated interpretation
 * prose, unlike `interpretation_usage` (migration 8), which by design never does.
 */
import { randomUUID } from 'node:crypto';
import type { Database } from '../db.ts';
import { CURRENT_KEY_VERSION, decryptPayload, encryptPayload } from '../ops/crypto.ts';
import { kindForMode, parseBasis, type ResultBasis, type ResultKind } from '../../src/interpretation/result-basis.ts';
import type { Tier2Section } from './llm-client.ts';

export interface InterpretationResultSummary {
  readonly id: string;
  readonly mode: string;
  readonly locale: string;
  readonly createdAt: string;
  /** The model's short label for the request (#423); `null` for older entries, a rejected label, or when it cannot be decrypted. */
  readonly description: string | null;
  /** Which kind of interpretation this is (#423); derived from `mode` for entries saved before kinds existed. */
  readonly kind: ResultKind | null;
  /** What it was based on; `null` for entries saved before this was recorded. */
  readonly basis: ResultBasis | null;
}

export interface InterpretationResultDetail extends InterpretationResultSummary {
  readonly sections: readonly Tier2Section[];
}

/** Encrypts and stores one generation's sections. `key` is the caller's already-loaded `ASTRAYA_ENCRYPTION_KEY` — never called when that's unset (see `interpretation-routes.ts`). */
export function saveInterpretationResult(
  db: Database,
  params: {
    readonly userId: string;
    readonly mode: string;
    readonly locale: string;
    readonly sections: readonly Tier2Section[];
    /** Already validated (`sanitizeDescription`); stored encrypted, like the prose, since it summarises the reader's own instruction. */
    readonly description?: string | null;
    /** What it was based on (#423), built by the route from the validated request. */
    readonly basis?: ResultBasis;
  },
  key: Buffer,
): string {
  const id = randomUUID();
  const plaintext = Buffer.from(JSON.stringify(params.sections), 'utf8');
  const { ciphertext, iv } = encryptPayload(plaintext, key);
  const description =
    params.description === undefined || params.description === null
      ? undefined
      : encryptPayload(Buffer.from(params.description, 'utf8'), key);
  db.prepare(
    'INSERT INTO interpretation_results (id, user_id, mode, locale, sections_json, key_version, iv, created_at, description_json, description_iv, kind, basis_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    params.userId,
    params.mode,
    params.locale,
    ciphertext,
    CURRENT_KEY_VERSION,
    iv,
    new Date().toISOString(),
    description?.ciphertext ?? null,
    description?.iv ?? null,
    params.basis?.kind ?? kindForMode(params.mode) ?? null,
    params.basis === undefined ? null : JSON.stringify(params.basis),
  );
  return id;
}

interface SummaryRow {
  readonly id: string;
  readonly mode: string;
  readonly locale: string;
  readonly created_at: string;
  readonly description_json: Buffer | null;
  readonly description_iv: Buffer | null;
  readonly kind: string | null;
  readonly basis_json: string | null;
}

/** The kind and basis a row reports: the stored ones, or — for an older row — the kind its `mode` implies and no basis. */
function readBasis(row: SummaryRow): { readonly kind: ResultKind | null; readonly basis: ResultBasis | null } {
  const basis = parseBasis(row.basis_json) ?? null;
  return { kind: basis?.kind ?? kindForMode(row.mode) ?? null, basis };
}

/** The stored label, or `null` when there is none or it cannot be read (no key, a rotated key, a tampered row) — never an error: a label is a convenience, not the entry. */
function readDescription(row: SummaryRow, key: Buffer | undefined): string | null {
  if (key === undefined || row.description_json === null || row.description_iv === null) return null;
  try {
    return decryptPayload(row.description_json, row.description_iv, key).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Metadata, newest first. The prose is never decrypted here, so this works even if the server's key
 * has since been rotated away (#340) or removed; the short descriptions (#423) are read when `key`
 * can decrypt them and are `null` otherwise, which only costs the label.
 */
export function listInterpretationResults(
  db: Database,
  userId: string,
  key?: Buffer,
): readonly InterpretationResultSummary[] {
  const rows = db
    .prepare(
      'SELECT id, mode, locale, created_at, description_json, description_iv, kind, basis_json FROM interpretation_results WHERE user_id = ? ORDER BY created_at DESC',
    )
    .all(userId) as unknown as SummaryRow[];
  return rows.map((row) => ({
    id: row.id,
    mode: row.mode,
    locale: row.locale,
    createdAt: row.created_at,
    description: readDescription(row, key),
    ...readBasis(row),
  }));
}

interface DetailRow extends SummaryRow {
  readonly sections_json: Buffer;
  readonly iv: Buffer;
}

/** `undefined` when no such result exists for this user (never leaks whether it exists for a *different* user — the query itself is scoped to `userId`). Throws if decryption fails (a tampered row, or `key` doesn't match what encrypted it) — the same fail-closed behavior `decryptPayload` already guarantees for `ops.payload`. */
export function getInterpretationResult(
  db: Database,
  userId: string,
  id: string,
  key: Buffer,
): InterpretationResultDetail | undefined {
  const row = db
    .prepare(
      'SELECT id, mode, locale, sections_json, iv, created_at, description_json, description_iv, kind, basis_json FROM interpretation_results WHERE user_id = ? AND id = ?',
    )
    .get(userId, id) as DetailRow | undefined;
  if (row === undefined) return undefined;
  const plaintext = decryptPayload(row.sections_json, row.iv, key);
  const sections = JSON.parse(plaintext.toString('utf8')) as readonly Tier2Section[];
  return {
    id: row.id,
    mode: row.mode,
    locale: row.locale,
    createdAt: row.created_at,
    description: readDescription(row, key),
    ...readBasis(row),
    sections,
  };
}
