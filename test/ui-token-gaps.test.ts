/**
 * #826 S5: CSS guards for the token gaps. Item 5 (entry keys use tabular numerals, not the browser
 * monospace), item 11 (overridden-entry border), item 13 (table headers are muted `--text-xs`, never uppercase) and item 14 (the canvas
 * colour is `--bg`, never the literal #0b0d14).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_DIR = join(import.meta.dirname, '..', 'src', 'ui');
const css = readFileSync(join(UI_DIR, 'app.css'), 'utf8');

interface Rule {
  selector: string;
  body: string;
}

const rules: Rule[] = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selector: (m[1] ?? '').trim(),
  body: m[2] ?? '',
}));

const rulesFor = (test: (selector: string) => boolean): Rule[] => rules.filter((r) => test(r.selector));

describe('token gaps (#826)', () => {
  it('item 5: .entry-key uses tabular numerals and the inherited family', () => {
    const entryKey = rulesFor((s) => s === '.entry-key');
    expect(entryKey).toHaveLength(1);
    const body = entryKey[0]?.body ?? '';
    expect(body).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(body).toMatch(/font-family:\s*inherit/);
  });

  it('item 5: no monospace family or new font file is declared', () => {
    expect(css).not.toMatch(/font-family:[^;]*monospace/i);
    expect(css).not.toMatch(/@font-face/);
  });

  it('item 13: table header controls and labels are muted --text-xs', () => {
    for (const selector of ['.data-table th button', '.data-table .data-table-label']) {
      const matches = rulesFor((s) =>
        s
          .split(',')
          .map((p) => p.trim())
          .includes(selector),
      );
      expect(matches.length, selector).toBeGreaterThan(0);
      const body = matches.map((r) => r.body).join('\n');
      expect(body, selector).toMatch(/font-size:\s*var\(--text-xs\)/);
      expect(body, selector).toMatch(/color:\s*var\(--muted\)/);
    }
  });

  it('item 13: no shared table header rule uppercases text', () => {
    const header = rulesFor((s) => /\.data-table[^,]*\bth\b|\.data-table-label/.test(s));
    expect(header.length).toBeGreaterThan(0);
    for (const rule of header) expect(rule.body, rule.selector).not.toMatch(/text-transform:\s*uppercase/);
  });

  it('item 11: an overridden corpus entry has a 2px --accent border on all four sides', () => {
    const overridden = rulesFor((s) => s === '.corpus-entry-overridden');
    expect(overridden).toHaveLength(1);
    expect(overridden[0]?.body ?? '').toMatch(/border:\s*2px solid var\(--accent\)/);
  });

  it('item 14: the canvas colour is --bg and the literal #0b0d14 is absent from app.css and src/ui/*.tsx', () => {
    expect(css).toMatch(/--bg:\s*#0b0c18/);
    expect(css.toLowerCase()).not.toContain('#0b0d14');
    for (const file of readdirSync(UI_DIR).filter((f) => f.endsWith('.tsx'))) {
      expect(readFileSync(join(UI_DIR, file), 'utf8').toLowerCase(), file).not.toContain('#0b0d14');
    }
  });
});
