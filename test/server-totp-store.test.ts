/**
 * TOTP storage (#1500, slice 2a), against a real temp SQLite file. Secrets and codes live only in variables here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { openDatabase, type Database } from '../server/db.ts';
import { encryptPayload } from '../server/ops/crypto.ts';
import {
  TotpKeyMissingError,
  clearTotp,
  confirmTotpEnrolment,
  consumeRecoveryCode,
  deriveTotpSubkey,
  generateRecoveryCodes,
  isTotpEnabled,
  loadRecoveryPepper,
  readTotpState,
  recordAcceptedStep,
  replaceRecoveryCodes,
  startTotpEnrolment,
} from '../server/auth/totp-store.ts';

const KEY = randomBytes(32);

let dir: string;
let db: Database;
let userId = '';

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

/** The pending state's IV, the compare-and-set token `confirmTotpEnrolment` takes. */
function pendingIv(id: string): Uint8Array {
  const state = readTotpState(db, KEY, id);
  if (state.status !== 'pending') throw new Error('expected a pending enrolment');
  return state.enrolmentIv;
}

function confirmNow(id: string, step: number): boolean {
  return confirmTotpEnrolment(db, id, pendingIv(id), step, new Date().toISOString());
}

function storedHashes(id: string): string[] {
  return (
    db.prepare('SELECT code_hash FROM totp_recovery_codes WHERE user_id = ?').all(id) as unknown as {
      code_hash: string;
    }[]
  ).map((row) => row.code_hash);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-totp-store-test-'));
  db = openDatabase(join(dir, 'astraya.db'));
  userId = insertUser('alice');
});

