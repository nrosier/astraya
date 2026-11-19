/**
 * Re-encrypt every stored operation, every saved interpretation result, every TOTP secret and
 * the TOTP recovery-code pepper under a new `ASTRAYA_ENCRYPTION_KEY` (#340, #1680, #1500).
 *
 *   ASTRAYA_DB_PATH=./data/astraya.db \
 *   ASTRAYA_ENCRYPTION_KEY=<the key in use now> \
 *   ASTRAYA_NEW_ENCRYPTION_KEY=<the replacement> \
 *     node server/ops/rotate-key.ts
 *
 * Without this, a leaked `ASTRAYA_ENCRYPTION_KEY` had no remediation short of hand-written
 * SQL: the key is not derived from anything and every row's ciphertext depends on it, so
 * changing the environment variable alone makes the whole log undecryptable.
 *
 * **What rotates is the key material, not `CURRENT_KEY_VERSION`.** That column records
 * which *scheme* a row was encrypted under (see `crypto.ts`), and AES-256-GCM with a
 * per-row IV is still the scheme afterwards — bumping it would claim a format change that
 * did not happen, and would make a future real scheme change unable to tell the two apart.
 *
 * Runs with the server stopped. Not exposed as an admin route on purpose: it holds both
 * keys and rewrites every row, which is an operator action with shell access, not something
 * that should be reachable with a session cookie.
 */

/**
 * @module rotate-key
 * @purpose Operator CLI script to re-encrypt everything stored under `ASTRAYA_ENCRYPTION_KEY` (every `ops` row, every saved interpretation result's sections and label, #1680, and every TOTP secret plus the `server_secrets` recovery-code pepper, #1500) under a replacement key, the remediation path for a leaked key.
 * @conventions Not exposed as an admin HTTP route on purpose — it holds both the old and new key and rewrites every row, which belongs to an operator with shell/container access, not a session cookie. Rotates the key material only, never `CURRENT_KEY_VERSION` (the encryption scheme itself, AES-256-GCM, is unchanged); re-encryption of every table runs in one transaction, failing before writing anything if any row (an op, a result's sections or its label, a TOTP secret under its per-user subkey, a server secret) does not decrypt under the stated current key, so a wrong key never produces a half-rotated database. Every re-encrypted value gets a fresh IV.
 * @exports RotationResult, rotateEncryptionKey
 */
import { resolve } from 'node:path';
import { planTotpRotation } from '../auth/totp-store.ts';
import { openDatabase, type Database } from '../db.ts';
import { decryptPayload, encryptPayload } from './crypto.ts';

interface EncryptedRow {
  readonly seq: number;
  readonly payload: Buffer;
  readonly iv: Buffer | null;
}

/** A saved Tier 2 result (#1680): its sections always encrypted, its label (description) encrypted when there is one. */
interface ResultRow {
  readonly id: string;
  readonly sections_json: Buffer;
  readonly iv: Buffer;
  readonly description_json: Buffer | null;
  readonly description_iv: Buffer | null;
}

export interface RotationResult {
  readonly rotated: number;
  /** Rows with a null `iv` — written before at-rest encryption existed, so there is nothing to re-key. */
  readonly plaintext: number;
  /** Saved interpretation results re-encrypted (#1680): their sections, and their label when they have one. */
  readonly interpretationResults: number;
  /** Users whose TOTP secret (#1500) was re-wrapped under their per-user subkey of the new key. */
  readonly totpSecrets: number;
  /** `server_secrets` rows (the TOTP recovery-code pepper, #1500) re-wrapped under the new key. */
  readonly serverSecrets: number;
}

/** Decrypts under the current key, or throws naming the row, before anything has been written. */
function decryptForRotation(what: string, ciphertext: Buffer, iv: Buffer, currentKey: Buffer): Buffer {
  try {
    return decryptPayload(ciphertext, iv, currentKey);
  } catch (error) {
    throw new Error(
      `${what} does not decrypt under the current key, so nothing was rotated. ` +
        'Check ASTRAYA_ENCRYPTION_KEY against the key the server is running with.',
      { cause: error },
    );
  }
}

/**
 * Re-encrypt in one transaction, taken with `BEGIN IMMEDIATE` before the first read.
 *
 * All or nothing matters more here than anywhere else in this codebase: a partial rotation
 * leaves a database in which neither key decrypts every row, and there is no key version
 * distinguishing them, so recovery would mean trial-decrypting row by row. A fresh IV per
 * row rather than the stored one, because reusing an IV across two keys is safe but
 * reusing it across two *encryptions* is the one mistake GCM does not forgive, and a
 * future edit to this function must not be one step away from it.
 *
 * Throws on the first row that will not decrypt under `currentKey`, before writing
 * anything — a wrong "current" key must fail as a wrong key, not as a half-rotated log.
 * That includes a result's label: the reader never sees an unreadable label as an error
 * (`readDescription` shows none), so a rotation that skipped one would lose it silently.
 */
