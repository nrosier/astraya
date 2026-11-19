/**
 * TOTP storage (#1500, slice 2a), against a real temp SQLite file. Secrets and codes live only in variables here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { openDatabase, type Database } from '../server/db.ts';
import { encryptPayload } from '../server/ops/crypto.ts';
import {
  TotpKeyMissingError,
  clearTotp,
  completeTotpEnrolment,
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

  it('completeTotpEnrolment with the pending IV enables the user and stores the codes', () => {
    // The combined call is the only route path to enabled, so it must leave the user enabled with working codes.
    startTotpEnrolment(db, KEY, userId);
    const codes = generateRecoveryCodes();
    expect(completeTotpEnrolment(db, KEY, userId, pendingIv(userId), 6, new Date().toISOString(), codes)).toBe(true);
    const state = readTotpState(db, KEY, userId);
    expect(isTotpEnabled(state) ? state.lastStep : 'not enabled').toBe(6);
    expect(storedHashes(userId)).toHaveLength(10);
    expect(consumeRecoveryCode(db, KEY, userId, codes[0] ?? '')).toBe(true);
    expect(db.isTransaction).toBe(false);
  });

  it('completeTotpEnrolment with a stale IV returns false, keeps the user pending and stores no codes', () => {
    // A second start (another tab) replaced the secret, so the earlier confirm must write nothing at all.
    startTotpEnrolment(db, KEY, userId);
    const staleIv = pendingIv(userId);
    startTotpEnrolment(db, KEY, userId);
    expect(completeTotpEnrolment(db, KEY, userId, staleIv, 6, new Date().toISOString(), generateRecoveryCodes())).toBe(
      false,
    );
    expect(readTotpState(db, KEY, userId).status).toBe('pending');
    expect(storedHashes(userId)).toHaveLength(0);
    expect(db.isTransaction).toBe(false);
  });

  it('an enrolment interrupted while storing codes leaves the user pending with no codes and no open transaction', () => {
    // Issue #1782 (e): no enabled user may be left without recovery codes after an interrupted enrolment.
    startTotpEnrolment(db, KEY, userId);
    const iv = pendingIv(userId);
    db.exec(
      "CREATE TRIGGER fail_codes BEFORE INSERT ON totp_recovery_codes BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
    );
    expect(() =>
      completeTotpEnrolment(db, KEY, userId, iv, 6, new Date().toISOString(), generateRecoveryCodes()),
    ).toThrow('injected failure');
    db.exec('DROP TRIGGER fail_codes');
    expect(db.isTransaction).toBe(false);
    expect(readTotpState(db, KEY, userId).status).toBe('pending');
    expect(storedHashes(userId)).toHaveLength(0);
    // The connection is usable afterwards: a later write commits, and the same IV can still complete.
    expect(completeTotpEnrolment(db, KEY, userId, iv, 7, new Date().toISOString(), generateRecoveryCodes())).toBe(true);
    expect(storedHashes(userId)).toHaveLength(10);
  });

  it('replaceRecoveryCodes inside an outer BEGIN is undone by the outer ROLLBACK, proving the savepoint nests', () => {
    // A caller (the enrolment route) must be able to hold its own transaction around the store's writes.
    loadRecoveryPepper(db, KEY);
    db.exec('BEGIN');
    expect(() => {
      replaceRecoveryCodes(db, KEY, userId, generateRecoveryCodes());
    }).not.toThrow();
    expect(storedHashes(userId)).toHaveLength(10);
    db.exec('ROLLBACK');
    expect(db.isTransaction).toBe(false);
    expect(storedHashes(userId)).toHaveLength(0);
  });

  it('clearTotp inside an outer BEGIN then COMMIT clears the user', () => {
    // clearTotp nests too: the caller's COMMIT makes its writes durable.
    startTotpEnrolment(db, KEY, userId);
    confirmNow(userId, 3);
    replaceRecoveryCodes(db, KEY, userId, generateRecoveryCodes());
    db.exec('BEGIN');
    expect(() => {
      clearTotp(db, userId);
    }).not.toThrow();
    db.exec('COMMIT');
    expect(db.isTransaction).toBe(false);
    expect(readTotpState(db, null, userId)).toEqual({ status: 'off' });
    expect(storedHashes(userId)).toHaveLength(0);
  });

  it('deleting the user deletes their recovery codes', () => {
    replaceRecoveryCodes(db, KEY, userId, generateRecoveryCodes());
    expect(storedHashes(userId)).toHaveLength(10);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    expect(db.prepare('SELECT COUNT(*) AS n FROM totp_recovery_codes').get()).toEqual({ n: 0 });
  });

  it('completeTotpEnrolment with a wrong key throws and leaves the user pending with no codes', () => {
    // Reason (#1782 E): the pepper is loaded before the savepoint, so a wrong key must fail before any user write.
    startTotpEnrolment(db, KEY, userId);
    loadRecoveryPepper(db, KEY);
    const iv = pendingIv(userId);
    expect(() =>
      completeTotpEnrolment(db, randomBytes(32), userId, iv, 6, new Date().toISOString(), generateRecoveryCodes()),
    ).toThrow();
    expect(db.isTransaction).toBe(false);
    expect(readTotpState(db, KEY, userId).status).toBe('pending');
    expect(storedHashes(userId)).toHaveLength(0);
  });

  it('completeTotpEnrolment inside an outer BEGIN then ROLLBACK leaves the user pending with no codes', () => {
    // Reason (#1782 E): the savepoint is released inside the caller's transaction, so only the caller's end decides.
    startTotpEnrolment(db, KEY, userId);
    const iv = pendingIv(userId);
    db.exec('BEGIN');
    expect(completeTotpEnrolment(db, KEY, userId, iv, 6, new Date().toISOString(), generateRecoveryCodes())).toBe(true);
    expect(storedHashes(userId)).toHaveLength(10);
    db.exec('ROLLBACK');
    expect(db.isTransaction).toBe(false);
    expect(readTotpState(db, KEY, userId).status).toBe('pending');
    expect(storedHashes(userId)).toHaveLength(0);
  });

  it('a stale-IV completeTotpEnrolment inside an outer BEGIN leaves that transaction open and usable', () => {
    // Reason (#1782 E): the false path rolls back only its own savepoint, never the caller's transaction.
    startTotpEnrolment(db, KEY, userId);
    const staleIv = pendingIv(userId);
    startTotpEnrolment(db, KEY, userId);
    loadRecoveryPepper(db, KEY);
    db.exec('BEGIN');
    expect(completeTotpEnrolment(db, KEY, userId, staleIv, 6, new Date().toISOString(), generateRecoveryCodes())).toBe(
      false,
    );
    expect(db.isTransaction).toBe(true);
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run('alice-renamed', userId);
    db.exec('ROLLBACK');
    expect(db.isTransaction).toBe(false);
    expect(db.prepare('SELECT username FROM users WHERE id = ?').get(userId)).toEqual({ username: 'alice' });
    expect(readTotpState(db, KEY, userId).status).toBe('pending');
  });

  /** Makes every `ROLLBACK TO` fail, as a BUSY or I/O error would, and fails the first code insert. */
  function breakRollback(): void {
    const realExec = db.exec.bind(db);
    vi.spyOn(db, 'exec').mockImplementation((sql: string) => {
      if (sql.startsWith('ROLLBACK TO')) throw new Error('injected rollback failure');
      realExec(sql);
    });
    db.exec(
      "CREATE TRIGGER fail_codes BEFORE INSERT ON totp_recovery_codes BEGIN SELECT RAISE(ABORT, 'injected original'); END",
    );
  }

  it('a failing ROLLBACK TO does not hide the original error inside a caller transaction', () => {
    // Reason (#1782 A): the caller must learn what actually failed, not that the rollback failed too.
    startTotpEnrolment(db, KEY, userId);
    const iv = pendingIv(userId);
    loadRecoveryPepper(db, KEY);
    db.exec('BEGIN');
    breakRollback();
    expect(() =>
      completeTotpEnrolment(db, KEY, userId, iv, 6, new Date().toISOString(), generateRecoveryCodes()),
    ).toThrow('injected original');
    vi.restoreAllMocks();
    db.exec('ROLLBACK');
    expect(db.isTransaction).toBe(false);
    expect(readTotpState(db, KEY, userId).status).toBe('pending');
  });

  it('a failing ROLLBACK TO that leaves the connection in a transaction throws an error caused by the original', () => {
    // Reason (#1782 A): when the savepoint's own transaction stays open the caller is told, with the original as cause.
    startTotpEnrolment(db, KEY, userId);
    const iv = pendingIv(userId);
    loadRecoveryPepper(db, KEY);
    breakRollback();
    let thrown: unknown;
    try {
      completeTotpEnrolment(db, KEY, userId, iv, 6, new Date().toISOString(), generateRecoveryCodes());
    } catch (error) {
      thrown = error;
    }
    vi.restoreAllMocks();
    expect(thrown).toBeInstanceOf(AggregateError);
    const cause = (thrown as AggregateError).cause;
    expect(cause).toBeInstanceOf(Error);
    expect((cause as Error).message).toContain('injected original');
    expect((thrown as AggregateError).message).not.toContain('injected rollback failure');
    expect(db.isTransaction).toBe(true);
    db.exec('ROLLBACK');
    expect(db.isTransaction).toBe(false);
    expect(readTotpState(db, KEY, userId).status).toBe('pending');
    expect(storedHashes(userId)).toHaveLength(0);
  });

  it('completeTotpEnrolment refuses an empty or short code list before writing anything', () => {
    // Reason (#1782 B): an enabled user with no (or too few) recovery codes defeats the point of the combined call.
    startTotpEnrolment(db, KEY, userId);
    const iv = pendingIv(userId);
    const now = new Date().toISOString();
    expect(() => completeTotpEnrolment(db, KEY, userId, iv, 6, now, [])).toThrow(/recovery codes/);
    const short = generateRecoveryCodes().slice(0, 9);
    expect(() => completeTotpEnrolment(db, KEY, userId, iv, 6, now, short)).toThrow(/recovery codes/);
    expect(db.isTransaction).toBe(false);
    expect(readTotpState(db, KEY, userId).status).toBe('pending');
    expect(storedHashes(userId)).toHaveLength(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM server_secrets').get()).toEqual({ n: 0 });
  });
});

describe('confirmTotpEnrolment is only referenced by the store (#1782 C)', () => {
  // Reason: "completeTotpEnrolment is the only way to enable" is enforced here, not just documented, so a route that
  // imports the building block (and could enable a user with no codes) fails the build.
  const ROOT = resolve(import.meta.dirname, '..');
  const ALLOWED = new Set([join('server', 'auth', 'totp-store.ts')]);

  function files(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) found.push(...files(path));
      else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) found.push(path);
    }
    return found;
  }

  it('no file under server/ or src/ other than the store mentions it', () => {
    const offenders = [join(ROOT, 'server'), join(ROOT, 'src')]
      .flatMap(files)
      .map((file) => relative(ROOT, file))
      .filter((file) => !ALLOWED.has(file) && !/\.test\.(ts|tsx)$/.test(file))
      .filter((file) => readFileSync(join(ROOT, file), 'utf8').includes('confirmTotpEnrolment'));
    expect(offenders).toEqual([]);
  });
});
