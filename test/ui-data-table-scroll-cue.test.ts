/**
 * #1229 — the shared `.data-table-scroll` frame draws its scroll fade only where columns are hidden. The local cover
 * layers (which hide the fade once an end is reached, or when the table fits) must be as wide as the fades they cover;
 * #1076 made them narrower, which left a band on both sides of tables that fit.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');
const start = css.search(/^\.data-table-scroll \{/m);
const block = css.slice(start, css.indexOf('}', start) + 1).replace(/\/\*[\s\S]*?\*\//g, '');

describe('data table scroll cue (#1229)', () => {
  it('sizes every cover and fade layer from one width, so a cover always hides its fade', () => {
    expect(block).toMatch(/--scroll-cue-width: var\(--space-6\);/);
    expect(block.match(/\/ var\(--scroll-cue-width\) 100% no-repeat/g)).toHaveLength(4);
    expect(block).not.toMatch(/\/ var\(--space-\d+\) 100%/);
  });

  it('paints two local covers over two scroll fades, with tokens only', () => {
    expect(block.match(/ local (?:left|right)/g)).toHaveLength(2);
    expect(block.match(/ scroll (?:left|right)/g)).toHaveLength(2);
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
