/**
 * Per-user TOTP reset (#1500, owner decision 2026-11-22: operator CLI reset, no in-app path), against a real temp
 * SQLite file. The CLI is tested through the function it calls, as in `server-ops-reset-totp.test.ts`.
 *
 * Users are put into TOTP states through `startTotpEnrolment` and `replaceRecoveryCodes`, and "enabled" is set with
 * one UPDATE, so these tests do not depend on the confirm function's signature.
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
import { opsDbPath } from '../server/ops/cli.ts';
import { auditLine, resetUserTotp, runResetUserTotp } from '../server/ops/reset-user-totp.ts';

const KEY = randomBytes(32);

let dir: string;
let dbPath: string;
let db: Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-reset-user-totp-test-'));
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

/** Pending when `enabled` is false. Enabled with ten recovery codes when true; returns those codes in plain for the leak check. */
function enrol(userId: string, enabled: boolean): { secret: Uint8Array; codes: string[] } {
  const secret = startTotpEnrolment(db, KEY, userId);
  if (!enabled) return { secret, codes: [] };
  db.prepare('UPDATE users SET totp_enabled_at = ?, totp_last_step = ? WHERE id = ?').run(
    '2026-02-01T00:00:00.000Z',
    12345,
    userId,
  );
  const codes = generateRecoveryCodes();
  replaceRecoveryCodes(db, KEY, userId, codes);
  return { secret, codes };
}

/** Every users column except the four totp_ ones, and every session row. */
function untouched(): { users: unknown[]; sessions: unknown[] } {
  const users = (db.prepare('SELECT * FROM users ORDER BY id').all() as unknown as Record<string, unknown>[]).map(
    (row) => Object.fromEntries(Object.entries(row).filter(([column]) => !column.startsWith('totp_'))),
  );
  return { users, sessions: db.prepare('SELECT * FROM sessions ORDER BY id').all() };
}

function totpColumns(): unknown[] {
  return db
    .prepare('SELECT id, totp_secret, totp_secret_iv, totp_enabled_at, totp_last_step FROM users ORDER BY id')
    .all();
}

function count(sql: string): number {
  return Number((db.prepare(sql).get() as unknown as { n: number | bigint }).n);
}

function recoveryCodeCount(userId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM totp_recovery_codes WHERE user_id = ?').get(userId) as unknown as {
    n: number | bigint;
  };
  return Number(row.n);
}

describe('resetUserTotp', () => {
  it('clears TOTP for the named user, deletes their recovery codes and reports a count of one', () => {
    const target = addUser('target');
    enrol(target, true);
    expect(recoveryCodeCount(target)).toBe(10);

    expect(resetUserTotp(db, 'target')).toEqual({ status: 'reset', users: 1, codes: 10 });

    expect(readTotpState(db, KEY, target)).toEqual({ status: 'off' });
    expect(recoveryCodeCount(target)).toBe(0);
  });

  it('clears a pending enrolment too', () => {
    const pending = addUser('pending');
    enrol(pending, false);

    expect(resetUserTotp(db, 'pending')).toEqual({ status: 'reset', users: 1, codes: 0 });

    expect(readTotpState(db, KEY, pending)).toEqual({ status: 'off' });
  });

  it('leaves every other user TOTP untouched and keeps the pepper row', () => {
    const target = addUser('target');
    const other = addUser('other');
    const bystander = addUser('bystander');
    enrol(target, true);
    const otherEnrol = enrol(other, true);
    enrol(bystander, false);
    const otherColumnsBefore = totpColumns().filter((row) => (row as { id: string }).id !== target);
    const pepperBefore = count("SELECT COUNT(*) AS n FROM server_secrets WHERE name = 'totp-recovery-pepper'");

    resetUserTotp(db, 'target');

    expect(totpColumns().filter((row) => (row as { id: string }).id !== target)).toEqual(otherColumnsBefore);
    const otherState = readTotpState(db, KEY, other);
    expect(otherState.status).toBe('enabled');
    expect(
      otherState.status === 'enabled' && Buffer.from(otherState.secret).equals(Buffer.from(otherEnrol.secret)),
    ).toBe(true);
    expect(otherState.status === 'enabled' && otherState.lastStep).toBe(12345);
    expect(recoveryCodeCount(other)).toBe(10);
    expect(count("SELECT COUNT(*) AS n FROM server_secrets WHERE name = 'totp-recovery-pepper'")).toBe(pepperBefore);
  });

  it('leaves the target password hash, sessions and every other column unchanged', () => {
    const target = addUser('target');
    enrol(target, true);
    addUser('other');
    const before = untouched();
    expect(before.sessions).toHaveLength(2);

    resetUserTotp(db, 'target');

    expect(untouched()).toEqual(before);
  });

  it('matches the username case-insensitively, as the users table does', () => {
    const target = addUser('Target');
    enrol(target, true);

    expect(resetUserTotp(db, 'target').status).toBe('reset');
  });

  it('reports an unknown username as not-found and changes nothing', () => {
    const target = addUser('target');
    enrol(target, true);
    const columnsBefore = totpColumns();
    const before = untouched();

    expect(resetUserTotp(db, 'nobody')).toEqual({ status: 'not-found', users: 0, codes: 0 });

    expect(db.isTransaction).toBe(false);
    expect(totpColumns()).toEqual(columnsBefore);
    expect(untouched()).toEqual(before);
    expect(recoveryCodeCount(target)).toBe(10);
  });

  it('reports a user with TOTP off as off and changes nothing', () => {
    const plain = addUser('plain');
    const plainRow = db.prepare('SELECT * FROM users WHERE id = ?').get(plain);

    expect(resetUserTotp(db, 'plain')).toEqual({ status: 'off', users: 0, codes: 0 });

    expect(db.prepare('SELECT * FROM users WHERE id = ?').get(plain)).toEqual(plainRow);
    expect(db.isTransaction).toBe(false);
  });
});

