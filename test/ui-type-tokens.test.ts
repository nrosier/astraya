/**
 * Guards the type scale in src/ui/app.css (#1352): a literal font-size within
 * 0.01rem of a --text-* token must use the token, and any other rem literal in
 * the migrated set (0.8rem, 0.875rem, 0.9rem) must carry an explanatory comment.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');
const lines = css.split('\n');

const tokens = new Map<string, number>();
for (const line of lines) {
  const m = /^\s*--(text-(?:xs|sm|base|lg|xl|2xl)):\s*([\d.]+)rem;/.exec(line);
  if (m?.[1] && m[2]) tokens.set(m[1], Number(m[2]));
}

const MIGRATED = new Set([0.8, 0.875, 0.9]);
const TOLERANCE = 0.01 + 1e-9;

interface Literal {
  line: number;
  text: string;
  rem: number;
}

const literals: Literal[] = [];
lines.forEach((text, i) => {
  const m = /font-size:\s*([\d.]+)rem\b/.exec(text);
  if (m?.[1] && MIGRATED.has(Number(m[1]))) {
    literals.push({ line: i + 1, text, rem: Number(m[1]) });
  }
});

describe('type-scale tokens in app.css', () => {
  it('finds the token definitions', () => {
    expect(tokens.get('text-xs')).toBe(0.79);
    expect(tokens.get('text-sm')).toBe(0.889);
  });

  it('has no literal within 0.01rem of a token', () => {
    const drift = literals.filter((l) => [...tokens.values()].some((v) => Math.abs(v - l.rem) <= TOLERANCE));
    expect(drift.map((l) => `${String(l.line)}: ${l.text.trim()}`)).toEqual([]);
  });

  it('comments every remaining literal in the migrated set', () => {
    const bare = literals.filter((l) => !/\/\*.+\*\//.test(l.text));
    expect(bare.map((l) => `${String(l.line)}: ${l.text.trim()}`)).toEqual([]);
  });
});
