/**
 * #1732 — the Export / Import card's Import tab (owner visual review, 2026-11-18): no separator under the tab
 * pills, and tighter spacing between the pills and the Import text and above the Import File pill. Token-only CSS
 * rules in app.css, scoped to the birth-record card.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

describe('Export / Import card Import tab spacing (#1732)', () => {
  it('draws no separator under the tab pills on the birth-record card', () => {
    expect(ruleBody('.birth-record-card--files .tab-row__viewport')).toContain('border-bottom: none;');
  });

  it('puts the tab row one spacing token (--space-3) closer to the Import text', () => {
    expect(ruleBody('.birth-record-card--files .tab-row')).toContain('margin-bottom: var(--space-3);');
  });

  it('puts the Import File pill closer to its hint (hint bottom --space-2, pill wrapper no top margin)', () => {
    expect(ruleBody(".birth-record-card--files [role='tabpanel'] > .hint")).toContain('margin: 0 0 var(--space-2);');
    expect(ruleBody(".birth-record-card--files [role='tabpanel'] > p:has(> input[type='file'])")).toContain(
      'margin-top: 0;',
    );
  });

  it('sets the bottom margin under the Import File pill to 4.5px so the bottom gap matches the 19.5px top gap (#1732)', () => {
    expect(ruleBody(".birth-record-card--files [role='tabpanel'] > p:has(> input[type='file'])")).toContain(
      'margin-bottom: 4.5px;',
    );
  });
});