describe('runResetUserTotp (the CLI body)', () => {
  it('without --yes refuses, exits 1 and changes nothing', () => {
    const target = addUser('target');
    enrol(target, true);
    const columnsBefore = totpColumns();
    db.close();
    const lines: string[] = [];

    expect(runResetUserTotp(['--username', 'target'], dbPath, (line) => lines.push(line))).toBe(1);
    expect(runResetUserTotp(['--username', 'target', '--no'], dbPath, (line) => lines.push(line))).toBe(1);

    expect(lines.join('\n')).toContain('target');
    expect(lines.join('\n')).toContain('--yes');
    db = openDatabase(dbPath);
    expect(totpColumns()).toEqual(columnsBefore);
    expect(recoveryCodeCount(target)).toBe(10);
  });

  it('without --username refuses with exit 1 and does not open the database', () => {
    const missing = join(dir, 'never-created.db');
    const lines: string[] = [];

    expect(runResetUserTotp(['--yes'], missing, (line) => lines.push(line))).toBe(1);
    expect(runResetUserTotp(['--username', '--yes'], missing, (line) => lines.push(line))).toBe(1);

    expect(lines.join('\n')).toContain('Usage: npm run ops:reset-user-totp');
    expect(existsSync(missing)).toBe(false);
  });

  it('with --yes and an unknown username exits 2 and changes nothing', () => {
    const target = addUser('target');
    enrol(target, true);
    const columnsBefore = totpColumns();
    db.close();
    const lines: string[] = [];

    expect(runResetUserTotp(['--username', 'nobody', '--yes'], dbPath, (line) => lines.push(line))).toBe(2);

    expect(lines.join('\n')).toContain('No user named "nobody"');
    db = openDatabase(dbPath);
    expect(totpColumns()).toEqual(columnsBefore);
  });

  it('with --yes and a user whose TOTP is off exits 0 and says so', () => {
    addUser('plain');
    db.close();
    const lines: string[] = [];

    expect(runResetUserTotp(['--username', 'plain', '--yes'], dbPath, (line) => lines.push(line))).toBe(0);

    expect(lines.join('\n')).toContain('has TOTP off');
    db = openDatabase(dbPath);
  });

  it('with --yes resets the named user, exits 0, and prints counts and the username only', () => {
    const target = addUser('target');
    const { secret, codes } = enrol(target, true);
    db.close();
    const lines: string[] = [];

    expect(runResetUserTotp(['--username', 'target', '--yes'], dbPath, (line) => lines.push(line))).toBe(0);

    const output = lines.join('\n');
    expect(output).toContain('Reset TOTP for user "target"; deleted 10 recovery code(s).');
    db = openDatabase(dbPath);
    expect(readTotpState(db, KEY, target)).toEqual({ status: 'off' });
    expect(recoveryCodeCount(target)).toBe(0);
    // Log capture: no secret, code or key bytes in any printed line.
    expect(output).not.toContain(Buffer.from(secret).toString('hex'));
    expect(output).not.toContain(Buffer.from(secret).toString('base64'));
    for (const code of codes) expect(output).not.toContain(code);
    expect(output).not.toContain(KEY.toString('hex'));
    expect(output).not.toContain(KEY.toString('base64'));
  });

  it('refuses an empty or blank ASTRAYA_DB_PATH rather than opening a temporary database', () => {
    const fallback = join(dir, 'default.db');

    expect(() => opsDbPath({ ASTRAYA_DB_PATH: '' }, fallback)).toThrow('ASTRAYA_DB_PATH is set but empty');
    expect(() => opsDbPath({ ASTRAYA_DB_PATH: '   ' }, fallback)).toThrow('ASTRAYA_DB_PATH is set but empty');
    expect(opsDbPath({}, fallback)).toBe(fallback);
  });
});

