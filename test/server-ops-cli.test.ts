/**
 * Entry-point and database-path helpers for the operator CLIs (#1792). Pure functions, so these tests use no
 * database and no process spawn.
 */
import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { isEntryPoint, opsDbPath } from '../server/ops/cli.ts';

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
