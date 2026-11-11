/**
 * Issue 1356: the badge, corpus tag chip, Sabian insight tag and settings card tag share one base rule, and no
 * badge tone reads an astrology token. Read from `app.css` itself.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, '../src/ui/app.css'), 'utf-8');
const CLASSES = ['.primitive-badge', '.corpus-tag-chip', '.sabian-insight-tag', '.settings-card-tag'];

describe('badge base (issue 1356)', () => {
  const m = /((?:\.[a-z-]+,\n)+\.[a-z-]+) \{([^}]*)\}/g;
  const baseGroups = () => [...css.matchAll(m)].filter((g) => CLASSES.every((c) => g[1]?.includes(c)));

  it('declares size and line height once for all four classes', () => {
    const groups = baseGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]?.[2]).toMatch(/font-size: var\(--text-xs\);/);
    expect(groups[0]?.[2]).toMatch(/line-height: 1\.4;/);
  });

  it('declares display, padding, border and radius in the same shared base rule', () => {
    const body = baseGroups()[0]?.[2] ?? '';
    expect(body).toMatch(/display: inline-block;/);
    expect(body).toMatch(/padding: 0\.1rem var\(--space-2\);/);
    expect(body).toMatch(/border: 1px solid var\(--line\);/);
    expect(body).toMatch(/border-radius: 999px;/);
  });

  it('keeps the Sabian tag block-level as its one documented display override', () => {
    expect(css).toMatch(/\.sabian-insight-tag \{\n {2}display: block;/);
  });

  it('does not set a font size on the four classes elsewhere', () => {
    for (const c of CLASSES) {
      const own = new RegExp(`(?<!,\\n)^${c.replace('.', '\\.')} \\{([^}]*)\\}`, 'm').exec(css);
      expect(own?.[1] ?? '', c).not.toMatch(/font-size/);
    }
  });

  it('has no astrology token in any badge tone', () => {
    const tones = [...css.matchAll(/\.primitive-badge\[data-tone='[a-z]+'\] \{([^}]*)\}/g)];
    expect(tones.length).toBeGreaterThan(0);
    for (const t of tones) expect(t[1]).not.toMatch(/--aspect-/);
    expect(css).not.toMatch(/data-tone='(soft|hard)'/);
  });
});
