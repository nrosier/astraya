/**
 * The full-pill radius is one design token (#1600, WP1): `--radius-full: 999px` is defined once in the `:root` block of
 * `src/ui/app.css`, and no other rule repeats the 999px literal. Reads the stylesheet as text, so no DOM is needed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'app.css'), 'utf8');

describe('--radius-full design token (#1600)', () => {
  it('defines 999px exactly once, as the --radius-full token', () => {
    expect(css.match(/999px/g)).toHaveLength(1);
    expect(css).toMatch(/^\s*--radius-full:\s*999px;/m);
  });

  it('declares --radius-full in the :root block, beside --radius and --radius-sm', () => {
    const root = /:root\s*\{[\s\S]*?\n\}/.exec(css)?.[0] ?? '';
    expect(root).toContain('--radius: ');
    expect(root).toContain('--radius-sm: ');
    expect(root).toContain('--radius-full: 999px;');
  });

  it('gives every full-pill border-radius the token, never a literal', () => {
    const literalPills = css.match(/border-radius:\s*(?:999|9999)\w*/g) ?? [];
    expect(literalPills).toEqual([]);
    expect((css.match(/border-radius:\s*var\(--radius-full\)/g) ?? []).length).toBeGreaterThanOrEqual(18);
  });
});
