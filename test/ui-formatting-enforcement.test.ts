/**
 * No screen formats a date, a number or an amount its own way (#513): everything shown goes through the helpers in
 * `ui/format.ts` (and `ui/saved-time.ts`), so a figure reads the same on every screen, in the CSV and in the PDF.
 * This fails when a new `toFixed`, `toLocale…String`, `Intl.NumberFormat`/`DateTimeFormat` or `toISOString().slice`
 * appears in the UI or domain layers outside them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FORBIDDEN =
  /\.toFixed\(|\.toLocale(?:Date|Time)?String\(|Intl\.(?:NumberFormat|DateTimeFormat)|\.toISOString\(\)\.slice\(/;

/** The shared formatters themselves, and data (not display) that is stamped in ISO form. */
const ALLOWED = new Set(['src/ui/format.ts', 'src/ui/saved-time.ts', 'src/domain/full-export.ts']);

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.messages.ts') ? [path] : [];
  });
}

describe('the shared formatters (#513)', () => {
  it('are the only place a date, number or amount is formatted in the UI and domain layers', () => {
    const offenders = [...sourceFiles('src/ui'), ...sourceFiles('src/domain')]
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => FORBIDDEN.test(readFileSync(file, 'utf-8')));
    expect(offenders).toEqual([]);
  });
});
