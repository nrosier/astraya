/**
 * #1353 / #1359 — the type-scale tokens for 0.75rem, 0.85rem and 1.05rem, and the single
 * monospace family token. CSS-reading test against src/ui/app.css, following
 * test/ui-type-tokens.test.ts.
 *
 * (a) the three new --text-* tokens exist in the first :root block with their values;
 * (b) no literal 0.75rem, 0.85rem or 1.05rem font-size remains unless its line carries a comment;
 * (c) code and pre use var(--font-mono), and no other rule sets a monospace family.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');
const lines = css.split('\n');

/** The first :root block: the design tokens near the top of app.css. */
const rootStart = css.indexOf(':root {');
const rootEnd = css.indexOf('}', rootStart);
const rootBlock = css.slice(rootStart, rootEnd);

/** The declaration block of the first rule whose selector text is exactly `selector`. */
function blockOf(selector: string): string {
  const match = new RegExp(`^${selector} \\{([^}]*)\\}`, 'm').exec(css);
  expect(match, `rule ${selector}`).not.toBeNull();
  return match?.[1] ?? '';
}

const NEW_TOKENS: [string, string][] = [
  ['text-2xs', '0.75rem'],
  ['text-caption', '0.85rem'],
  ['text-md', '1.05rem'],
];

const MIGRATED = new Set(['0.75', '0.85', '1.05']);
const MONO_WORDS = /mono|courier|consolas|menlo|sfmono/i;

describe('type-scale tokens and monospace token in app.css (#1353, #1359)', () => {
  it('defines the three new type-scale tokens in :root with their values', () => {
    for (const [name, value] of NEW_TOKENS) {
      expect(rootBlock).toMatch(new RegExp(`--${name}:\\s*${value.replace('.', '\\.')};`));
    }
  });

  it('leaves no uncommented literal 0.75rem, 0.85rem or 1.05rem font-size', () => {
    const bare: string[] = [];
    lines.forEach((text, i) => {
      const m = /font-size:\s*([\d.]+)rem\b/.exec(text);
      if (m?.[1] && MIGRATED.has(m[1]) && !/\/\*.+\*\//.test(text)) {
        bare.push(`${String(i + 1)}: ${text.trim()}`);
      }
    });
    expect(bare).toEqual([]);
  });

  it('sets the monospace token on code and pre', () => {
    expect(blockOf('code')).toMatch(/font-family:\s*var\(--font-mono\);/);
    expect(blockOf('pre')).toMatch(/font-family:\s*var\(--font-mono\);/);
  });

  it('sets no monospace family in any other rule', () => {
    const offenders: string[] = [];
    lines.forEach((text, i) => {
      const m = /(?:^|[\s;{])(?:font-family|font)\s*:\s*([^;}]*)/.exec(text);
      if (!m?.[1]) return;
      const value = m[1].replace(/var\(--font-mono\)/g, '');
      if (MONO_WORDS.test(value)) offenders.push(`${String(i + 1)}: ${text.trim()}`);
    });
    expect(offenders).toEqual([]);
  });
});
