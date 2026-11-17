/**
 * The pill row above the view bar keeps --space-3 of whitespace above the tab bar, so the pills do not touch it
 * (#1649 owner review 2026-11-17: "pills of chart type & consolation preset touch the pills of the menu bar").
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/ui/app.css'), 'utf-8');

describe('pill row above the tab bar (#1649)', () => {
  it('the chart controls row leaves --space-3 above the view bar', () => {
    const rule = /\.chart-controls-row \+ \.tab-row \{([^}]*)\}/.exec(css)?.[1];
    expect(rule).toContain('margin-top: var(--space-3);');
    expect(rule).toContain('margin-bottom: 0;');
  });
});
