/**
 * Clear TOTP two-factor sign-in for ONE named user (#1500, owner decision recorded 2026-11-22). The operator
 * recovery path for a user who has lost both the authenticator and the recovery codes. There is no in-app route.
 *
 *   ASTRAYA_DB_PATH=./data/astraya.db node server/ops/reset-user-totp.ts --username <name> --yes
 *   (or: npm run ops:reset-user-totp -- --username <name> --yes)
 *
 * The named user's four TOTP columns and their recovery codes are cleared, in one transaction. Nothing else is
 * touched: not the password, not sessions, not other users, and not the recovery-code pepper, which the other users'
 * codes still depend on (the all-user `ops:reset-totp` is the command that removes the pepper).
 */

/**
 * @module reset-user-totp
 * @purpose Operator CLI that clears TOTP for one named user (#1500): the four `users.totp_*` columns and that user's recovery codes, in one transaction. Operator recovery for a locked-out user; the all-user counterpart is `reset-totp.ts` (#1782).
 * @conventions Operator-only (shell access, no HTTP route). Refuses without `--yes` and then opens nothing. Requires `--username <name>`. Exits 2 when the username is unknown and 0 when the user is off (nothing changed) or was reset. Reuses `clearTotp` from `auth/totp-store` and the entry-point and blank-path helpers from `cli.ts`. Prints counts and fixed sentences plus the username the operator typed, never a stored value, secret, code or key byte.
 * @exports UserTotpResetResult, resetUserTotp, auditLine, runResetUserTotp
 */
import { resolve } from 'node:path';
import { openDatabase, type Database } from '../db.ts';
import { clearTotp } from '../auth/totp-store.ts';
import { isEntryPoint, isSymlinkedEntry, notEntryPointLine, opsDbPath } from './cli.ts';

const USAGE = 'Usage: npm run ops:reset-user-totp -- --username <name> --yes';

export interface UserTotpResetResult {
  /** `not-found` when no user has that username, `off` when the user had no TOTP state, `reset` when it was cleared. */
  readonly status: 'not-found' | 'off' | 'reset';
  /** 1 when the user's TOTP was cleared, else 0. */
  readonly users: number;
  /** Recovery-code rows deleted for this user. */
  readonly codes: number;
}

/** Clears TOTP for the user with `username` (matched case-insensitively, as the users table is). Sessions and passwords are kept. */
export function resetUserTotp(db: Database, username: string): UserTotpResetResult {
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db
      .prepare('SELECT id, totp_secret, totp_secret_iv, totp_enabled_at, totp_last_step FROM users WHERE username = ?')
      .get(username) as unknown as
      | {
          id: string;
          totp_secret: Uint8Array | null;
          totp_secret_iv: Uint8Array | null;
          totp_enabled_at: string | null;
          totp_last_step: number | bigint | null;
        }
      | undefined;
    if (row === undefined) {
      db.exec('ROLLBACK');
      return { status: 'not-found', users: 0, codes: 0 };
    }
    const hasState =
      row.totp_secret !== null ||
      row.totp_secret_iv !== null ||
      row.totp_enabled_at !== null ||
      row.totp_last_step !== null;
    if (!hasState) {
      db.exec('ROLLBACK');
      return { status: 'off', users: 0, codes: 0 };
    }
    const counted = db
      .prepare('SELECT COUNT(*) AS n FROM totp_recovery_codes WHERE user_id = ?')
      .get(row.id) as unknown as { n: number | bigint };
    clearTotp(db, row.id);
    db.exec('COMMIT');
    return { status: 'reset', users: 1, codes: Number(counted.n) };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      // SQLite may already have rolled back; then the original error is the one to report.
      if (db.isTransaction) {
        throw new AggregateError(
          [error, rollbackError],
          'User TOTP reset failed and the rollback also failed; the connection is still in a transaction.',
          { cause: rollbackError },
        );
      }
    }
    throw error;
  }
}

/**
 * The audit line printed on a successful reset (#1500). Fixed format, stdout only. It carries the username the operator
 * typed, the UTC time of the reset and the number of recovery codes removed. Never a secret, code or key byte.
 */
export function auditLine(username: string, at: string, codes: number): string {
  return `audit: ops:reset-user-totp username=${JSON.stringify(username)} at=${at} result=reset codes=${String(codes)}`;
}

/** The value after `--username`, or undefined when the flag is missing, has no value, or the value is blank or another flag. */
function usernameArg(argv: readonly string[]): string | undefined {
  const index = argv.indexOf('--username');
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--') || value.trim() === '') return undefined;
  return value;
}

/**
 * The CLI body, separate from the entry point so the refusal paths are testable. Returns 1 without `--username` or
 * without `--yes` (the database is not opened), 2 for an unknown username, else 0. `log` only receives fixed
 * sentences, the database path and the username the operator typed.
 */
export function runResetUserTotp(argv: readonly string[], dbPath: string, log: (line: string) => void): number {
  const username = usernameArg(argv);
  if (username === undefined) {
    log(USAGE);
    return 1;
  }
  if (!argv.includes('--yes')) {
    log(
      `This clears TOTP for user "${username}" and deletes that user's recovery codes. ` +
        'Passwords and sessions are not touched. Other users and the recovery-code pepper are not touched.',
    );
    log(`Nothing was changed. Re-run with --yes to confirm: ${USAGE}`);
    return 1;
  }
  log(`Database: ${dbPath}`);
  const db = openDatabase(dbPath);
  try {
    const result = resetUserTotp(db, username);
    if (result.status === 'not-found') {
      log(`No user named "${username}" was found. Check the username and ASTRAYA_DB_PATH: nothing was reset.`);
      return 2;
    }
    if (result.status === 'off') {
      log(`User "${username}" has TOTP off. Nothing was changed.`);
      return 0;
    }
    log(
      `Reset TOTP for user "${username}"; deleted ${String(result.codes)} recovery code(s). ` +
        'The user must enrol TOTP again on next sign-in if it is required.',
    );
    log(auditLine(username, new Date().toISOString(), result.codes));
    return 0;
  } finally {
    db.close();
  }
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  const dbPath = opsDbPath(process.env, resolve(import.meta.dirname, '..', '..', 'data', 'astraya.db'));
  process.exitCode = runResetUserTotp(process.argv.slice(2), dbPath, (line) => {
    console.log(line);
  });
} else if (isSymlinkedEntry(import.meta.url, process.argv[1])) {
  console.error(notEntryPointLine('reset-user-totp'));
}
