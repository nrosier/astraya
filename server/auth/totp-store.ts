/**
 * @module totp-store
 * @purpose Storage for TOTP two-factor sign-in (#1500, slice 2a): the per-user encrypted secret, the replay-guard step, and single-use recovery codes stored only as peppered HMAC hashes. No route calls it yet.
 * @conventions Fails closed: a stored secret with no key, or one that will not decrypt, throws and is never read as "not enrolled". The secret is AES-256-GCM under a per-user HKDF subkey; the recovery pepper is one random 32-byte value stored encrypted under the key in `server_secrets`. State changes and replay protection are conditional UPDATEs checked by row count, never read-then-write. Key rotation re-wraps the secrets and every `server_secrets` row through `planTotpRotation`, which decrypts everything before `apply` writes anything. Nothing here logs, and no error message carries a secret, code, pepper or key bytes.
 * @exports TotpKeyMissingError, TotpState, deriveTotpSubkey, startTotpEnrolment, confirmTotpEnrolment, readTotpState, recordAcceptedStep, loadRecoveryPepper, generateRecoveryCodes, normaliseRecoveryCode, replaceRecoveryCodes, consumeRecoveryCode, clearTotp, RotationDecrypt, TotpRotationPlan, planTotpRotation
 */
import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Database } from '../db.ts';
import { decryptPayload, encryptPayload } from '../ops/crypto.ts';
import { encodeBase32, generateSecret } from './totp.ts';

const PEPPER_NAME = 'totp-recovery-pepper';
const PEPPER_BYTES = 32;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_CHARS = 10;

/** Thrown when a user has a stored TOTP secret but no encryption key is configured. */
export class TotpKeyMissingError extends Error {
  constructor() {
    super('A TOTP secret is stored but no encryption key is configured.');
    this.name = 'TotpKeyMissingError';
  }
}

export type TotpState =
  { status: 'off' } | { status: 'pending' | 'enabled'; secret: Uint8Array; lastStep: number | null };

interface SecretRow {
  readonly totp_secret: Uint8Array | null;
  readonly totp_secret_iv: Uint8Array | null;
  readonly totp_enabled_at: string | null;
  readonly totp_last_step: number | bigint | null;
}

interface PepperRow {
  readonly value: Uint8Array;
  readonly iv: Uint8Array;
}

interface CodeHashRow {
  readonly code_hash: string;
}

/** Per-user AES-256 subkey, HKDF-SHA256 from the server key with the user id as salt. */
export function deriveTotpSubkey(key: Buffer, userId: string): Buffer {
  return Buffer.from(hkdfSync('sha256', key, Buffer.from(userId, 'utf8'), 'astraya-totp-secret-v1', 32));
}

/**
 * Generates and stores a fresh encrypted secret (state becomes pending) and returns its bytes for the caller's
 * QR code. Throws when the user is already enabled or does not exist. Never log the returned bytes.
 */
export function startTotpEnrolment(db: Database, key: Buffer, userId: string): Uint8Array {
  const { bytes } = generateSecret();
  const { ciphertext, iv } = encryptPayload(Buffer.from(bytes), deriveTotpSubkey(key, userId));
  const result = db
    .prepare(
      'UPDATE users SET totp_secret = ?, totp_secret_iv = ?, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ? AND totp_enabled_at IS NULL',
    )
    .run(ciphertext, iv, userId);
  if (Number(result.changes) !== 1) {
    throw new Error('TOTP enrolment cannot start: the user does not exist or already has TOTP enabled.');
  }
  return bytes;
}

/** Moves a pending enrolment to enabled and records the matched step. False when there is nothing pending. */
export function confirmTotpEnrolment(db: Database, userId: string, step: number, now: string): boolean {
  const result = db
    .prepare(
      'UPDATE users SET totp_enabled_at = ?, totp_last_step = ? WHERE id = ? AND totp_secret IS NOT NULL AND totp_enabled_at IS NULL',
    )
    .run(now, step, userId);
  return Number(result.changes) === 1;
}

