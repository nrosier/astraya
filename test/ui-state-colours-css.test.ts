/**
 * Issue 1348: the four state tokens (danger, warning, success, info) carry their own literal hex in every theme block,
 * never an alias of an astrology token, and each reaches 3:1 on both --surface and --bg of its theme (WCAG 1.4.11).
 * Read from `app.css` itself, so a changed value is measured rather than assumed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, '../src/ui/app.css'), 'utf-8');

function block(selector: string, from = 0): string {
  const start = css.indexOf(selector, from);
  if (start === -1) throw new Error(`block not found: ${selector}`);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('\n}', open));
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const STATES = ['danger', 'warning', 'success', 'info'] as const;
const mediaLight = css.indexOf('@media (prefers-color-scheme: light)');
const BLOCKS = {
  dark: [block(':root {'), block(":root[data-theme='dark']")],
  light: [block(':root {', mediaLight), block(":root[data-theme='light']")],
} as const;

function declared(body: string, name: string): string {
  const m = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(body);
  if (m?.[1] === undefined) throw new Error(`--color-${name} missing`);
  return m[1].trim();
}

function token(body: string, name: string): string {
  const m = new RegExp(`\\n\\s*--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(body);
  if (m?.[1] === undefined) throw new Error(`--${name} missing`);
  return m[1];
}

describe('state colour tokens (issue 1348)', () => {
  for (const theme of ['dark', 'light'] as const) {
    for (const [i, body] of BLOCKS[theme].entries()) {
      describe(`${theme} block ${String(i)}`, () => {
        for (const state of STATES) {
          it(`--color-${state} is a literal hex, not an astrology alias`, () => {
            const value = declared(body, state);
            expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(value).not.toMatch(/var\(|--aspect|--solar|--element|--ring/);
          });
          it(`--color-${state} reaches 3:1 on --surface and --bg`, () => {
            const value = declared(body, state);
            expect(contrast(value, token(body, 'surface'))).toBeGreaterThanOrEqual(3);
            expect(contrast(value, token(body, 'bg'))).toBeGreaterThanOrEqual(3);
          });
        }
      });
    }
  }

  it('the two blocks of each theme agree', () => {
    for (const theme of ['dark', 'light'] as const) {
      for (const state of STATES) {
        expect(declared(BLOCKS[theme][0], state)).toBe(declared(BLOCKS[theme][1], state));
      }
    }
  });

  it('no state token value is reused by an astrology token in the same theme', () => {
    for (const theme of ['dark', 'light'] as const) {
      const body = BLOCKS[theme][1];
      const astro = [...body.matchAll(/--(?:aspect|element|ring|solar)[a-z0-9-]*:\s*(#[0-9a-fA-F]{6});/g)].map((m) =>
        (m[1] ?? '').toLowerCase(),
      );
      for (const state of STATES) expect(astro).not.toContain(declared(body, state).toLowerCase());
    }
  });
});
