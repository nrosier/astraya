/**
 * @module totp-store
 * @purpose Storage for TOTP two-factor sign-in (#1500, slice 2a): the per-user encrypted secret, the replay-guard step, and single-use recovery codes stored only as peppered HMAC hashes. No route calls it yet.
 * @conventions Fails closed: a stored secret with no key, one that will not decrypt or is not `SECRET_BYTES` long, or a row with the secret NULL but any other TOTP column set, throws and is never read as "not enrolled". The secret is AES-256-GCM under a per-user HKDF subkey; the recovery pepper is one random 32-byte value stored encrypted under the key in `server_secrets`. State changes and replay protection are conditional UPDATEs checked by row count, never read-then-write. `completeTotpEnrolment` is the only way a route may enable TOTP: it refuses fewer than `RECOVERY_CODE_COUNT` codes and confirms and stores them in one savepoint, so an enabled user always has codes; `confirmTotpEnrolment` is its building block, not a route call, and `test/server-totp-store.test.ts` fails if any file in `server/` or `src/` other than this one references it. A route inside its own transaction must report success, and show the recovery codes, only after its outer COMMIT. The multi-statement writes (`replaceRecoveryCodes`, `clearTotp`, `completeTotpEnrolment`) use uniquely named savepoints, never `BEGIN`, so each is all or nothing alone and may also be called inside a caller's transaction; a failed rollback never replaces the original error. Key rotation does not live here: it re-wraps the TOTP secrets and every `server_secrets` row in `server/ops/rotate-totp.ts`, which decrypts everything before it writes anything. Nothing here logs, and no error message carries a secret, code, pepper or key bytes.
 * @exports TotpKeyMissingError, TotpState, isTotpEnabled, startTotpEnrolment, confirmTotpEnrolment, completeTotpEnrolment (the only route path that enables TOTP), readTotpState, recordAcceptedStep, generateRecoveryCodes, normaliseRecoveryCode, replaceRecoveryCodes (nests in a caller's transaction), consumeRecoveryCode, clearTotp (nests in a caller's transaction)
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Database } from '../db.ts';
import { decryptPayload, encryptPayload } from '../ops/crypto.ts';
import { SECRET_BYTES, encodeBase32, generateSecret } from './totp.ts';
import { deriveTotpSubkey, loadRecoveryPepper } from './totp-keys.ts';

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_CHARS = 10;

/** Thrown when a user has a stored TOTP secret but no encryption key is configured. */
export class TotpKeyMissingError extends Error {
  constructor() {
    super('A TOTP secret is stored but no encryption key is configured.');
    this.name = 'TotpKeyMissingError';
  }
}

/**
 * Pending and enabled are different shapes so one cannot be mistaken for the other: a pending state carries the IV of
 * the stored secret (`enrolmentIv`, the token `confirmTotpEnrolment` compares against) and no replay step; an enabled
 * state carries `lastStep`. Use `isTotpEnabled` for any sign-in check.
 */
export type TotpState =
  | { status: 'off' }
  | { status: 'pending'; secret: Uint8Array; enrolmentIv: Uint8Array }
  | { status: 'enabled'; secret: Uint8Array; lastStep: number | null };

/** True only for an enabled state. Login must use this, so a pending (unconfirmed) user is never challenged. */
export function isTotpEnabled(state: TotpState): state is Extract<TotpState, { status: 'enabled' }> {
  return state.status === 'enabled';
}

interface SecretRow {
  readonly totp_secret: Uint8Array | null;
  readonly totp_secret_iv: Uint8Array | null;
  readonly totp_enabled_at: string | null;
  readonly totp_last_step: number | bigint | null;
}

interface CodeHashRow {
  readonly code_hash: string;
}

/**
 * Generates and stores a fresh encrypted secret (state becomes pending) and returns its bytes for the caller's
 * QR code. Throws when the user is already enabled or does not exist. Never log the returned bytes.
 */
