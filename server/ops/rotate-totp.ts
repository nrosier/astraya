/**
 * @module rotate-totp
 * @purpose Key-rotation re-wrap of the TOTP secrets and the `server_secrets` recovery-code pepper (#1500, #1782): decrypts every value under the current key and re-encrypts it under the new one, in memory, for `rotate-key` to write.
 * @conventions Internal to key rotation, called only by `server/ops/rotate-key.ts`. Decrypts everything before `apply` writes anything, so a wrong key aborts before any write. Nothing here logs, and no error message carries a secret, code, pepper or key bytes. The code was moved verbatim from `server/auth/totp-store.ts` (#1782) so the store no longer carries the operator rotation path.
 * @exports RotationDecrypt, TotpRotationPlan, planTotpRotation
 */
import type { Database } from '../db.ts';
import { encryptPayload } from './crypto.ts';
import { deriveTotpSubkey } from '../auth/totp-keys.ts';

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
