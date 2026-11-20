/**
 * @module totp-keys
 * @purpose Internal key helpers for TOTP storage (#1782): the per-user HKDF subkey derivation and the encrypted recovery-code pepper in `server_secrets`. Internal to the TOTP store and to key rotation; not for routes.
 * @conventions Internal to `totp-store.ts` and key rotation: a route must not import this module, and it is not re-exported from the store. The pepper is one random 32-byte value stored encrypted under the server key. Nothing here logs, and no error message carries key, pepper or secret bytes.
 * @exports deriveTotpSubkey, loadRecoveryPepper
 */
import { hkdfSync, randomBytes } from 'node:crypto';
import type { Database } from '../db.ts';
import { decryptPayload, encryptPayload } from '../ops/crypto.ts';

const PEPPER_NAME = 'totp-recovery-pepper';
const PEPPER_BYTES = 32;

interface PepperRow {
  readonly value: Uint8Array;
  readonly iv: Uint8Array;
}

/** Per-user AES-256 subkey, HKDF-SHA256 from the server key with the user id as salt. */
export function deriveTotpSubkey(key: Buffer, userId: string): Buffer {
  return Buffer.from(hkdfSync('sha256', key, Buffer.from(userId, 'utf8'), 'astraya-totp-secret-v1', 32));
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
