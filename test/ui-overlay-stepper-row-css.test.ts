/**
 * #1615: in the chart overlay drawer the shared date stepper takes a grid row of its own, so the orb field never sits over its
 * step-forward button. The rule is scoped to the drawer's input grid: the bar on Transits, Progressions and Solar Arc is unchanged.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

describe('overlay drawer date stepper row (#1615)', () => {
  it('spans the whole input grid, scoped to the drawer', () => {
    const match = /\.chart-overlay-row-inputs > \.date-animation-bar-wrap \{([^}]*)\}/.exec(css);
    expect(match).not.toBeNull();
    expect(match?.[1]).toContain('grid-column: 1 / -1;');
  });
});
