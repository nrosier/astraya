/**
 * Entry-point and database-path helpers for the operator CLIs (#1792). The helper tests are pure functions. The
 * symlink tests run the real script through a child process, because the bug was a silent exit 0 on a symlinked
 * script path, and only a real run shows it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isEntryPoint, isSymlinkedEntry, notEntryPointLine, opsDbPath } from '../server/ops/cli.ts';

describe('isEntryPoint', () => {
  it('is true for a script path that contains a space (the reported bug: the old check compared a raw path and exited 0)', () => {
    const script = '/tmp/a b/x.ts';

    expect(isEntryPoint(pathToFileURL(script).href, script)).toBe(true);
  });

  // Runs only on a Windows host. Linux CI skips it on purpose: Windows gives file:///C:/ URLs.
  it.runIf(process.platform === 'win32')('is true for a Windows drive-letter path, on Windows only', () => {
    const script = 'C:\\a b\\x.ts';

    expect(isEntryPoint(pathToFileURL(script).href, script)).toBe(true);
  });

  it('is false for a different file', () => {
    expect(isEntryPoint(pathToFileURL('/tmp/a b/x.ts').href, '/tmp/a b/y.ts')).toBe(false);
  });

  it('is false when there is no script argument (the module was imported, not run)', () => {
    expect(isEntryPoint(pathToFileURL('/tmp/a b/x.ts').href, undefined)).toBe(false);
  });
});

describe('isSymlinkedEntry', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'astraya-symlink-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('is true for a symlink to the module file, false for an unrelated file, false for undefined', () => {
    const moduleFile = resolve(import.meta.dirname, '..', 'server/ops/reset-totp.ts');
    const link = join(dir, 'reset-totp-link.ts');
    const unrelated = join(dir, 'unrelated.ts');
    symlinkSync(moduleFile, link);
    writeFileSync(unrelated, '');
    const moduleUrl = pathToFileURL(moduleFile).href;

    expect(isSymlinkedEntry(moduleUrl, link)).toBe(true);
    expect(isSymlinkedEntry(moduleUrl, unrelated)).toBe(false);
    expect(isSymlinkedEntry(moduleUrl, undefined)).toBe(false);
  });
});

describe('notEntryPointLine', () => {
  it('names the script and says nothing was changed, with no path in it', () => {
    expect(notEntryPointLine('reset-totp')).toBe(
      'reset-totp: loaded but not run as the entry point; nothing was changed.',
    );
  });
});

describe('symlinked script run (#1792)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'astraya-entry-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // A symlink resolves to the real file in import.meta.url but keeps the link path in argv[1], so the entry check
  // is false. The script must log the line and exit 0 without creating a database.
  it.each([
    ['reset-totp', 'server/ops/reset-totp.ts'],
    ['rotate-key', 'server/ops/rotate-key.ts'],
  ])('%s logs the not-entry-point line, exits 0 and creates no database', (script, relPath) => {
    const target = resolve(import.meta.dirname, '..', relPath);
    const link = join(dir, `${script}-link.ts`);
    symlinkSync(target, link);
    const dbPath = join(dir, 'astraya.db');

    // spawnSync, not execFileSync: execFileSync returns only stdout on success, and the log line is on stderr.
    const run = spawnSync(process.execPath, [link], {
      // Only PATH and ASTRAYA_DB_PATH: a developer's ASTRAYA_ENCRYPTION_KEY must never reach the child.
      env: { PATH: process.env.PATH ?? '', ASTRAYA_DB_PATH: dbPath },
      encoding: 'utf8',
    });

    expect(run.status).toBe(0);
    expect(run.stderr).toContain(notEntryPointLine(script));
    expect(existsSync(dbPath)).toBe(false);
  });
});

describe('opsDbPath', () => {
  it('returns the default when ASTRAYA_DB_PATH is unset', () => {
    expect(opsDbPath({}, '/default/astraya.db')).toBe('/default/astraya.db');
  });

  it('throws when ASTRAYA_DB_PATH is the empty string (openDatabase("") would open a private temporary database)', () => {
    expect(() => opsDbPath({ ASTRAYA_DB_PATH: '' }, '/default/astraya.db')).toThrow(
      'ASTRAYA_DB_PATH is set but empty; unset it or give the database path.',
    );
  });

  it('throws when ASTRAYA_DB_PATH is only whitespace', () => {
    expect(() => opsDbPath({ ASTRAYA_DB_PATH: '  ' }, '/default/astraya.db')).toThrow(
      'ASTRAYA_DB_PATH is set but empty',
    );
  });

  it('returns the value itself when it is a real path', () => {
    expect(opsDbPath({ ASTRAYA_DB_PATH: '/x/y.db' }, '/default/astraya.db')).toBe('/x/y.db');
  });
});
