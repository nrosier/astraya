/**
 * Owner visual review (2026-11-10, #1357/#1358): the chart overlay settings panel must not span the full height
 * of the screen; it uses the same fit-to-content, 80%-of-viewport height rule as the interpretation drawer (#1338).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/ui/ChartOverlaySettingsPanel.tsx', import.meta.url), 'utf8');

describe('chart overlay settings drawer height (#1357/#1358)', () => {
  it('reuses the shared drawer-fit height rule with the right-anchored placement', () => {
    expect(panel).toMatch(/dialogClassName="[^"]*\bdrawer-fit\b/);
    expect(panel).toMatch(/placement="right"/);
  });

  it('caps the drawer-fit height at one --space-8 short of the viewport and sizes it to content', () => {
    const match = /\.primitive-staged-dialog\[data-placement='right'\]\.drawer-fit \{([^}]*)\}/.exec(css);
    expect(match).not.toBeNull();
    expect(match?.[1]).toContain('height: fit-content;');
    expect(match?.[1]).toContain('max-height: calc(100dvh - 2 * var(--space-8));');
  });
});

describe('map and extended settings drawers height (#1449)', () => {
  it.each(['MapSettingsDialog.tsx', 'ExtendedSettingsPanel.tsx'])(
    '%s reuses the shared drawer-fit rule on its right-anchored drawer',
    (file) => {
      const source = readFileSync(new URL(`../src/ui/${file}`, import.meta.url), 'utf8');
      expect(source).toMatch(/dialogClassName="[^"]*\bdrawer-fit\b/);
      expect(source).toMatch(/placement="right"/);
    },
  );
});
