/**
 * #1868 — the seven single-control exceptions are gone from `app.css`: the corpus chip's × and the drawer's
 * up/down/close buttons take their size from the shared circle button, the page-header Export is compact like the
 * other header actions, and the phone tab-row actions use the shared compact height. Reads the stylesheet as text.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

/** Every declaration block whose selector list contains `selector` (as one whole comma-separated selector). */
function blocksFor(selector: string): string[] {
  const blocks: string[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of css.matchAll(pattern)) {
    const selectors = (match[1] ?? '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(',')
      .map((s) => s.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  return blocks;
}

describe('specific-control exceptions removed (#1868)', () => {
  it('A: no .corpus-tag-chip button rule exists', () => {
    expect(blocksFor('.corpus-tag-chip button')).toEqual([]);
  });

  it('G: no .page-header-actions .page-header-export-toggle rule sets min-height', () => {
    for (const block of blocksFor('.page-header-actions .page-header-export-toggle')) {
      expect(block).not.toMatch(/min-height/);
    }
  });

  it('E: the phone tab-row action buttons use the compact control height', () => {
    const blocks = blocksFor('.tab-row__actions-panel > .extended-settings > button');
    const sized = blocks.filter((block) => block.includes('min-height'));
    expect(sized.length).toBeGreaterThan(0);
    for (const block of sized) expect(block).toMatch(/min-height:\s*var\(--control-height-compact\)/);
  });

  it('F: no .chart-overlay-row-order button rule sets width or height', () => {
    const blocks = blocksFor('.chart-overlay-row-order button');
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).not.toMatch(/(^|[;\s])(width|height)\s*:/);
    }
  });

  it('B/C: no theme-toggle, language-toggle or link corner-pill rules remain', () => {
    expect(css).not.toMatch(/\.theme-toggle|\.language-toggle|a\.corner-pill/);
  });
});
