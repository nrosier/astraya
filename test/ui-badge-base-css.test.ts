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
  it('declares size and line height once for all four classes', () => {
    const m = /((?:\.[a-z-]+,\n)+\.[a-z-]+) \{([^}]*)\}/g;
    const groups = [...css.matchAll(m)].filter((g) => CLASSES.every((c) => g[1]?.includes(c)));
    expect(groups).toHaveLength(1);
    expect(groups[0]?.[2]).toMatch(/font-size: var\(--text-xs\);/);
    expect(groups[0]?.[2]).toMatch(/line-height: 1\.4;/);
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
