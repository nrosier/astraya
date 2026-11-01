/**
 * #975 — the PDF builder's card surfaces and sticky summary are token-only CSS rules in app.css.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

/** The rule block for a selector in app.css, at any indent: from `selector {` to the next closing brace. */
function ruleFor(selector: string): string {
  const start = css.search(new RegExp(`^\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`, 'm'));
  if (start === -1) return '';
  return css.slice(start, css.indexOf('}', start) + 1);
}

describe('PDF builder card and sticky CSS (#975)', () => {
  it('makes the summary wrapper sticky at top 1.5rem, inside the desktop container query only', () => {
    expect(ruleFor('.pdf-summary-sticky')).toMatch(/position: sticky;\s*top: 1\.5rem;/);
    const query = css.indexOf('@container pdf-builder (min-width: 64rem) {');
    const sticky = css.indexOf('.pdf-summary-sticky {');
    const queryEnd = css.indexOf('\n}\n', query);
    expect(query).toBeGreaterThan(-1);
    expect(sticky).toBeGreaterThan(query);
    expect(sticky).toBeLessThan(queryEnd);
  });

  it('styles the card surface with semantic tokens and no colour literals', () => {
    const block = ruleFor('.pdf-builder-card');
    expect(block).toContain('var(--surface)');
    expect(block).toContain('var(--line)');
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
  });
});
