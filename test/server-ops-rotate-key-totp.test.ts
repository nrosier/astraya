/**
 * Key rotation and TOTP storage (#1500, slice 2a), against a real temp SQLite file. The security review of PR #1767
 * found that rotation left `users.totp_secret` and the `server_secrets` recovery-code pepper under the old key: every
 * enrolled user locked out, recovery codes dead, and the secrets still wrapped under a key that may have leaked. These
 * cases pin the fix: both move to the new key, the old key stops reading them, and any failure leaves every table as
 * it was. Secrets and codes live only in variables here.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { openDatabase, type Database } from '../server/db.ts';
import { CURRENT_KEY_VERSION, decryptPayload, encryptPayload } from '../server/ops/crypto.ts';
import { rotateEncryptionKey } from '../server/ops/rotate-key.ts';
import {
  confirmTotpEnrolment,
  consumeRecoveryCode,
  generateRecoveryCodes,
  readTotpState,
  replaceRecoveryCodes,
  startTotpEnrolment,
} from '../server/auth/totp-store.ts';
import { getInterpretationResult, saveInterpretationResult } from '../server/interpretation/results.ts';
import { createClock, randomNodeId, tick } from '../src/store/hlc.ts';

const OLD_KEY = randomBytes(32);
const NEW_KEY = randomBytes(32);
const SECTIONS = [{ heading: 'Overview', body: 'A restyled interpretation.' }];

let dir: string;
let db: Database;
let clock = createClock(randomNodeId());

function insertUser(username: string): string {
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    username,
    'not-a-real-hash',
    new Date().toISOString(),
  );
  return id;
}

/** A user with TOTP enabled and a set of recovery codes, all under `key`. */
function enrol(username: string, key: Buffer): { id: string; secret: Uint8Array; codes: string[] } {
  const id = insertUser(username);
  const secret = startTotpEnrolment(db, key, id);
  const pending = readTotpState(db, key, id);
  if (pending.status !== 'pending') throw new Error('expected a pending enrolment');
  expect(confirmTotpEnrolment(db, id, pending.enrolmentIv, 1000, new Date().toISOString())).toBe(true);
  const codes = generateRecoveryCodes();
  replaceRecoveryCodes(db, key, id, codes);
  return { id, secret, codes };
}

