/**
 * Every native select is a pill (#1600 WP5, owner answer A1): the shared `.primitive-field select` rule uses the
 * full-pill radius token and a wider inline padding, and text, number and date fields keep the square radius.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/ui/app.css'), 'utf-8');

/** Every rule block whose selector list mentions a select inside .primitive-field and sets a border-radius. */
const radiusRules = [
  ...css.matchAll(/(?:^|\n)([^\n{}/*]*\.primitive-field select[^{]*)\{([^}]*border-radius[^}]*)\}/g),
];

describe('native select pill shape (#1600 WP5)', () => {
  it('.primitive-field select uses the full-pill radius and a wider inline padding', () => {
    const base = radiusRules.filter((m) => m[1]?.trim() === '.primitive-field select');
    expect(base).toHaveLength(1);
    expect(base[0]?.[2]).toContain('border-radius: var(--radius-full);');
    expect(base[0]?.[2]).toContain('padding-inline: var(--space-4);');
  });

  it('a native select and a PillSelect pill share the 2.75rem height', () => {
    expect(radiusRules.find((m) => m[1]?.trim() === '.primitive-field select')?.[2]).toContain('min-height: 2.75rem;');
    expect(css).toMatch(/\.primitive-pill-select-pill \{[^}]*height: 2\.75rem;/);
    expect(css).toMatch(/\.chart-type-select \.primitive-field select \{[^}]*height: 2\.75rem;/);
  });

  it('no local override gives a select its own radius (the shared text-field group is overridden by the select rule)', () => {
    const others = radiusRules.filter((m) => m[1]?.trim() !== '.primitive-field select' && !m[1]?.includes('textarea'));
    expect(others.map((m) => m[1]?.trim())).toEqual([]);
  });

  it('the shared text-field rule keeps the square radius', () => {
    expect(css).toMatch(
      /\.primitive-field textarea \{\s*padding: var\(--space-1\) var\(--field-padding-x\);\s*border: 1px solid var\(--line\);\s*border-radius: var\(--radius-sm\);/,
    );
  });
});