afterEach(() => {
  vi.restoreAllMocks();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('server/auth/totp-store.ts', () => {
  it('start then read gives pending with the secret round-tripped, and the stored bytes are encrypted', () => {
    const secret = startTotpEnrolment(db, KEY, userId);
    const state = readTotpState(db, KEY, userId);
    expect(state.status).toBe('pending');
    if (state.status !== 'pending') throw new Error('expected a pending state');
    expect(Buffer.from(state.secret).equals(Buffer.from(secret))).toBe(true);
    // A pending state has no replay step at all (it is not merely null).
    expect('lastStep' in state).toBe(false);
    const row = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(userId) as unknown as {
      totp_secret: Uint8Array;
    };
    expect(Buffer.from(row.totp_secret).includes(Buffer.from(secret))).toBe(false);
  });

  it('a user with no TOTP reads as off, even with no key', () => {
    expect(readTotpState(db, null, userId)).toEqual({ status: 'off' });
  });

  it('confirm enables the user, and confirming twice returns false the second time', () => {
    startTotpEnrolment(db, KEY, userId);
    const iv = pendingIv(userId);
    expect(confirmTotpEnrolment(db, userId, iv, 5, new Date().toISOString())).toBe(true);
    const state = readTotpState(db, KEY, userId);
    expect(state.status).toBe('enabled');
    if (state.status !== 'enabled') throw new Error('expected an enabled state');
    expect(state.lastStep).toBe(5);
    expect(confirmTotpEnrolment(db, userId, iv, 6, new Date().toISOString())).toBe(false);
  });

  it('confirm returns false when nothing is pending', () => {
    expect(confirmTotpEnrolment(db, userId, randomBytes(12), 5, new Date().toISOString())).toBe(false);
  });

  it('two enrolment starts from two tabs: only the latest pending secret (its IV) can be confirmed', () => {
    startTotpEnrolment(db, KEY, userId);
    const ivA = pendingIv(userId);
    const secretB = startTotpEnrolment(db, KEY, userId);
    const ivB = pendingIv(userId);
    expect(Buffer.from(ivA).equals(Buffer.from(ivB))).toBe(false);

    // Tab A's code was checked against the replaced secret, so its confirm must not enable the user.
    expect(confirmTotpEnrolment(db, userId, ivA, 7, new Date().toISOString())).toBe(false);
    const stillPending = readTotpState(db, KEY, userId);
    expect(stillPending.status).toBe('pending');
    if (stillPending.status !== 'pending') throw new Error('expected a pending state');
    expect(Buffer.from(stillPending.secret).equals(Buffer.from(secretB))).toBe(true);

    expect(confirmTotpEnrolment(db, userId, ivB, 8, new Date().toISOString())).toBe(true);
    const enabled = readTotpState(db, KEY, userId);
    expect(enabled.status).toBe('enabled');
    if (enabled.status !== 'enabled') throw new Error('expected an enabled state');
    expect(Buffer.from(enabled.secret).equals(Buffer.from(secretB))).toBe(true);
    expect(enabled.lastStep).toBe(8);
  });

  it('a pending user fails isTotpEnabled and an enabled user passes it', () => {
    expect(isTotpEnabled(readTotpState(db, KEY, userId))).toBe(false);
    startTotpEnrolment(db, KEY, userId);
    expect(isTotpEnabled(readTotpState(db, KEY, userId))).toBe(false);
    expect(confirmNow(userId, 4)).toBe(true);
    expect(isTotpEnabled(readTotpState(db, KEY, userId))).toBe(true);
  });

  it('isTotpEnabled is a type guard: a pending state is never narrowed to enabled', () => {
    startTotpEnrolment(db, KEY, userId);
    const state = readTotpState(db, KEY, userId);
    if (isTotpEnabled(state)) {
      // Compile-time: only an enabled state reaches here. Runtime: a pending one must not.
      throw new Error(`a ${state.status} state passed isTotpEnabled`);
    }
    expect(state.status).toBe('pending');
    expect(confirmNow(userId, 4)).toBe(true);
    const enabled = readTotpState(db, KEY, userId);
    expect(isTotpEnabled(enabled) ? enabled.lastStep : 'not enabled').toBe(4);
  });

  it('confirmTotpEnrolment is one UPDATE statement carrying all four compare-and-set predicates', () => {
    startTotpEnrolment(db, KEY, userId);
    const iv = pendingIv(userId);
    const prepare = vi.spyOn(db, 'prepare');

    expect(confirmTotpEnrolment(db, userId, iv, 4, new Date().toISOString())).toBe(true);

    const statements = prepare.mock.calls.map(([sql]) => sql);
    expect(statements).toHaveLength(1);
    const [sql] = statements;
    expect(sql).toMatch(/^\s*UPDATE\s+users\b/i);
    expect(sql).toContain('totp_secret IS NOT NULL');
    expect(sql).toContain('totp_enabled_at IS NULL');
    expect(sql).toContain('totp_secret_iv = ?');
    expect(sql).toContain('id = ?');
  });

  it('the enabled state carries lastStep and the pending state does not', () => {
    startTotpEnrolment(db, KEY, userId);
    const pending = readTotpState(db, KEY, userId);
    expect(pending.status).toBe('pending');
    expect('lastStep' in pending).toBe(false);
    expect('enrolmentIv' in pending).toBe(true);
    expect(confirmNow(userId, 9)).toBe(true);
    const enabled = readTotpState(db, KEY, userId);
    expect(enabled.status).toBe('enabled');
    expect('lastStep' in enabled).toBe(true);
    expect('enrolmentIv' in enabled).toBe(false);
    if (enabled.status !== 'enabled') throw new Error('expected an enabled state');
    expect(enabled.lastStep).toBe(9);
  });

  it('start on an enabled user throws, and on a missing user throws', () => {
    startTotpEnrolment(db, KEY, userId);
    confirmNow(userId, 1);
    expect(() => startTotpEnrolment(db, KEY, userId)).toThrow();
    expect(() => startTotpEnrolment(db, KEY, randomUUID())).toThrow();
  });

  it('start on a pending user replaces the pending secret', () => {
    const first = startTotpEnrolment(db, KEY, userId);
    const second = startTotpEnrolment(db, KEY, userId);
    const state = readTotpState(db, KEY, userId);
    if (state.status === 'off') throw new Error('expected a secret');
    expect(Buffer.from(state.secret).equals(Buffer.from(second))).toBe(true);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(false);
  });

  it('reading with key null while a secret is stored throws TotpKeyMissingError', () => {
    startTotpEnrolment(db, KEY, userId);
    expect(() => readTotpState(db, null, userId)).toThrow(TotpKeyMissingError);
  });

  it('reading with a different key throws and does not return off', () => {
    startTotpEnrolment(db, KEY, userId);
    expect(() => readTotpState(db, randomBytes(32), userId)).toThrow();
  });

  it.each([
    ['totp_enabled_at', "'2026-01-01T00:00:00.000Z'"],
    ['totp_secret_iv', 'randomblob(12)'],
    ['totp_last_step', '1'],
  ])('a row with the secret NULL but %s set throws as inconsistent, not off', (column, value) => {
    db.prepare(
      `UPDATE users SET totp_secret = NULL, totp_secret_iv = NULL, totp_enabled_at = NULL, totp_last_step = NULL, ${column} = ${value} WHERE id = ?`,
    ).run(userId);
    expect(() => readTotpState(db, KEY, userId)).toThrow('Stored TOTP state is inconsistent.');
    expect(() => readTotpState(db, null, userId)).toThrow('Stored TOTP state is inconsistent.');
  });

  it('a stored secret that decrypts to 19 bytes throws, naming no secret bytes', () => {
    startTotpEnrolment(db, KEY, userId);
    const short = randomBytes(19);
    const { ciphertext, iv } = encryptPayload(short, deriveTotpSubkey(KEY, userId));
    db.prepare('UPDATE users SET totp_secret = ?, totp_secret_iv = ? WHERE id = ?').run(ciphertext, iv, userId);
    let message = '';
    try {
      readTotpState(db, KEY, userId);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe('Stored TOTP secret has the wrong length.');
    expect(message).not.toContain(short.toString('hex'));
    expect(message).not.toContain(short.toString('base64'));
  });

  it('a flipped byte in the stored ciphertext makes readTotpState throw', () => {
    startTotpEnrolment(db, KEY, userId);
    const row = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(userId) as unknown as {
      totp_secret: Uint8Array;
    };
    const tampered = Buffer.from(row.totp_secret);
    tampered[0] = (tampered[0] ?? 0) ^ 0x01;
    db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(tampered, userId);
    expect(() => readTotpState(db, KEY, userId)).toThrow();
  });

  it("a ciphertext copied from one user's row to another's throws when read", () => {
    const other = insertUser('bob');
    startTotpEnrolment(db, KEY, userId);
    const row = db.prepare('SELECT totp_secret, totp_secret_iv FROM users WHERE id = ?').get(userId) as unknown as {
      totp_secret: Uint8Array;
      totp_secret_iv: Uint8Array;
    };
    db.prepare('UPDATE users SET totp_secret = ?, totp_secret_iv = ? WHERE id = ?').run(
      row.totp_secret,
      row.totp_secret_iv,
      other,
    );
    expect(() => readTotpState(db, KEY, other)).toThrow();
    expect(readTotpState(db, KEY, userId).status).toBe('pending');
  });

  it('subkeys differ per user and are stable for one user', () => {
    const other = insertUser('bob');
    expect(deriveTotpSubkey(KEY, userId).equals(deriveTotpSubkey(KEY, userId))).toBe(true);
    expect(deriveTotpSubkey(KEY, userId).equals(deriveTotpSubkey(KEY, other))).toBe(false);
    expect(deriveTotpSubkey(KEY, userId)).toHaveLength(32);
  });

  it('recordAcceptedStep accepts only a later step', () => {
    startTotpEnrolment(db, KEY, userId);
    confirmNow(userId, 1);
    expect(recordAcceptedStep(db, userId, 10)).toBe(true);
    expect(recordAcceptedStep(db, userId, 10)).toBe(false);
    expect(recordAcceptedStep(db, userId, 9)).toBe(false);
    expect(recordAcceptedStep(db, userId, 11)).toBe(true);
  });

  it('recordAcceptedStep refuses a user who is not enabled', () => {
    expect(recordAcceptedStep(db, userId, 10)).toBe(false);
    startTotpEnrolment(db, KEY, userId);
    expect(recordAcceptedStep(db, userId, 10)).toBe(false);
  });

  it('generates 10 distinct codes of the expected shape', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
  });

  it('stores recovery codes only as hashes, and each works once, loosely typed', () => {
    const codes = generateRecoveryCodes();
    replaceRecoveryCodes(db, KEY, userId, codes);
    const hashes = storedHashes(userId);
    expect(hashes).toHaveLength(10);
    for (const code of codes) {
      expect(hashes).not.toContain(code);
      expect(hashes).not.toContain(code.replace('-', ''));
    }
    const first = codes[0] ?? '';
    expect(consumeRecoveryCode(db, KEY, userId, first.toLowerCase().replace('-', ''))).toBe(true);
    expect(consumeRecoveryCode(db, KEY, userId, first)).toBe(false);
    expect(consumeRecoveryCode(db, KEY, userId, 'AAAAA-AAAAA')).toBe(false);
    for (const code of codes.slice(1)) expect(consumeRecoveryCode(db, KEY, userId, code)).toBe(true);
    expect(storedHashes(userId)).toHaveLength(0);
  });

  it('replacing recovery codes invalidates the old set', () => {
    const oldCodes = generateRecoveryCodes();
    replaceRecoveryCodes(db, KEY, userId, oldCodes);
    replaceRecoveryCodes(db, KEY, userId, generateRecoveryCodes());
    expect(storedHashes(userId)).toHaveLength(10);
    expect(consumeRecoveryCode(db, KEY, userId, oldCodes[0] ?? '')).toBe(false);
  });

  it("one user's code does not work for another user", () => {
    const other = insertUser('bob');
    const codes = generateRecoveryCodes();
    replaceRecoveryCodes(db, KEY, userId, codes);
    expect(consumeRecoveryCode(db, KEY, other, codes[0] ?? '')).toBe(false);
  });

  it('the pepper is created once and is stored encrypted', () => {
    const first = loadRecoveryPepper(db, KEY);
    const second = loadRecoveryPepper(db, KEY);
    expect(first).toHaveLength(32);
    expect(first.equals(second)).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS n FROM server_secrets').get()).toEqual({ n: 1 });
    const row = db.prepare('SELECT value FROM server_secrets').get() as unknown as { value: Uint8Array };
    expect(Buffer.from(row.value).includes(first)).toBe(false);
  });

  it('loading the pepper with the wrong key throws', () => {
    loadRecoveryPepper(db, KEY);
    expect(() => loadRecoveryPepper(db, randomBytes(32))).toThrow();
  });

  it('clearTotp leaves the user off with no recovery codes', () => {
    startTotpEnrolment(db, KEY, userId);
    confirmNow(userId, 3);
    replaceRecoveryCodes(db, KEY, userId, generateRecoveryCodes());
    clearTotp(db, userId);
    expect(readTotpState(db, null, userId)).toEqual({ status: 'off' });
    expect(storedHashes(userId)).toHaveLength(0);
    const row = db
      .prepare('SELECT totp_secret_iv, totp_enabled_at, totp_last_step FROM users WHERE id = ?')
      .get(userId) as unknown as Record<string, unknown>;
    expect(Object.values(row)).toEqual([null, null, null]);
  });

  it('deleting the user deletes their recovery codes', () => {
    replaceRecoveryCodes(db, KEY, userId, generateRecoveryCodes());
    expect(storedHashes(userId)).toHaveLength(10);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    expect(db.prepare('SELECT COUNT(*) AS n FROM totp_recovery_codes').get()).toEqual({ n: 0 });
  });
});
