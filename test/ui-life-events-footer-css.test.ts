/**
 * #1666: at phone width (max-width 40rem) the Life events drawer footer may wrap, so Save and close stays inside the
 * 390px viewport. The rule is scoped to the Life events drawer; the other drawers keep their nowrap footer rules.
 * The measured fit at 390x844 in English and Dutch is asserted in e2e/life-events-footer-fit.spec.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');
const drawer = readFileSync(new URL('../src/ui/LifeEventsDrawer.tsx', import.meta.url), 'utf8');

const phoneBlock = /@media \(max-width: 40rem\) \{([\s\S]*?)\n\}/.exec(
  css.slice(css.indexOf('.settings-drawer-tabs-narrow {')),
);

describe('Life events footer wraps at phone width (#1666)', () => {
  it('marks the drawer as a phone sheet and the footer groups sit inside its footer', () => {
    expect(drawer).toMatch(/<StagedDialog\b[^>]*?\sphoneSheet\b/s);
    expect(drawer).toMatch(/dialogClassName="[^"]*\blife-events-drawer\b/);
    expect(drawer.match(/className="settings-card-footer-group"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('allows the Life events footer and its groups to wrap inside the 40rem block', () => {
    expect(phoneBlock).not.toBeNull();
    const block = phoneBlock?.[1] ?? '';
    expect(block).toMatch(
      /\.primitive-staged-dialog\.life-events-drawer\[data-sheet='phone'\] \.settings-card-footer,\s*\.life-events-drawer \.settings-card-footer-group \{\s*flex-wrap: wrap;\s*\}/,
    );
  });

  it('keeps the footer buttons on one line each (labels are not clipped, heights unchanged)', () => {
    const button = /\.settings-card-footer-group button \{([^}]*)\}/.exec(css);
    expect(button?.[1]).toContain('white-space: nowrap;');
    expect(button?.[1]).toContain('height: var(--control-height);');
  });

  it('does not make the footer wrap for every drawer (other footers keep nowrap at phone width)', () => {
    const block = phoneBlock?.[1] ?? '';
    expect(block).toMatch(/\.primitive-staged-dialog\[data-placement='right'\] \.settings-card-footer,/);
    expect(block).toMatch(/\.settings-card-footer-group \{\s*flex-wrap: nowrap;/);
    expect(block).not.toMatch(/^\s*\.settings-card-footer-group \{\s*flex-wrap: wrap;/m);
  });
});
