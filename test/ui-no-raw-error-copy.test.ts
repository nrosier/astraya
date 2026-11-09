/**
 * Guard for #1365: a `src/ui/*.tsx` must not show a thrown error's own text (the server's English `error`, or
 * any `Error.message`) as primary copy. Such text reaches a Dutch reader untranslated and the parity test
 * cannot see it, because it is not in a `*.messages.ts` file.
 *
 * Two shapes are refused:
 *
 * 1. A caught error's `.message` handed straight to a state setter (`setError(cause.message)`), in any form
 *    (`cause instanceof Error ? cause.message : String(cause)`, `caught.message`, `String(cause)`). Route it through
 *    `apiErrorText(cause)` (src/ui/api-error.ts) or a `t.something(...)` wrapper from a messages file.
 * 2. A JSX child that is a caught error's bare `{error.message}`. Failure state is checked where it is set (shape 1), so rendering the stored, already-translated string later is fine.
 *
 * Wrapped use (`t.saveFailed(cause.message)`, a template string led by a translated `t.` prefix) is allowed: the
 * sentence around it is translated. A file that calls a server client must also never read `.message` at all
 * from a caught value outside such a wrapper, which the same two checks cover.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_ROOT = resolve(import.meta.dirname, '..', 'src', 'ui');

function uiTsx(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...uiTsx(path));
    else if (entry.name.endsWith('.tsx')) files.push(path);
  }
  return files;
}

/** The names a caught value usually has; a `.message` on anything else (a lint issue, a form problem) is data, not a thrown error. */
const CAUGHT = String.raw`(?:cause|caught|error|err|e)`;

/** `setSomething(` straight onto a caught error's text, with no translated function in between. */
const SETTER_RAW = new RegExp(String.raw`\bset\w+\(\s*(?:${CAUGHT}\s+instanceof\s+\w+\s*\?\s*)?${CAUGHT}\.message\b`);
/**
 * The same inside an object literal that is *itself* the copy (`text:` of a status line). A `message:` field is
 * allowed: those hold a local calculation's failure and are rendered through a `t.error(...)` wrapper, which the
 * JSX check below enforces by refusing a bare `{x.message}` child.
 */
const OBJECT_RAW = new RegExp(
  String.raw`\bset\w+\(\{[^}]*\btext:\s*(?:${CAUGHT}\s+instanceof\s+\w+\s*\?\s*)?${CAUGHT}\.message\b`,
);
/** A JSX child that is a caught error's text: `<X>{error.message}</X>`. State read back (`{result.message}`) is covered at the setter. */
const JSX_RAW = new RegExp(String.raw`>\s*\{\s*${CAUGHT}\.message\s*\}\s*<`);

function offences(source: string): string[] {
  const found: string[] = [];
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    if (SETTER_RAW.test(line) || OBJECT_RAW.test(line) || JSX_RAW.test(line)) {
      found.push(`${String(index + 1)}: ${line.trim()}`);
    }
  });
  return found;
}

describe('no raw error text as primary UI copy (#1365)', () => {
  it('recognises the shapes it is meant to refuse', () => {
    expect(offences('setError(cause instanceof Error ? cause.message : String(cause));')).toHaveLength(1);
    expect(offences('setError(caught.message);')).toHaveLength(1);
    expect(
      offences("setStatus({ kind: 'error', text: error instanceof Error ? error.message : String(error) });"),
    ).toHaveLength(1);
    expect(offences('<StatusMessage kind="error">{error.message}</StatusMessage>')).toHaveLength(1);
  });

  it('accepts a translated wrapper or apiErrorText', () => {
    expect(offences('setError(apiErrorText(cause));')).toEqual([]);
    expect(offences('setError(t.submitFailed(cause instanceof Error ? cause.message : String(cause)));')).toEqual([]);
    expect(offences('<StatusMessage kind="error">{t.error(load.message)}</StatusMessage>')).toEqual([]);
    expect(
      offences("setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });"),
    ).toEqual([]);
  });

  it('finds none in src/ui/*.tsx', () => {
    const problems: string[] = [];
    for (const file of uiTsx(UI_ROOT)) {
      for (const hit of offences(readFileSync(file, 'utf8'))) {
        problems.push(`${file.slice(UI_ROOT.length + 1)}:${hit}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
