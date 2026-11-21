/**
 * TOTP reset for a key leak (#1782), against a real temp SQLite file rather than a mock: the point of the
 * command is what is left in the database afterwards, and only the database can say.
 *
 * Users are put into TOTP states through `startTotpEnrolment` and `replaceRecoveryCodes` (which also creates the
 * pepper under its real name), and "enabled" is set with one UPDATE so these tests do not depend on the confirm
 * function's signature. Like `server-ops-rotate-key.test.ts`, the CLI is tested through the function it calls, not
 * by spawning a process.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { openDatabase, type Database } from '../server/db.ts';
import {
  generateRecoveryCodes,
  readTotpState,
  replaceRecoveryCodes,
  startTotpEnrolment,
} from '../server/auth/totp-store.ts';
import { resetAllTotp, runResetTotp } from '../server/ops/reset-totp.ts';

const KEY = randomBytes(32);

let dir: string;
let dbPath: string;
let db: Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-reset-totp-test-'));
  dbPath = join(dir, 'astraya.db');
  db = openDatabase(dbPath);
});

afterEach(() => {
  if (db.isOpen) db.close();
  rmSync(dir, { recursive: true, force: true });
});

function addUser(username: string): string {
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    username,
    `hash-of-${username}`,
    '2026-01-01T00:00:00.000Z',
  );
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run(
    `session-${username}`,
    id,
    '2026-01-01T00:00:00.000Z',
    '2099-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z',
  );
  return id;
}

/** Pending when `enabled` is false, enabled with ten recovery codes when true. */
function enrol(userId: string, enabled: boolean): void {
  startTotpEnrolment(db, KEY, userId);
  if (enabled) {
    db.prepare('UPDATE users SET totp_enabled_at = ?, totp_last_step = ? WHERE id = ?').run(
      '2026-02-01T00:00:00.000Z',
      12345,
      userId,
    );
    replaceRecoveryCodes(db, KEY, userId, generateRecoveryCodes());
  }
}

/** Everything the reset must leave alone: every users column except the four totp_ ones, and every session row. */
function untouched(): { users: unknown[]; sessions: unknown[] } {
  const users = (db.prepare('SELECT * FROM users ORDER BY id').all() as unknown as Record<string, unknown>[]).map(
    (row) => Object.fromEntries(Object.entries(row).filter(([column]) => !column.startsWith('totp_'))),
  );
  return { users, sessions: db.prepare('SELECT * FROM sessions ORDER BY id').all() };
}

function count(sql: string): number {
  return Number((db.prepare(sql).get() as unknown as { n: number | bigint }).n);
}

function totpColumns(): unknown[] {
  return db
    .prepare('SELECT id, totp_secret, totp_secret_iv, totp_enabled_at, totp_last_step FROM users ORDER BY id')
    .all();
}

describe('resetAllTotp', () => {
  it('clears every TOTP secret and reports the counts that were there before', () => {
    const pending = addUser('pending');
    const enabled = addUser('enabled');
    enrol(pending, false);
    enrol(enabled, true);
    expect(count('SELECT COUNT(*) AS n FROM totp_recovery_codes')).toBe(10);

    expect(resetAllTotp(db)).toEqual({ users: 2, codes: 10, pepper: 1 });

    expect(count('SELECT COUNT(*) AS n FROM users WHERE totp_secret IS NOT NULL')).toBe(0);
    expect(
      count(
        'SELECT COUNT(*) AS n FROM users WHERE totp_secret_iv IS NOT NULL OR totp_enabled_at IS NOT NULL OR totp_last_step IS NOT NULL',
      ),
    ).toBe(0);
    expect(readTotpState(db, KEY, pending)).toEqual({ status: 'off' });
    expect(readTotpState(db, KEY, enabled)).toEqual({ status: 'off' });
  });

  it('deletes every recovery code and the pepper row', () => {
    enrol(addUser('one'), true);
    enrol(addUser('two'), true);
    expect(count("SELECT COUNT(*) AS n FROM server_secrets WHERE name = 'totp-recovery-pepper'")).toBe(1);

    const result = resetAllTotp(db);

    expect(result.codes).toBe(20);
    expect(result.pepper).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM totp_recovery_codes')).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM server_secrets WHERE name = 'totp-recovery-pepper'")).toBe(0);
  });

  it('leaves passwords, sessions and every other user column unchanged', () => {
    enrol(addUser('one'), true);
    enrol(addUser('two'), false);
    addUser('three');
    const before = untouched();
    expect(before.sessions).toHaveLength(3);

    resetAllTotp(db);

    expect(untouched()).toEqual(before);
  });

  it('leaves a user with no TOTP alone and does not count them', () => {
    const plain = addUser('plain');
    enrol(addUser('enrolled'), true);
    const plainRow = db.prepare('SELECT * FROM users WHERE id = ?').get(plain);

    expect(resetAllTotp(db).users).toBe(1);

    expect(db.prepare('SELECT * FROM users WHERE id = ?').get(plain)).toEqual(plainRow);
  });

  it('reports zero on a database with no TOTP at all, and is safe to run twice', () => {
    addUser('plain');
    expect(resetAllTotp(db)).toEqual({ users: 0, codes: 0, pepper: 0 });

    enrol(addUser('enrolled'), true);
    expect(resetAllTotp(db)).toEqual({ users: 1, codes: 10, pepper: 1 });
    expect(resetAllTotp(db)).toEqual({ users: 0, codes: 0, pepper: 0 });
  });

  it('rolls everything back when a step fails midway, and rethrows the original error', () => {
    enrol(addUser('one'), true);
    enrol(addUser('two'), false);
    const columnsBefore = totpColumns();
    db.exec(
      "CREATE TRIGGER fail_code_delete BEFORE DELETE ON totp_recovery_codes BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
    );

    expect(() => resetAllTotp(db)).toThrow('injected failure');

    expect(db.isTransaction).toBe(false);
    expect(totpColumns()).toEqual(columnsBefore);
    expect(count('SELECT COUNT(*) AS n FROM totp_recovery_codes')).toBe(10);
    expect(count("SELECT COUNT(*) AS n FROM server_secrets WHERE name = 'totp-recovery-pepper'")).toBe(1);
  });
});