/** Reads and decrypts the user's TOTP state. Throws, never returns 'off', when the key is missing or decryption fails. */
export function readTotpState(db: Database, key: Buffer | null, userId: string): TotpState {
  const row = db
    .prepare('SELECT totp_secret, totp_secret_iv, totp_enabled_at, totp_last_step FROM users WHERE id = ?')
    .get(userId) as unknown as SecretRow | undefined;
  if (row === undefined || row.totp_secret === null) return { status: 'off' };
  if (key === null) throw new TotpKeyMissingError();
  if (row.totp_secret_iv === null) throw new Error('Stored TOTP secret has no IV.');
  const secret = decryptPayload(
    Buffer.from(row.totp_secret),
    Buffer.from(row.totp_secret_iv),
    deriveTotpSubkey(key, userId),
  );
  return {
    status: row.totp_enabled_at === null ? 'pending' : 'enabled',
    secret: new Uint8Array(secret),
    lastStep: row.totp_last_step === null ? null : Number(row.totp_last_step),
  };
}

/** Replay guard: accepts only a step later than the last one, atomically. False means replayed or stale. */
export function recordAcceptedStep(db: Database, userId: string, step: number): boolean {
  const result = db
    .prepare(
      'UPDATE users SET totp_last_step = ? WHERE id = ? AND totp_enabled_at IS NOT NULL AND (totp_last_step IS NULL OR totp_last_step < ?)',
    )
    .run(step, userId, step);
  return Number(result.changes) === 1;
}

/** The recovery-code pepper, created on first use. Concurrent first callers converge on one stored value. */
export function loadRecoveryPepper(db: Database, key: Buffer): Buffer {
  const read = (): PepperRow | undefined =>
    db.prepare('SELECT value, iv FROM server_secrets WHERE name = ?').get(PEPPER_NAME) as unknown as
      PepperRow | undefined;
  let row = read();
  if (row === undefined) {
    const { ciphertext, iv } = encryptPayload(randomBytes(PEPPER_BYTES), key);
    db.prepare('INSERT INTO server_secrets (name, value, iv) VALUES (?, ?, ?) ON CONFLICT(name) DO NOTHING').run(
      PEPPER_NAME,
      ciphertext,
      iv,
    );
    row = read();
  }
  if (row === undefined) throw new Error('The recovery-code pepper could not be stored.');
  return decryptPayload(Buffer.from(row.value), Buffer.from(row.iv), key);
}

/** Ten single-use codes shaped like `ABCDE-FGHIJ`. */
export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const raw = encodeBase32(randomBytes(8)).slice(0, RECOVERY_CODE_CHARS);
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

/** Uppercases and strips every space and dash so users can type a code loosely. */
export function normaliseRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

function hashCode(pepper: Buffer, code: string): string {
  return createHmac('sha256', pepper).update(normaliseRecoveryCode(code)).digest('hex');
}

