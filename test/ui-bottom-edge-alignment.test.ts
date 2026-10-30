/**
 * Bottom-edge rule for multi-card pages (#895, `docs/ui/UI-UX_GUIDELINES.md` section 10.1). The rendered heights are
 * measured in `e2e/viewport-matrix.spec.ts`; this file pins the CSS contract that makes the stretch possible: the
 * side-by-side rows stretch, no card is given a fixed height to match a neighbour, and the guideline records the
 * 90% standard.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/ui/app.css', 'utf8');
const guidelines = readFileSync('docs/ui/UI-UX_GUIDELINES.md', 'utf8');

/** The declarations of the first rule whose selector list is exactly `selector`. */
function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (match === null) throw new Error(`no rule for ${selector}`);
  return match[2] ?? '';
}

describe('bottom-edge alignment of multi-card rows (#895)', () => {
  it('stretches the consultation and horary rows so side-by-side cards share one bottom edge', () => {
    expect(declarations('.consultation-grid')).toMatch(/align-items:\s*stretch/);
    expect(declarations('.horary-form')).toMatch(/align-items:\s*stretch/);
  });

  it('keeps the horary parameters card on the full row, never beside an empty track', () => {
    expect(declarations('.horary-card--wide')).toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });

  it('sets no fixed height or min-height on the cards, so sizes follow content', () => {
    for (const selector of ['.horary-card', '.consultation-col', '.consultation-grid']) {
      expect(declarations(selector), selector).not.toMatch(/(^|[\s;])(min-)?height:/);
    }
  });

  it('records the 90% standard in the UI guidelines', () => {
    expect(guidelines).toMatch(/Shorter column is at least about 90% of the taller column/);
  });
});
