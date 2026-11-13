/**
 * Issue 1532: every colour token that carries text meets WCAG AA 4.5:1 and every token that carries a graphic meets
 * 3:1, on both --bg and --surface of each theme. Read from `app.css` itself, so a changed value is measured, not assumed.
 * Gradient and alpha tokens (rgb() with --glow-*, --backdrop, --shadow-*) are skipped: they are not solid colours.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, '../src/ui/app.css'), 'utf-8');

/** Body of the first `{...}` block that starts at or after `from`, matched by brace depth. */
function block(selector: string, from = 0): string {
  const start = css.indexOf(selector, from);
  if (start === -1) throw new Error(`block not found: ${selector}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unclosed block: ${selector}`);
}

/** Declared value of `--name` in a block body, or undefined when the block does not set it. */
function declared(body: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|[\\s;{])--${name}:\\s*([^;]+);`).exec(body);
  return m?.[1]?.trim();
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

const TEXT = [
  'fg',
  'muted',
  'accent',
  'solar',
  'element-fire',
  'element-earth',
  'element-air',
  'element-water',
  'aspect-hard',
  'aspect-soft',
  'aspect-minor',
  'color-danger',
  'color-warning',
  'color-success',
  'color-info',
] as const;

const GRAPHIC = [
  'color-tech-zr',
  'color-tech-firdaria',
  'color-tech-profection',
  'color-tech-pd',
  'color-tech-sec',
  'color-tech-sa',
  'color-tech-transit',
  'series-1',
  'series-2',
  'series-3',
  'series-4',
  'series-5',
  'series-6',
  'series-7',
  'series-8',
  'ring-1-color',
  'ring-2-color',
] as const;

/** Effective tokens per theme: the base block, then the theme block, the later one winning. */
const mediaLight = css.indexOf('@media (prefers-color-scheme: light)');
const THEMES = {
  dark: [block(':root {'), block(":root[data-theme='dark']")],
  light: [block(':root {', mediaLight), block(":root[data-theme='light']")],
} as const;

function effective(theme: keyof typeof THEMES, name: string): string {
  let value: string | undefined;
  for (const body of THEMES[theme]) value = declared(body, name) ?? value;
  if (value === undefined) throw new Error(`--${name} missing in ${theme}`);
  return value;
}

function hexOf(theme: keyof typeof THEMES, name: string): string {
  const value = effective(theme, name);
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`--${name} in ${theme} is not a solid hex: ${value}`);
  return value;
}

describe('palette WCAG AA contrast (issue 1532)', () => {
  for (const theme of ['dark', 'light'] as const) {
    for (const bg of ['bg', 'surface'] as const) {
      describe(`${theme} on --${bg}`, () => {
        for (const name of TEXT) {
          it(`--${name} reaches 4.5:1 text contrast (theme=${theme}, background=--${bg})`, () => {
            const ratio = contrast(hexOf(theme, name), hexOf(theme, bg));
            expect(ratio, `--${name} on --${bg} in ${theme}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
          });
        }
        for (const name of GRAPHIC) {
          it(`--${name} reaches 3:1 graphic contrast (theme=${theme}, background=--${bg})`, () => {
            const ratio = contrast(hexOf(theme, name), hexOf(theme, bg));
            expect(ratio, `--${name} on --${bg} in ${theme}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
          });
        }
      });
    }
  }
});
