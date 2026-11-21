/**
 * @module cli
 * @purpose Shared entry-point and database-path helpers for the operator CLI scripts (`reset-totp.ts`, `rotate-key.ts`, and the server entry in `server/index.ts`). Fixes #1792: a script path with a space or other percent-encoded character, and an empty `ASTRAYA_DB_PATH`, used to exit 0 silently or open a fresh temporary database.
 * @conventions Pure functions with no I/O and no logging. The entry-point test compares a `file://` URL built by `pathToFileURL`, so it matches on every platform. `opsDbPath` refuses a set-but-blank value rather than falling back to the default, because a silent fallback would hide a misconfigured variable. Error messages name the variable only, never a secret.
 * @exports isEntryPoint, opsDbPath
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/**
 * True when the module at `moduleUrl` is the process entry point, i.e. it was run as `node <file>` rather than
 * imported. `argv1` is `process.argv[1]`, which is a plain path; it is converted to a URL the same way Node
 * converts `import.meta.url`, so spaces and other characters that the URL form percent-encodes still match.
 */
export function isEntryPoint(moduleUrl: string, argv1: string | undefined): boolean {
  return argv1 !== undefined && moduleUrl === pathToFileURL(resolve(argv1)).href;
}

/**
 * The database path for an operator CLI: `ASTRAYA_DB_PATH` when it is set and not blank, `defaultPath` when it is
 * unset. A set-but-blank value throws, because `openDatabase('')` would open SQLite's private temporary database
 * and report success on an empty, freshly migrated file.
 */
export function opsDbPath(env: NodeJS.ProcessEnv, defaultPath: string): string {
  const value = env.ASTRAYA_DB_PATH;
  if (value === undefined) return defaultPath;
  if (value.trim() === '') {
    throw new Error('ASTRAYA_DB_PATH is set but empty; unset it or give the database path.');
  }
  return value;
}
