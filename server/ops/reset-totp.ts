/**
 * Clear TOTP two-factor sign-in for every user after a key leak (#1782).
 *
 *   ASTRAYA_DB_PATH=./data/astraya.db node server/ops/reset-totp.ts --yes
 *   (or: npm run ops:reset-totp -- --yes)
 *
 * Key rotation re-wraps the TOTP secrets and the recovery-code pepper under the new key, but it
 * does not undo a TOTP compromise: anyone holding the old key and a pre-rotation backup can still
 * decrypt every secret and attack the recovery codes offline. The only remedy is to throw the TOTP
 * state away and have users enrol again, which is what this does.
 *
 * The server must be stopped first, as for rotation. Sessions are kept on purpose (owner decision,
 * #1782): users stay signed in and re-enrol TOTP when next required.
 */

/**
 * @module reset-totp
 * @purpose Operator CLI that clears TOTP for every user after a key leak (#1782): the four TOTP columns, every recovery code and the recovery-code pepper, in one transaction. Rotation alone does not undo a TOTP compromise, so this is the step after `ops:rotate-key`.
 * @conventions Destructive and operator-only (shell access, server stopped), never an HTTP route. Refuses to run without an explicit `--yes`, and then opens and changes nothing. One `BEGIN IMMEDIATE` transaction with a rollback on any error, rethrowing the original error. Touches only `users.totp_*`, `totp_recovery_codes` and the pepper row of `server_secrets`; passwords, sessions and every other column or table are left alone (owner decision D1, #1782). Needs no encryption key. Prints counts and fixed sentences only, never a secret, code, pepper or key.
 * @exports TotpResetResult, resetAllTotp, runResetTotp
 */
import { resolve } from 'node:path';
import { openDatabase, type Database } from '../db.ts';

/** Row name of the recovery-code pepper in `server_secrets`; must match `PEPPER_NAME` in `auth/totp-store.ts` (the test checks it). */
const PEPPER_NAME = 'totp-recovery-pepper';

export interface TotpResetResult {
  /** Users that held a TOTP secret (pending or enabled) before the reset; users with no TOTP are not counted. */
  readonly users: number;
  /** Recovery-code rows deleted. */
  readonly codes: number;
  /** 1 when the pepper row existed and was deleted, else 0. */
  readonly pepper: number;
}

/** Clears TOTP for every user and deletes all recovery codes and the pepper, all or nothing. Sessions are kept. */
export function resetAllTotp(db: Database): TotpResetResult {
  db.exec('BEGIN IMMEDIATE');
  try {
    const counted = db.prepare('SELECT COUNT(*) AS n FROM users WHERE totp_secret IS NOT NULL').get() as unknown as {
      n: number | bigint;
    };
    // Every row with any TOTP column set is cleared, so a partially cleared row cannot survive the reset either.
    db.prepare(
      'UPDATE users SET totp_secret = NULL, totp_secret_iv = NULL, totp_enabled_at = NULL, totp_last_step = NULL ' +
        'WHERE totp_secret IS NOT NULL OR totp_secret_iv IS NOT NULL OR totp_enabled_at IS NOT NULL OR totp_last_step IS NOT NULL',
    ).run();
    const codes = db.prepare('DELETE FROM totp_recovery_codes').run();
    const pepper = db.prepare('DELETE FROM server_secrets WHERE name = ?').run(PEPPER_NAME);
    db.exec('COMMIT');
    return { users: Number(counted.n), codes: Number(codes.changes), pepper: Number(pepper.changes) };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      // SQLite may already have rolled back (RAISE(ROLLBACK)); then the original error is the one to report.
      if (db.isTransaction) {
        throw new AggregateError(
          [error, rollbackError],
          'TOTP reset failed and the rollback also failed; the connection is still in a transaction.',
          { cause: rollbackError },
        );
      }
    }
    throw error;
  }
}

/**
 * The CLI body, separate from the entry point so the refusal path is testable. Says what it is about to do, then
 * returns 1 without `--yes` (the database is not even opened) or resets and returns 0. `log` only ever receives
 * fixed sentences and counts.
 */
export function runResetTotp(argv: readonly string[], dbPath: string, log: (line: string) => void): number {
  log(
    'This clears TOTP for EVERY user and deletes all recovery codes and the recovery-code pepper. ' +
      'Passwords and sessions are not touched. The server must be stopped.',
  );
  if (!argv.includes('--yes')) {
    log('Nothing was changed. Re-run with --yes to confirm: npm run ops:reset-totp -- --yes');
    return 1;
  }
  const db = openDatabase(dbPath);
  try {
    const { users, codes, pepper } = resetAllTotp(db);
    log(
      `Reset TOTP for ${String(users)} user(s); deleted ${String(codes)} recovery code(s) and ${String(pepper)} pepper row(s). ` +
        'Users must enrol TOTP again on next sign-in.',
    );
    return 0;
  } finally {
    db.close();
  }
}

/** True when this module is the process entry point rather than an import — same test as `rotate-key.ts`. */
const isEntryPoint = process.argv[1] !== undefined && import.meta.url === `file://${resolve(process.argv[1])}`;

if (isEntryPoint) {
  const dbPath = process.env.ASTRAYA_DB_PATH ?? resolve(import.meta.dirname, '..', '..', 'data', 'astraya.db');
  process.exitCode = runResetTotp(process.argv.slice(2), dbPath, (line) => {
    console.log(line);
  });
}
