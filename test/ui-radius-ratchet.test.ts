/**
 * Radius ratchet (#1650): every single-line control is a pill (`--radius-full`). A rule that still sets
 * `border-radius: var(--radius-sm)` must be listed below with a reason (a menu item in an open panel, a
 * container, a card, a textarea, a checkbox, an input owned by another task). A new small-radius rule on a
 * button therefore fails this test until it is either made a pill or added to the allowlist with a reason.
 * Reads the stylesheet as text, so no DOM is needed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'app.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** Selector (as written in app.css) to the reason it keeps the small radius. */
const SMALL_RADIUS_ALLOWLIST: Record<string, string> = {
  '.skip-link': 'skip link, not a control',
  '.warning': 'message box, a container',
  '.person-switcher-item': 'menu item inside an open person switcher panel (owner answer 4)',
  '.app-nav-item, .app-nav-group-toggle': 'navigation menu item (owner answer 4)',
  '.app-nav-menu-item': 'menu item inside the open nav menu (owner answer 4)',
  '.selection-sabian': 'content panel, a container',
  '.chart-shape-diagram-wrap': 'diagram container',
  '.command-palette-option':
    'row inside the open command palette, a menu item in an open panel (owner answer 4; added with #1654)',
  '.horary-considerations li': 'list item, not a control',
  '.focus-interpretation': 'text container',
  '.corpus-entry-key': 'text container',
  '.corpus-candidate-text': 'text container',
  '.text-diff-removed, .text-diff-added': 'diff highlight, not a control',
  '.fixed-star-results': 'results container',
  '.settings-card-note': 'note container',
  ".primitive-field input:not([type='checkbox']):not([type='radio']), .primitive-field select, .primitive-field textarea":
    'the base field rule now only shapes textareas and checkboxes, which keep the small radius by design; selects and every single-line input are pills by later rules (#1600 WP5/WP7; owner, #1865)',
  '.primitive-option-card': 'option card, a container (owner answer 4 keeps the small radius on option containers)',
  '.page-header-export-item': 'menu item inside the open Export menu (owner answer 4)',
  '.settings-card-defaults-item':
    'menu item inside the open Defaults menu (owner decision on #1650, 2026-11-17: 5.25px)',
  '.primitive-disclosure': 'disclosure container',
  '.consultation-context': 'card, a container',
  '.consultation-note-confirm': 'note container',
  '.pdf-summary-card': 'card, a container',
  '.note-fork': 'container',
  '.gantt-plot': 'plot container',
  ".primitive-pill-select-card [role='radio']": 'option row inside an open PillSelect card (owner answer 4)',
};

/** Every rule whose declaration block sets exactly `border-radius: var(--radius-sm);`, by its selector. */
function smallRadiusSelectors(source: string): string[] {
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  const selectors: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = rule.exec(source)) !== null) {
    if (/border-radius:\s*var\(--radius-sm\)\s*;/.test(match[2] ?? '')) {
      selectors.push((match[1] ?? '').trim().replace(/\s+/g, ' '));
    }
  }
  return selectors;
}

describe('border-radius ratchet (#1650)', () => {
  it('keeps the small radius only on the allowlisted, non-button selectors', () => {
    const found = [...new Set(smallRadiusSelectors(css))].sort();
    expect(found).toEqual(Object.keys(SMALL_RADIUS_ALLOWLIST).sort());
  });

  it('gives every allowlist entry a one-line reason', () => {
    for (const [selector, reason] of Object.entries(SMALL_RADIUS_ALLOWLIST)) {
      expect(reason.length, selector).toBeGreaterThan(0);
      expect(reason.includes('\n'), selector).toBe(false);
    }
  });

  it('gives the base button and the pill triggers the full radius', () => {
    const pillSelectors = [
      'button',
      '.primitive-button-primary',
      '.chart-overlay-trigger',
      '.chart-pdf-link',
      '.page-header-export-toggle',
      '.profile-tile',
      // The route link styled as a quiet button (Consultation's Open interpretation and Build PDF, People's import link).
      'a.quiet',
    ];
    const rule = /([^{}]+)\{([^{}]*)\}/g;
    const pillRules: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = rule.exec(css)) !== null) {
      const listed = (match[1] ?? '').split(',').map((s) => s.trim());
      if (
        pillSelectors.some((s) => listed.includes(s)) &&
        /border-radius:\s*var\(--radius-full\)/.test(match[2] ?? '')
      ) {
        pillRules.push(...listed.filter((s) => pillSelectors.includes(s)));
      }
    }
    expect([...new Set(pillRules)].sort()).toEqual([...pillSelectors].sort());
  });
});
