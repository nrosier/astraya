/**
 * #1732 — the Export / Import card's owner verdict (2026-11-18): the tab strip sits flush with the card's top padding
 * (tablist margin-top 0), and the active tab keeps the solid accent fill decided on #1650. Token-only CSS in app.css.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

describe('Export / Import card verdict (#1732)', () => {
  it('sets the tab row margin-top to 0 so the strip sits flush with the card top padding', () => {
    expect(ruleBody('.birth-record-card--files .tab-row')).toContain('margin-top: 0;');
  });

  it('keeps the active tab on the solid accent fill (#1650), not a muted surface', () => {
    expect(ruleBody('.tab.active,\n.tab.active:hover:not(:disabled)')).toContain('background: var(--accent);');
  });
});