export function startTotpEnrolment(db: Database, key: Buffer, userId: string): Uint8Array {
  const { bytes } = generateSecret();
  const subkey = deriveTotpSubkey(key, userId);
  const secretCopy = Buffer.from(bytes);
  let ciphertext: Buffer;
  let iv: Buffer;
  try {
    ({ ciphertext, iv } = encryptPayload(secretCopy, subkey));
  } finally {
    subkey.fill(0);
    secretCopy.fill(0);
  }
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

/**
 * Moves a pending enrolment to enabled and records the matched step, as a compare-and-set on the secret that was
 * verified: `enrolmentIv` is the pending state's IV, so a later start (another tab) that replaced the secret cannot be
 * confirmed with the earlier code. False, never a throw, when the row count is 0 (nothing pending, or a different IV).
 */
export function confirmTotpEnrolment(
  db: Database,
  userId: string,
  enrolmentIv: Uint8Array,
  step: number,
  now: string,
): boolean {
  const result = db
    .prepare(
      'UPDATE users SET totp_enabled_at = ?, totp_last_step = ? WHERE id = ? AND totp_secret IS NOT NULL AND totp_enabled_at IS NULL AND totp_secret_iv = ?',
    )
    .run(now, step, userId, enrolmentIv);
  return Number(result.changes) === 1;
}

/**
 * Reads and decrypts the user's TOTP state. 'off' only when all four TOTP columns are NULL; throws, never returns 'off',
 * on a partially cleared row, a missing key, a failed decryption or a decrypted secret that is not `SECRET_BYTES` long.
 * The decrypted buffer is zeroed once copied into the returned state.
 */
export function readTotpState(db: Database, key: Buffer | null, userId: string): TotpState {
  const row = db
    .prepare('SELECT totp_secret, totp_secret_iv, totp_enabled_at, totp_last_step FROM users WHERE id = ?')
    .get(userId) as unknown as SecretRow | undefined;
  if (row === undefined) return { status: 'off' };
  if (row.totp_secret === null) {
    // Off only when all four columns are NULL; a partial row fails closed rather than reading as "not enrolled".
    if (row.totp_secret_iv === null && row.totp_enabled_at === null && row.totp_last_step === null) {
      return { status: 'off' };
    }
    throw new Error('Stored TOTP state is inconsistent.');
  }
  if (key === null) throw new TotpKeyMissingError();
  if (row.totp_secret_iv === null) throw new Error('Stored TOTP secret has no IV.');
  const subkey = deriveTotpSubkey(key, userId);
  let plain: Buffer;
  try {
    plain = decryptPayload(Buffer.from(row.totp_secret), Buffer.from(row.totp_secret_iv), subkey);
  } finally {
    subkey.fill(0);
  }
  try {
    if (plain.length !== SECRET_BYTES) throw new Error('Stored TOTP secret has the wrong length.');
    const secret = new Uint8Array(plain);
    if (row.totp_enabled_at === null)
      return { status: 'pending', secret, enrolmentIv: new Uint8Array(row.totp_secret_iv) };
    return { status: 'enabled', secret, lastStep: row.totp_last_step === null ? null : Number(row.totp_last_step) };
  } finally {
    plain.fill(0);
  }
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

/**
 * Runs `work` inside the named savepoint: released when `keep` accepts the result, rolled back to and released
 * otherwise, or on any throw. A savepoint opens a transaction when none is open and nests inside a caller's `BEGIN`
 * when one is, so callers of these functions may wrap them in their own transaction. On a throw the original error is
 * rethrown even when the rollback itself fails (see `rollbackSavepoint`).
 */
function inSavepoint<T>(db: Database, name: string, work: () => T, keep: (result: T) => boolean = () => true): T {
  const nested = db.isTransaction;
  db.exec(`SAVEPOINT ${name}`);
  let result: T;
  try {
    result = work();
    if (keep(result)) {
      // Inside the try: a RELEASE that fails to commit (SQLITE_BUSY) keeps the savepoint, which is then rolled back.
      db.exec(`RELEASE ${name}`);
      return result;
    }
  } catch (error) {
    rollbackSavepoint(db, name, nested, { error });
    throw error;
  }
  rollbackSavepoint(db, name, nested, null);
  return result;
}

/**
 * Rolls back to and releases the savepoint. A failure of either statement never replaces `original`; it is
 * swallowed and the caller rethrows the original error. The exception is a savepoint that opened its own transaction
 * (`nested` false) and left it open: the connection is then stuck in a transaction, so an AggregateError whose cause
 * is the original error (or, with none, the rollback failure) is thrown to say so. Inside a caller's transaction
 * (`nested`) the caller's own ROLLBACK clears any leftover savepoint. With no original error, a rollback failure is
 * thrown as it is.
 */
function rollbackSavepoint(db: Database, name: string, nested: boolean, original: { error: unknown } | null): void {
  let failure: { error: unknown } | null = null;
  try {
    db.exec(`ROLLBACK TO ${name}`);
    db.exec(`RELEASE ${name}`);
  } catch (rollbackError) {
    failure = { error: rollbackError };
  }
  if (failure === null) return;
  if (!nested && db.isTransaction) {
    const first = original ?? failure;
    throw new AggregateError(
      original === null ? [failure.error] : [original.error, failure.error],
      `The ${name} savepoint could not be rolled back; the connection is still in a transaction.`,
      { cause: first.error },
    );
  }
  if (original === null) throw failure.error;
}

/** Deletes the user's recovery codes and inserts hashes of `codes`. Starts no transaction; the caller holds one. */
function writeRecoveryCodes(db: Database, pepper: Buffer, userId: string, codes: readonly string[]): void {
  db.prepare('DELETE FROM totp_recovery_codes WHERE user_id = ?').run(userId);
  const insert = db.prepare('INSERT INTO totp_recovery_codes (user_id, code_hash) VALUES (?, ?)');
  for (const code of codes) insert.run(userId, hashCode(pepper, code));
}

/**
 * Replaces all of the user's recovery codes with hashes of `codes`, all or nothing, in the savepoint
 * `totp_replace_codes`, so it may run inside a caller's transaction. Never enables TOTP; a route that enables it must
 * use `completeTotpEnrolment`.
 */
export function replaceRecoveryCodes(db: Database, key: Buffer, userId: string, codes: readonly string[]): void {
  const pepper = loadRecoveryPepper(db, key);
  try {
    inSavepoint(db, 'totp_replace_codes', () => {
      writeRecoveryCodes(db, pepper, userId, codes);
    });
  } finally {
    pepper.fill(0);
  }
}

/**
 * The only way a route may enable TOTP: confirms the pending enrolment (the `confirmTotpEnrolment` compare-and-set on
 * `enrolmentIv`) and stores hashes of `codes` as the user's recovery codes, in the one savepoint `totp_complete`, so no
 * enabled user is ever left without recovery codes. Throws, writing nothing, when `codes` has fewer than
 * `RECOVERY_CODE_COUNT` entries. False, with nothing written, when the confirm matches no row
 * (nothing pending, or a different IV); any throw rolls everything back and is rethrown. May run inside a caller's
 * transaction.
 */
export function completeTotpEnrolment(
  db: Database,
  key: Buffer,
  userId: string,
  enrolmentIv: Uint8Array,
  step: number,
  now: string,
  codes: readonly string[],
): boolean {
  // Before the savepoint and the pepper: an empty or short list must never enable a user, and nothing is written.
  if (codes.length < RECOVERY_CODE_COUNT) {
    throw new Error(
      `TOTP enrolment needs at least ${String(RECOVERY_CODE_COUNT)} recovery codes; nothing was written.`,
    );
  }
  // Loaded before the savepoint, as replaceRecoveryCodes does, so a wrong key throws before any user write.
  const pepper = loadRecoveryPepper(db, key);
  try {
    return inSavepoint(
      db,
      'totp_complete',
      () => {
        if (!confirmTotpEnrolment(db, userId, enrolmentIv, step, now)) return false;
        writeRecoveryCodes(db, pepper, userId, codes);
        return true;
      },
      (confirmed) => confirmed,
    );
  } finally {
    pepper.fill(0);
  }
}

/** Spends one recovery code. True only when it matched and this call deleted it. */
export function consumeRecoveryCode(db: Database, key: Buffer, userId: string, input: string): boolean {
  const pepper = loadRecoveryPepper(db, key);
  let candidate: Buffer;
  try {
    candidate = Buffer.from(hashCode(pepper, input), 'hex');
  } finally {
    pepper.fill(0);
  }
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

/**
 * Turns TOTP off for the user: clears the four columns and deletes their recovery codes, all or nothing, in the
 * savepoint `totp_clear`, so it may run inside a caller's transaction.
 */
export function clearTotp(db: Database, userId: string): void {
  inSavepoint(db, 'totp_clear', () => {
    db.prepare(
      'UPDATE users SET totp_secret = NULL, totp_secret_iv = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?',
    ).run(userId);
    db.prepare('DELETE FROM totp_recovery_codes WHERE user_id = ?').run(userId);
  });
}