export function rotateEncryptionKey(db: Database, currentKey: Buffer, newKey: Buffer): RotationResult {
  // IMMEDIATE takes the write lock before the first read (#1680 review): a server still running on this file
  // cannot save a row under the old key between the reads and the commit, which would leave a mix of keys.
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = reEncryptAll(db, currentKey, newKey);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Reads, decrypts and re-encrypts every table inside the caller's transaction; throws before any write on a wrong key. */
function reEncryptAll(db: Database, currentKey: Buffer, newKey: Buffer): RotationResult {
  const rows = db.prepare('SELECT seq, payload, iv FROM ops ORDER BY seq').all() as unknown as EncryptedRow[];

  const reEncrypted: { seq: number; payload: Buffer; iv: Buffer }[] = [];
  let plaintext = 0;
  for (const row of rows) {
    if (!row.iv) {
      plaintext += 1;
      continue;
    }
    const decrypted = decryptForRotation(`ops row seq=${String(row.seq)}`, row.payload, row.iv, currentKey);
    const { ciphertext, iv } = encryptPayload(decrypted, newKey);
    reEncrypted.push({ seq: row.seq, payload: ciphertext, iv });
  }

  // Saved interpretation results (#1680) use the same key: their sections and, when present, their label.
  const results = db
    .prepare('SELECT id, sections_json, iv, description_json, description_iv FROM interpretation_results ORDER BY id')
    .all() as unknown as ResultRow[];
  const reResults: {
    id: string;
    sections: Buffer;
    iv: Buffer;
    description: Buffer | null;
    descriptionIv: Buffer | null;
  }[] = [];
  for (const row of results) {
    const sections = encryptPayload(
      decryptForRotation(`interpretation result ${row.id}`, row.sections_json, row.iv, currentKey),
      newKey,
    );
    const description =
      row.description_json === null || row.description_iv === null
        ? undefined
        : encryptPayload(
            decryptForRotation(
              `the label of interpretation result ${row.id}`,
              row.description_json,
              row.description_iv,
              currentKey,
            ),
            newKey,
          );
    reResults.push({
      id: row.id,
      sections: sections.ciphertext,
      iv: sections.iv,
      description: description?.ciphertext ?? row.description_json,
      descriptionIv: description?.iv ?? row.description_iv,
    });
  }

  // TOTP secrets and the recovery-code pepper (#1500): without these a rotation locks every enrolled user out and
  // leaves the secrets wrapped under the old, possibly leaked, key. Decrypted here, written only below.
  const totp = planTotpRotation(db, currentKey, newKey, decryptForRotation);

  const update = db.prepare('UPDATE ops SET payload = ?, iv = ? WHERE seq = ?');
  const updateResult = db.prepare(
    'UPDATE interpretation_results SET sections_json = ?, iv = ?, description_json = ?, description_iv = ? WHERE id = ?',
  );
  for (const row of reEncrypted) update.run(row.payload, row.iv, row.seq);
  for (const row of reResults) updateResult.run(row.sections, row.iv, row.description, row.descriptionIv, row.id);
  totp.apply();

  return {
    rotated: reEncrypted.length,
    plaintext,
    interpretationResults: reResults.length,
    totpSecrets: totp.totpSecrets,
    serverSecrets: totp.serverSecrets,
  };
}

function requireKey(name: string): Buffer {
  const encoded = process.env[name];
  if (encoded === undefined || encoded === '') throw new Error(`${name} is not set.`);
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error(`${name} must decode to 32 bytes of base64, got ${String(key.length)}.`);
  return key;
}

/** True when this module is the process entry point rather than an import — same test as `server/index.ts`. */
const isEntryPoint = process.argv[1] !== undefined && import.meta.url === `file://${resolve(process.argv[1])}`;

if (isEntryPoint) {
  const currentKey = requireKey('ASTRAYA_ENCRYPTION_KEY');
  const newKey = requireKey('ASTRAYA_NEW_ENCRYPTION_KEY');
  if (currentKey.equals(newKey)) throw new Error('ASTRAYA_NEW_ENCRYPTION_KEY is the same key — nothing to rotate.');

  const dbPath = process.env.ASTRAYA_DB_PATH ?? resolve(import.meta.dirname, '..', '..', 'data', 'astraya.db');
  const db = openDatabase(dbPath);
  try {
    const { rotated, plaintext, interpretationResults, totpSecrets, serverSecrets } = rotateEncryptionKey(
      db,
      currentKey,
      newKey,
    );
    console.log(
      `Re-encrypted ${String(rotated)} operation row(s), ${String(interpretationResults)} saved interpretation result(s), ` +
        `${String(totpSecrets)} TOTP secret(s) and ${String(serverSecrets)} server secret(s) under the new key` +
        (plaintext > 0 ? `; left ${String(plaintext)} pre-encryption row(s) untouched` : '') +
        '. Set ASTRAYA_ENCRYPTION_KEY to the new key and restart the server.',
    );
  } finally {
    db.close();
  }
}
