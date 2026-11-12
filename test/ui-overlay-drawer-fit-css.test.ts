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

describe('Life Events drawer height and phone bottom sheet (#1506/#1439)', () => {
  const drawer = readFileSync(new URL('../src/ui/LifeEventsDrawer.tsx', import.meta.url), 'utf8');

  it('reuses the shared drawer-fit rule on the right-anchored main drawer and keeps its own class', () => {
    expect(drawer).toMatch(/dialogClassName="[^"]*\blife-events-drawer\b[^"]*"/);
    expect(drawer).toMatch(
      /dialogClassName="[^"]*\bdrawer-fit\b[^"]*\blife-events-drawer\b|dialogClassName="[^"]*\blife-events-drawer\b[^"]*\bdrawer-fit\b/,
    );
    expect(drawer).toMatch(/placement="right"[\s\S]{0,80}dialogClassName="[^"]*\bdrawer-fit\b/);
  });

  it('phone: a bottom sheet at the bottom, sized to content, capped at the 4rem margin, with a close handle', () => {
    const phone =
      /@media \(max-width: 40rem\) \{\s*\.primitive-staged-dialog\.life-events-drawer\[data-placement='right'\] \{([^}]*)\}/.exec(
        css,
      );
    expect(phone).not.toBeNull();
    expect(phone?.[1]).toContain('height: fit-content;');
    expect(phone?.[1]).toContain('max-height: calc(100dvh - 2 * var(--space-8));');
    expect(phone?.[1]).toContain('margin: auto 0 0;');
    expect(phone?.[1]).not.toContain('92dvh');
    expect(css).toMatch(/\.life-events-drawer \.settings-card-header::before \{[^}]*content: '';/);
  });
});