describe('runResetTotp (the CLI body)', () => {
  it('without --yes says what it would do, exits non-zero and changes nothing', () => {
    enrol(addUser('enrolled'), true);
    const columnsBefore = totpColumns();
    db.close();
    const lines: string[] = [];

    expect(runResetTotp([], dbPath, (line) => lines.push(line))).toBe(1);
    expect(runResetTotp(['--no'], dbPath, (line) => lines.push(line))).toBe(1);

    expect(lines.join('\n')).toContain('EVERY user');
    expect(lines.join('\n')).toContain('--yes');
    db = openDatabase(dbPath);
    expect(totpColumns()).toEqual(columnsBefore);
    expect(count('SELECT COUNT(*) AS n FROM totp_recovery_codes')).toBe(10);
    expect(count("SELECT COUNT(*) AS n FROM server_secrets WHERE name = 'totp-recovery-pepper'")).toBe(1);
  });

  it('without --yes does not even create a database', () => {
    const missing = join(dir, 'never-created.db');

    expect(runResetTotp([], missing, () => undefined)).toBe(1);

    expect(existsSync(missing)).toBe(false);
  });

  it('with --yes resets, exits zero and prints counts and a re-enrol sentence only', () => {
    const userId = addUser('enrolled');
    enrol(userId, true);
    const secret = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(userId) as unknown as {
      totp_secret: Uint8Array;
    };
    db.close();
    const lines: string[] = [];

    expect(runResetTotp(['--yes'], dbPath, (line) => lines.push(line))).toBe(0);

    const output = lines.join('\n');
    expect(output).toContain('Reset TOTP for 1 user(s); deleted 10 recovery code(s) and 1 pepper row(s).');
    expect(output).toContain('enrol TOTP again');
    expect(output).toContain(`Database: ${dbPath}`);
    expect(output).not.toContain(Buffer.from(secret.totp_secret).toString('hex'));
    expect(output).not.toContain(KEY.toString('base64'));
    db = openDatabase(dbPath);
    expect(readTotpState(db, KEY, userId)).toEqual({ status: 'off' });
  });

  it('with --yes on a missing database path prints the path, says no TOTP was found, exits 2 and never reports success (#1792: a wrong path used to print success)', () => {
    const missing = join(dir, 'wrong-path.db');
    const lines: string[] = [];

    expect(runResetTotp(['--yes'], missing, (line) => lines.push(line))).toBe(2);

    const output = lines.join('\n');
    expect(output).toContain(`Database: ${missing}`);
    expect(output).toContain('No TOTP state was found in this database. Check ASTRAYA_DB_PATH: nothing was reset.');
    expect(output).not.toContain('Reset TOTP for');
  });

  it('with --yes on an existing database that has users but no TOTP exits 2 and reports nothing reset', () => {
    addUser('never-enrolled');
    db.close();
    const lines: string[] = [];

    expect(runResetTotp(['--yes'], dbPath, (line) => lines.push(line))).toBe(2);

    const output = lines.join('\n');
    expect(output).toContain('No TOTP state was found in this database.');
    expect(output).not.toContain('Reset TOTP for');
    db = openDatabase(dbPath);
    expect(count('SELECT COUNT(*) AS n FROM users')).toBe(1);
  });
});
