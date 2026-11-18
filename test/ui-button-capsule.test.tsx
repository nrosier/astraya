// @vitest-environment jsdom
/**
 * The Button capsule shape (#1600): only small inline actions (matrix All/Clear/None, the transit
 * filter All/Clear, the seven-star preset) are capsules; menu and popover triggers are pills by CSS (#1650).
 * The Button circle shape (#1650): an icon-only control, equal width and height at the compact control height.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '../src/ui/primitives/Button.js';

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  if (root !== undefined) {
    const mounted = root;
    act(() => {
      mounted.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

function mount(element: React.JSX.Element): HTMLElement {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const mounted = root;
  act(() => {
    mounted.render(element);
  });
  return container;
}

describe('Button shape', () => {
  it('adds the capsule class for shape="capsule" and keeps the size class', () => {
    const button = mount(
      <Button shape="capsule" size="compact">
        All
      </Button>,
    ).querySelector('button');
    expect(button?.classList.contains('primitive-button-capsule')).toBe(true);
    expect(button?.classList.contains('primitive-button-compact')).toBe(true);
  });

  it('adds no capsule class by default', () => {
    const button = mount(<Button>Export</Button>).querySelector('button');
    expect(button?.classList.contains('primitive-button-capsule')).toBe(false);
  });

  it('adds the circle class for shape="circle" and no capsule class (#1650)', () => {
    const button = mount(
      <Button shape="circle" aria-label="Close">
        ×
      </Button>,
    ).querySelector('button');
    expect(button?.classList.contains('primitive-button-circle')).toBe(true);
    expect(button?.classList.contains('primitive-button-capsule')).toBe(false);
  });
});

describe('.primitive-button-circle', () => {
  it('has equal width and height from the compact control height, with a full radius and no padding (#1650)', () => {
    const css = readFileSync('src/ui/app.css', 'utf-8');
    const rule = /\.primitive-button-circle,\s*button\.primitive-button-circle\s*\{([^}]*)\}/.exec(css);
    const body = rule?.[1] ?? '';
    expect(body).toMatch(/width:\s*var\(--control-height-compact\);/);
    expect(body).toMatch(/height:\s*var\(--control-height-compact\);/);
    expect(body).toMatch(/min-height:\s*var\(--control-height-compact\);/);
    expect(body).toMatch(/padding:\s*0;/);
    expect(body).toMatch(/border-radius:\s*var\(--radius-full\);/);
  });
});

describe('.primitive-button-capsule', () => {
  it('uses the full radius token and nothing else', () => {
    const css = readFileSync('src/ui/app.css', 'utf-8');
    const rule = /\.primitive-button-capsule,\s*button\.primitive-button-capsule\s*\{([^}]*)\}/.exec(css);
    expect(rule?.[1]?.trim()).toBe('border-radius: var(--radius-full);');
  });
});

/** The inline actions (#1600 WP4) plus the Cancel, Apply and Save buttons of forms and drawers (#1600 WP7),
 * and the Search events button of the Ephemeris research form (#1600 owner answer, 2026-11-16). */
const EXPECTED_CAPSULE_FILES = [
  'AccountPreferencesNotices.tsx',
  'AdminPanel.tsx',
  'BirthPlaceSearch.tsx',
  'ChartOverlaySettingsPanel.tsx',
  'ChartSearchPanel.tsx',
  'ChartSearchResults.tsx',
  'CorpusCorrectionEditor.tsx',
  'CorpusOverridesPanel.tsx',
  'CorpusSubmissionsSection.tsx',
  'DateAnimationBar.tsx',
  'EventSearchView.tsx',
  'ExtendedSettingsPanel.tsx',
  'FixedStarPicker.tsx',
  'LifeEventsDrawer.tsx',
  'MapSettingsDialog.tsx',
  'OrbLibraryEditor.tsx',
  'People.tsx',
  'PersonFileActions.tsx',
  'PersonForm.tsx',
  'RelocatedChartView.tsx',
  'SavedChartSearches.tsx',
  'SavedQueries.tsx',
  'ScrollingTabRow.tsx',
  'SortableTable.tsx',
  'SuggestCorrectionDialog.tsx',
  'TimingTimelineView.tsx',
  'TransitFilterPanel.tsx',
  'table-selection.tsx',
];

describe('capsule call sites', () => {
  const files = readdirSync('src/ui')
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => ({ name, source: readFileSync(`src/ui/${name}`, 'utf-8') }));

  it('is passed only by the inline actions and the form action buttons (#1600 WP7)', () => {
    const using = files.filter((f) => f.source.includes('shape="capsule"')).map((f) => f.name);
    expect(using.sort()).toEqual(EXPECTED_CAPSULE_FILES);
  });

  it('gives the Export and Techniques triggers the pill radius by CSS (#1650, reverses A2 of #1600)', () => {
    // The owner reversed A2 on 2026-11-16 (#1650 owner answers): menu and popover triggers (Export, Techniques,
    // the person switcher) are pills. They take the full radius from app.css rather than the capsule class.
    const css = readFileSync('src/ui/app.css', 'utf-8');
    for (const selector of ['.chart-overlay-trigger', '.page-header-export-toggle', '.chart-pdf-link']) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rule = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
      expect(rule?.[1], selector).toMatch(/border-radius:\s*var\(--radius-full\);/);
    }
  });
});