describe('auditLine (#1500 audit line)', () => {
  it('formats the fixed audit line exactly', () => {
    expect(auditLine('alice', '2026-11-22T10:00:00.000Z', 2)).toBe(
      'audit: ops:reset-user-totp username="alice" at=2026-11-22T10:00:00.000Z result=reset codes=2',
    );
  });

  it('JSON-quotes a username with a space, an equals sign and a newline so it stays one line', () => {
    const name = 'x result=reset\ncodes=0';
    const line = auditLine(name, '2026-11-22T10:00:00.000Z', 2);

    expect(line).not.toContain('\n');
    expect(line).toContain(`username=${JSON.stringify(name)} at=`);
  });
});

describe('runResetUserTotp audit line (#1500)', () => {
  const AUDIT_PREFIX = 'audit: ops:reset-user-totp ';

  it('a successful reset prints exactly one audit line with the username, result=reset and the codes removed', () => {
    const target = addUser('target');
    enrol(target, true);
    db.close();
    const lines: string[] = [];

    expect(runResetUserTotp(['--username', 'target', '--yes'], dbPath, (line) => lines.push(line))).toBe(0);

    const audits = lines.filter((line) => line.startsWith(AUDIT_PREFIX));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatch(
      /^audit: ops:reset-user-totp username="target" at=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z result=reset codes=10$/,
    );
    db = openDatabase(dbPath);
  });

  it('the audit line contains no secret, recovery code or key byte', () => {
    const target = addUser('target');
    const { secret, codes } = enrol(target, true);
    db.close();
    const lines: string[] = [];

    runResetUserTotp(['--username', 'target', '--yes'], dbPath, (line) => lines.push(line));

    const audit = lines.find((line) => line.startsWith(AUDIT_PREFIX)) ?? '';
    expect(audit).not.toBe('');
    expect(audit).not.toContain(Buffer.from(secret).toString('hex'));
    expect(audit).not.toContain(Buffer.from(secret).toString('base64'));
    for (const code of codes) expect(audit).not.toContain(code);
    expect(audit).not.toContain(KEY.toString('hex'));
    expect(audit).not.toContain(KEY.toString('base64'));
    db = openDatabase(dbPath);
  });

  it('refusals print no audit line: without --yes, unknown user, and TOTP off', () => {
    const target = addUser('target');
    enrol(target, true);
    addUser('plain');
    db.close();
    const lines: string[] = [];

    expect(runResetUserTotp(['--username', 'target'], dbPath, (line) => lines.push(line))).toBe(1);
    expect(runResetUserTotp(['--username', 'nobody', '--yes'], dbPath, (line) => lines.push(line))).toBe(2);
    expect(runResetUserTotp(['--username', 'plain', '--yes'], dbPath, (line) => lines.push(line))).toBe(0);

    expect(lines.some((line) => line.includes('audit:'))).toBe(false);
    db = openDatabase(dbPath);
  });
});
