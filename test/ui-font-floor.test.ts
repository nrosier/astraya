/**
 * Guards the UI's small-text floor: no `font-size` in `app.css` may be below 0.75rem
 * (10.5px). Print-only rules are exempt, since paper is read at a different distance.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FLOOR_REM = 0.75;

const css = readFileSync(join(import.meta.dirname, '../src/ui/app.css'), 'utf-8');

/** Removes every `@media print { ... }` block, matching braces so nested rules go too. */
function stripPrintBlocks(source: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const start = source.indexOf('@media print', i);
    if (start === -1) return out + source.slice(i);
    out += source.slice(i, start);
    let depth = 0;
    let j = source.indexOf('{', start);
    for (; j < source.length; j++) {
      if (source[j] === '{') depth++;
      else if (source[j] === '}' && --depth === 0) break;
    }
    i = j + 1;
  }
}

describe('UI font-size floor', () => {
  it('has no font-size below 0.75rem outside @media print', () => {
    const offenders: string[] = [];
    for (const [, value, unit] of stripPrintBlocks(css).matchAll(/font-size:\s*([0-9.]+)(rem|px)\b/g)) {
      const rem = Number(value) / (unit === 'px' ? 16 : 1);
      if (rem < FLOOR_REM) offenders.push(`${value}${unit}`);
    }
    expect(offenders).toEqual([]);
  });
});