/** Replaces all of the user's recovery codes with hashes of `codes`, in one transaction. */
export function replaceRecoveryCodes(db: Database, key: Buffer, userId: string, codes: readonly string[]): void {
  const pepper = loadRecoveryPepper(db, key);
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM totp_recovery_codes WHERE user_id = ?').run(userId);
    const insert = db.prepare('INSERT INTO totp_recovery_codes (user_id, code_hash) VALUES (?, ?)');
    for (const code of codes) insert.run(userId, hashCode(pepper, code));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Spends one recovery code. True only when it matched and this call deleted it. */
export function consumeRecoveryCode(db: Database, key: Buffer, userId: string, input: string): boolean {
  const candidate = Buffer.from(hashCode(loadRecoveryPepper(db, key), input), 'hex');
  const rows = db
    .prepare('SELECT code_hash FROM totp_recovery_codes WHERE user_id = ?')
    .all(userId) as unknown as CodeHashRow[];
  let matched: string | null = null;
  for (const { code_hash } of rows) {
    const stored = Buffer.from(code_hash, 'hex');
    // No early exit: every stored hash is compared.
    if (stored.length === candidate.length && timingSafeEqual(stored, candidate)) matched = code_hash;
  }
  if (matched === null) return false;
  const result = db.prepare('DELETE FROM totp_recovery_codes WHERE user_id = ? AND code_hash = ?').run(userId, matched);
  return Number(result.changes) === 1;
}

/** Turns TOTP off for the user: clears the four columns and deletes their recovery codes, in one transaction. */
export function clearTotp(db: Database, userId: string): void {
  db.exec('BEGIN');
  try {
    db.prepare(
      'UPDATE users SET totp_secret = NULL, totp_secret_iv = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?',
    ).run(userId);
    db.prepare('DELETE FROM totp_recovery_codes WHERE user_id = ?').run(userId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Decrypts one value under the current key or throws naming it (never its content); supplied by key rotation. */
export type RotationDecrypt = (what: string, ciphertext: Buffer, iv: Buffer, key: Buffer) => Buffer;

/** Every TOTP value re-encrypted in memory under the new key, not yet written. */
export interface TotpRotationPlan {
  /** Users whose stored secret (pending or enabled) was re-wrapped under their new per-user subkey. */
  readonly totpSecrets: number;
  /** `server_secrets` rows (the recovery-code pepper) re-wrapped under the new key. */
  readonly serverSecrets: number;
  /** Writes the re-wrapped values. Call inside the rotation transaction, after every other table has decrypted. */
  readonly apply: () => void;
}

interface RotationSecretRow {
  readonly id: string;
  readonly totp_secret: Uint8Array;
  readonly totp_secret_iv: Uint8Array | null;
}

interface ServerSecretRow {
  readonly name: string;
  readonly value: Uint8Array;
  readonly iv: Uint8Array;
}

/**
 * Key rotation for TOTP (#1500): decrypts every stored TOTP secret under the user's subkey of `currentKey` and every
 * `server_secrets` value under `currentKey`, re-encrypting each with a fresh IV under `newKey` (the secret under the
 * user's subkey of `newKey`). Reads and decrypts only; nothing is written until `apply` is called. Throws on the first
 * value that is missing its IV or does not decrypt, so a wrong key aborts the rotation before any write.
 */
export function planTotpRotation(
  db: Database,
  currentKey: Buffer,
  newKey: Buffer,
  decrypt: RotationDecrypt,
): TotpRotationPlan {
  const users = db
    .prepare('SELECT id, totp_secret, totp_secret_iv FROM users WHERE totp_secret IS NOT NULL ORDER BY id')
    .all() as unknown as RotationSecretRow[];
  const reUsers: { id: string; secret: Buffer; iv: Buffer }[] = [];
  for (const row of users) {
    const what = `the TOTP secret of user ${row.id}`;
    if (row.totp_secret_iv === null) throw new Error(`${what} has no IV, so nothing was rotated.`);
    const plain = decrypt(
      what,
      Buffer.from(row.totp_secret),
      Buffer.from(row.totp_secret_iv),
      deriveTotpSubkey(currentKey, row.id),
    );
    const { ciphertext, iv } = encryptPayload(plain, deriveTotpSubkey(newKey, row.id));
    plain.fill(0);
    reUsers.push({ id: row.id, secret: ciphertext, iv });
  }

  const secrets = db
    .prepare('SELECT name, value, iv FROM server_secrets ORDER BY name')
    .all() as unknown as ServerSecretRow[];
  const reSecrets: { name: string; value: Buffer; iv: Buffer }[] = [];
  for (const row of secrets) {
    const plain = decrypt(`server secret ${row.name}`, Buffer.from(row.value), Buffer.from(row.iv), currentKey);
    const { ciphertext, iv } = encryptPayload(plain, newKey);
    plain.fill(0);
    reSecrets.push({ name: row.name, value: ciphertext, iv });
  }

  return {
    totpSecrets: reUsers.length,
    serverSecrets: reSecrets.length,
    apply: () => {
      const updateUser = db.prepare('UPDATE users SET totp_secret = ?, totp_secret_iv = ? WHERE id = ?');
      const updateSecret = db.prepare('UPDATE server_secrets SET value = ?, iv = ? WHERE name = ?');
      for (const row of reUsers) updateUser.run(row.secret, row.iv, row.id);
      for (const row of reSecrets) updateSecret.run(row.value, row.iv, row.name);
    },
  };
}
