/**
 * TOTP store surface and key-helper import boundary (#1782, sec-4 step 2b-3). Reads source files and imports the store
 * module; no secrets or database are involved.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const STORE = join('server', 'auth', 'totp-store.ts');

// Names that must not be reachable from the store's public surface (#1782 finding d, PR #1812 review).
const FORBIDDEN_EXPORTS = ['deriveTotpSubkey', 'loadRecoveryPepper', 'planTotpRotation', 'RotationDecrypt'];
// Types are erased at runtime, so they are checked against the store's source text instead.
const FORBIDDEN_TYPES = ['RotationDecrypt', 'TotpRotationPlan', 'planTotpRotation'];

// The only files allowed to import the TOTP key helpers (#1782, PR #1812 finding: boundary was unenforced, totp-keys.ts:4).
const ALLOWED = new Set([STORE, join('server', 'ops', 'rotate-totp.ts')]);

// Matches a static `from '...'`, a side-effect `import '...'` or a dynamic `import('...')` whose specifier ends in totp-keys.
const TOTP_KEYS_IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)['"][^'"\n]*totp-keys(?:\.ts)?['"]/;

function files(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...files(path));
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) found.push(path);
  }
  return found;
}

function importersOfTotpKeys(): string[] {
  return [join(ROOT, 'server'), join(ROOT, 'src')]
    .flatMap(files)
    .map((file) => relative(ROOT, file))
    .filter((file) => !/\.test\.(ts|tsx)$/.test(file))
    .filter((file) => TOTP_KEYS_IMPORT.test(readFileSync(join(ROOT, file), 'utf8')));
}

describe('TOTP store public surface (#1782 finding d)', () => {
  it('the store does not export the key helpers or the rotation plan at runtime', async () => {
    // Reason: a route importing these from the store would reach key material or rotation logic without the store's guards.
    const exported = Object.keys(await import('../server/auth/totp-store.ts'));
    for (const name of FORBIDDEN_EXPORTS) expect(exported).not.toContain(name);
  });

  it('the store source does not declare the rotation types or plan (types are invisible to Object.keys)', () => {
    // Reason: RotationDecrypt and TotpRotationPlan are types, so a runtime key check alone would pass while they stay exported.
    const source = readFileSync(join(ROOT, STORE), 'utf8');
    for (const name of FORBIDDEN_TYPES) expect(source).not.toContain(name);
  });
});

describe('TOTP key helpers are imported only by the store and rotate-totp (#1782 finding d)', () => {
  it('no other file under server/ or src/ imports totp-keys', () => {
    // Reason: totp-keys.ts holds the HKDF subkey and pepper loaders; a route importing them bypasses the store's constant-time paths.
    const offenders = importersOfTotpKeys().filter((file) => !ALLOWED.has(file));
    expect(offenders).toEqual([]);
  });

  it('the scan is not vacuous: without the allowlist it finds exactly the two allowed importers', () => {
    // Reason: stops a broken regex or walker from passing the boundary test above by matching nothing at all.
    expect(importersOfTotpKeys().sort()).toEqual([...ALLOWED].sort());
  });
});