function insertOp(userId: string, key: Buffer, body: string): void {
  const stamped = tick(clock, Date.now());
  clock = stamped.clock;
  const { ciphertext, iv } = encryptPayload(Buffer.from(body, 'utf8'), key);
  db.prepare(
    'INSERT INTO ops (user_id, hlc, device_id, op_version, payload, key_version, iv, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(userId, stamped.hlc, clock.nodeId, 1, ciphertext, CURRENT_KEY_VERSION, iv, new Date().toISOString());
}

/** Every encrypted column the rotation touches, as raw bytes, for "nothing changed" comparisons. */
function snapshot(): unknown {
  return {
    ops: db.prepare('SELECT seq, payload, iv FROM ops ORDER BY seq').all(),
    results: db
      .prepare('SELECT id, sections_json, iv, description_json, description_iv FROM interpretation_results ORDER BY id')
      .all(),
    users: db
      .prepare('SELECT id, totp_secret, totp_secret_iv, totp_enabled_at, totp_last_step FROM users ORDER BY id')
      .all(),
    secrets: db.prepare('SELECT name, value, iv FROM server_secrets ORDER BY name').all(),
    codes: db.prepare('SELECT user_id, code_hash FROM totp_recovery_codes ORDER BY user_id, code_hash').all(),
  };
}

function pepperRow(): { value: Uint8Array; iv: Uint8Array } {
  const row = db.prepare('SELECT value, iv FROM server_secrets').get() as unknown as
    { value: Uint8Array; iv: Uint8Array } | undefined;
  if (row === undefined) throw new Error('no pepper stored');
  return row;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-rotate-totp-test-'));
  db = openDatabase(join(dir, 'astraya.db'));
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('rotateEncryptionKey and TOTP storage (#1500)', () => {
  it('re-wraps an enabled user’s secret so it reads under the new key and not the old one', () => {
    const alice = enrol('alice', OLD_KEY);

    const result = rotateEncryptionKey(db, OLD_KEY, NEW_KEY);
    expect(result).toEqual({ rotated: 0, plaintext: 0, interpretationResults: 0, totpSecrets: 1, serverSecrets: 1 });

    const state = readTotpState(db, NEW_KEY, alice.id);
    expect(state.status).toBe('enabled');
    if (state.status !== 'enabled') throw new Error('unreachable');
    expect(Buffer.from(state.secret).equals(Buffer.from(alice.secret))).toBe(true);
    // Enabled state and the replay guard are not touched by rotation.
    expect(state.lastStep).toBe(1000);
    // The leaked key no longer opens the secret.
    expect(() => readTotpState(db, OLD_KEY, alice.id)).toThrow();
  });

  it('re-wraps the recovery pepper, so existing codes still work under the new key and not the old one', () => {
    const alice = enrol('alice', OLD_KEY);
    const [first, second] = alice.codes;
    if (first === undefined || second === undefined) throw new Error('expected codes');

    rotateEncryptionKey(db, OLD_KEY, NEW_KEY);

    // The pepper plaintext is unchanged (the stored hashes still match), but it now decrypts only under the new key.
    expect(decryptPayload(Buffer.from(pepperRow().value), Buffer.from(pepperRow().iv), NEW_KEY)).toHaveLength(32);
    expect(() => decryptPayload(Buffer.from(pepperRow().value), Buffer.from(pepperRow().iv), OLD_KEY)).toThrow();
    expect(consumeRecoveryCode(db, NEW_KEY, alice.id, first)).toBe(true);
    expect(() => consumeRecoveryCode(db, OLD_KEY, alice.id, second)).toThrow();
  });

  it('re-wraps a pending enrolment, and only the post-rotation IV confirms it', () => {
    const bob = insertUser('bob');
    const secret = startTotpEnrolment(db, OLD_KEY, bob);
    const before = readTotpState(db, OLD_KEY, bob);
    if (before.status !== 'pending') throw new Error('expected a pending enrolment');

    expect(rotateEncryptionKey(db, OLD_KEY, NEW_KEY)).toMatchObject({ totpSecrets: 1, serverSecrets: 0 });

    const state = readTotpState(db, NEW_KEY, bob);
    expect(state.status).toBe('pending');
    if (state.status !== 'pending') throw new Error('unreachable');
    expect(Buffer.from(state.secret).equals(Buffer.from(secret))).toBe(true);

    // The pre-rotation IV is stale: the compare-and-set refuses it and the user stays pending.
    expect(confirmTotpEnrolment(db, bob, before.enrolmentIv, 2000, new Date().toISOString())).toBe(false);
    expect(readTotpState(db, NEW_KEY, bob).status).toBe('pending');

    // The IV read under the new key confirms.
    expect(confirmTotpEnrolment(db, bob, state.enrolmentIv, 2000, new Date().toISOString())).toBe(true);
    const confirmed = readTotpState(db, NEW_KEY, bob);
    expect(confirmed.status).toBe('enabled');
    if (confirmed.status !== 'enabled') throw new Error('unreachable');
    expect(confirmed.lastStep).toBe(2000);
  });

  it('gives every re-wrapped secret and the pepper a fresh IV', () => {
    const alice = enrol('alice', OLD_KEY);
    const ivOf = (): Buffer =>
      Buffer.from(
        (
          db.prepare('SELECT totp_secret_iv FROM users WHERE id = ?').get(alice.id) as unknown as {
            totp_secret_iv: Uint8Array;
          }
        ).totp_secret_iv,
      );
    const secretIvBefore = ivOf();
    const pepperIvBefore = Buffer.from(pepperRow().iv);

    rotateEncryptionKey(db, OLD_KEY, NEW_KEY);

    expect(ivOf().equals(secretIvBefore)).toBe(false);
    expect(Buffer.from(pepperRow().iv).equals(pepperIvBefore)).toBe(false);
  });

  it('leaves users without TOTP alone and counts only the re-wrapped secrets', () => {
    enrol('alice', OLD_KEY);
    enrol('carol', OLD_KEY);
    const dave = insertUser('dave');

    expect(rotateEncryptionKey(db, OLD_KEY, NEW_KEY)).toMatchObject({ totpSecrets: 2, serverSecrets: 1 });
    expect(readTotpState(db, NEW_KEY, dave)).toEqual({ status: 'off' });
  });

  it('writes nothing at all when the current key is wrong', () => {
    const alice = enrol('alice', OLD_KEY);
    insertOp(alice.id, OLD_KEY, '{"field":"one"}');
    saveInterpretationResult(db, { userId: alice.id, mode: 'grounded', locale: 'en', sections: SECTIONS }, OLD_KEY);
    const before = snapshot();

    expect(() => rotateEncryptionKey(db, randomBytes(32), NEW_KEY)).toThrow(/does not decrypt under the current key/);

    expect(snapshot()).toEqual(before);
    const state = readTotpState(db, OLD_KEY, alice.id);
    if (state.status === 'off') throw new Error('expected TOTP still enrolled');
    expect(Buffer.from(state.secret).equals(Buffer.from(alice.secret))).toBe(true);
  });

  it('writes nothing when the current key is wrong and only TOTP data is stored', () => {
    // No ops or results, so the TOTP decrypt itself is what must fail closed.
    const alice = enrol('alice', OLD_KEY);
    const before = snapshot();

    expect(() => rotateEncryptionKey(db, randomBytes(32), NEW_KEY)).toThrow(
      new RegExp(`the TOTP secret of user ${alice.id} does not decrypt under the current key`),
    );
    expect(snapshot()).toEqual(before);
  });

  it('refuses to rotate when one TOTP secret does not decrypt, naming the user and never the secret', () => {
    const alice = enrol('alice', OLD_KEY);
    const mallory = enrol('mallory', OLD_KEY);
    // Mallory's ciphertext copied onto Alice: it decrypts under neither subkey of Alice, so the per-user binding holds.
    db.prepare(
      'UPDATE users SET totp_secret = (SELECT totp_secret FROM users WHERE id = ?), totp_secret_iv = (SELECT totp_secret_iv FROM users WHERE id = ?) WHERE id = ?',
    ).run(mallory.id, mallory.id, alice.id);
    const before = snapshot();

    let message = '';
    try {
      rotateEncryptionKey(db, OLD_KEY, NEW_KEY);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain(`the TOTP secret of user ${alice.id} does not decrypt under the current key`);
    expect(message).not.toContain(Buffer.from(mallory.secret).toString('hex'));
    expect(message).not.toContain(Buffer.from(mallory.secret).toString('base64'));
    expect(snapshot()).toEqual(before);
  });

  it('refuses to rotate when the pepper does not decrypt, before any write', () => {
    const alice = enrol('alice', OLD_KEY);
    insertOp(alice.id, OLD_KEY, '{"field":"one"}');
    const stray = encryptPayload(randomBytes(32), randomBytes(32));
    db.prepare('UPDATE server_secrets SET value = ?, iv = ?').run(stray.ciphertext, stray.iv);
    const before = snapshot();

    expect(() => rotateEncryptionKey(db, OLD_KEY, NEW_KEY)).toThrow(
      /server secret totp-recovery-pepper does not decrypt under the current key/,
    );
    expect(snapshot()).toEqual(before);
  });

  it('rolls everything back when a write fails after the TOTP secrets were re-wrapped', () => {
    const alice = enrol('alice', OLD_KEY);
    insertOp(alice.id, OLD_KEY, '{"field":"one"}');
    const resultId = saveInterpretationResult(
      db,
      { userId: alice.id, mode: 'grounded', locale: 'en', sections: SECTIONS },
      OLD_KEY,
    );
    // The pepper is written last, after ops, results and every TOTP secret: failing there proves that the
    // already-written TOTP rows (and everything before them) are rolled back, not left under the new key.
    db.exec(
      "CREATE TRIGGER fail_pepper BEFORE UPDATE ON server_secrets BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
    );
    const before = snapshot();

    expect(() => rotateEncryptionKey(db, OLD_KEY, NEW_KEY)).toThrow(/injected failure/);

    expect(snapshot()).toEqual(before);
    expect(db.prepare('SELECT 1 FROM sqlite_master WHERE name = ?').get('fail_pepper')).toBeDefined();
    // Still a usable database under the old key, and not in a dangling transaction.
    expect(readTotpState(db, OLD_KEY, alice.id).status).toBe('enabled');
    expect(getInterpretationResult(db, alice.id, resultId, OLD_KEY)?.sections).toEqual(SECTIONS);
    const [code] = alice.codes;
    if (code === undefined) throw new Error('expected a code');
    expect(consumeRecoveryCode(db, OLD_KEY, alice.id, code)).toBe(true);
    expect(() => {
      db.exec('BEGIN');
      db.exec('ROLLBACK');
    }).not.toThrow();
  });
});
