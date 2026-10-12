/**
 * Control markup comes from the shared primitives (#514): no screen draws its own text/number/date input, select,
 * textarea, checkbox, radio or modal dialog. The only things allowed raw are controls the primitives deliberately do
 * not cover — a range slider — and the primitives themselves. A new raw control fails here, so a second visual or
 * behavioural version of a control cannot creep back in.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAW_CONTROL = /<(?:input|select|textarea|dialog)\b/g;
/** Specialised visualisation controls with no primitive, by the `type` they declare. */
const EXEMPT_INPUT_TYPES = new Set(['range']);

function screens(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'primitives' ? [] : screens(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('shared control primitives (#514)', () => {
  it('are the only place a raw input, select, textarea or dialog is written', () => {
    const offenders: string[] = [];
    for (const file of screens('src/ui')) {
      const source = readFileSync(file, 'utf-8')
        // Prose in comments may name the elements; only markup counts.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const match of source.matchAll(RAW_CONTROL)) {
        const tag = source.slice(match.index, source.indexOf('>', match.index) + 1);
        const type = /type="(\w+)"/.exec(tag)?.[1];
        if (type !== undefined && EXEMPT_INPUT_TYPES.has(type)) continue;
        offenders.push(`${file}: ${tag.slice(0, 40)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
