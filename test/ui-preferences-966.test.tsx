// @vitest-environment jsdom
/**
 * Preferences standardisation (#966, finish pass): the empty orb-profile state, the 60/40 rows for the symbol and
 * orb-assignment selects, the muted symbol-helper callouts and the rulership option grid, the primary Restore action,
 * and the Data & privacy copy. Each assertion here is one open box on the issue that the code on main did not meet.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { OrbLibraryEditor } from '../src/ui/OrbLibraryEditor.js';
import { FileInput } from '../src/ui/primitives/FileInput.js';
import { PreferencesRow } from '../src/ui/PreferencesRow.js';
import { SymbolSetting } from '../src/ui/SymbolSetting.js';
import { preferencesViewMessages } from '../src/ui/PreferencesView.messages.js';

const ROOT = join(__dirname, '..');
const appCss = readFileSync(join(ROOT, 'src/ui/app.css'), 'utf-8');
const preferencesSource = readFileSync(join(ROOT, 'src/ui/PreferencesView.tsx'), 'utf-8');

/** The declaration block of the first top-level rule whose selector is exactly `selector`. */
function ruleBlock(selector: string): string {
  const start = appCss.indexOf(`\n${selector} {`);
  if (start === -1) return '';
  return appCss.slice(start, appCss.indexOf('}', start) + 1);
}

let mounted: { container: HTMLElement; root: Root } | undefined;

function render(element: React.ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  mounted = { container, root };
  return container;
}

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
});

describe('#966 orb profiles empty state', () => {
  it('shows the shared EmptyState with the Add orb profile action when no profiles exist', () => {
    const container = render(<OrbLibraryEditor profiles={[]} sources={{}} />);
    const empty = container.querySelector('.primitive-empty-state');
    expect(empty).not.toBeNull();
    const add = [...(empty?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Add orb profile',
    );
    expect(add).toBeDefined();
  });

  it('assigns each chart type (natal, transit, synastry) in a 60/40 row', () => {
    const container = render(<OrbLibraryEditor profiles={[]} sources={{}} />);
    expect(container.querySelectorAll('.preferences-row').length).toBe(3);
  });
});

describe('#966 symbol rendering rows and helper callouts', () => {
  it('lays each symbol select out as a 60/40 row when rows is set', () => {
    const container = render(<SymbolSetting rows />);
    // Symbols, line weight, Uranus and Pluto.
    expect(container.querySelectorAll('.preferences-row').length).toBe(4);
  });

  it('styles the helper callout with semantic tokens only, no literal colours', () => {
    const block = ruleBlock('.symbol-setting-description');
    expect(block).not.toBe('');
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).not.toMatch(/\b(?:white|black)\b/);
    expect(block).toContain('var(--muted)');
  });
});

describe('#966 rulership option grid', () => {
  it('lays the Modern / Traditional / Both cards out as a grid on the Preferences page', () => {
    expect(preferencesSource).toContain('className="preferences-rulership"');
    const block = ruleBlock('.preferences-rulership .primitive-option-cards');
    expect(block).toContain('display: grid');
    expect(block).toContain('grid-template-columns');
  });
});

describe('#966 Import & diagnostics primary action', () => {
  it('renders the Restore button as the primary variant when primary is set', () => {
    const container = render(<FileInput buttonLabel="Restore from File..." primary onChange={() => undefined} />);
    const button = container.querySelector('button');
    expect(button?.classList.contains('primitive-button-primary')).toBe(true);
  });

  it('keeps the Check button secondary (no primary class) by default', () => {
    const container = render(<FileInput buttonLabel="Check Calculation File..." onChange={() => undefined} />);
    const button = container.querySelector('button');
    expect(button?.classList.contains('primitive-button-primary')).toBe(false);
  });
});

describe('#966 Data & privacy copy and action labels', () => {
  const en = preferencesViewMessages.en;
  const nl = preferencesViewMessages.nl;

  it('describes the data export as the issue specifies', () => {
    expect(en.exportEverythingHint).toBe('Export birth records, natal charts, and people data stored on this device.');
    expect(nl.exportEverythingHint).not.toBe(en.exportEverythingHint);
  });

  it('labels the three export actions Export JSON (Full), Export CSV and Export AAF', () => {
    expect(en.exportEverything).toBe('Export JSON (Full)');
    expect(en.exportPeopleCsv).toBe('Export CSV');
    expect(en.exportPeopleAaf).toBe('Export AAF');
    expect(nl.exportEverything).not.toBe(en.exportEverything);
    expect(nl.exportPeopleCsv).not.toBe(en.exportPeopleCsv);
    expect(nl.exportPeopleAaf).not.toBe(en.exportPeopleAaf);
  });
});

describe('#966 Preferences tab labels', () => {
  it('uses the title-case English tab labels the spec names', () => {
    expect(preferencesViewMessages.en.tabLabels).toEqual({
      appearance: 'Appearance & Accessibility',
      astrology: 'Astrology Defaults',
      data: 'Data & Privacy',
    });
  });
});

describe('#1185 compact Appearance layout', () => {
  it('puts the symbol notes in info tooltips, with no callout paragraphs, in the Preferences rows', () => {
    const container = render(<SymbolSetting rows />);
    expect(container.querySelector('.symbol-setting-description, .symbol-setting-note, .hint')).toBeNull();
    // One keyboard-reachable info icon on each of the four rows (symbols, line weight, Uranus, Pluto).
    const triggers = container.querySelectorAll('.preferences-row .primitive-tooltip-icon button');
    expect(triggers).toHaveLength(4);
    expect(Array.from(triggers).map((trigger) => trigger.getAttribute('aria-label'))).toEqual([
      'About Symbols',
      'About Line weight',
      'About Uranus variant',
      'About Pluto variant',
    ]);
  });

  it('keeps the explanatory callouts in the stacked chart-drawer form', () => {
    const container = render(<SymbolSetting />);
    expect(container.querySelector('.symbol-setting-description')).not.toBeNull();
    expect(container.querySelector('.preferences-row')).toBeNull();
  });

  it('shows a row description only when no info icon replaces it', () => {
    const container = render(
      <>
        <PreferencesRow title="One" description="Words under it">
          <span />
        </PreferencesRow>
        <PreferencesRow title="Two" info="Words in a tooltip" infoLabel="About Two">
          <span />
        </PreferencesRow>
      </>,
    );
    const rows = container.querySelectorAll('.preferences-row');
    expect(rows[0]?.querySelector('.preferences-row-description')?.textContent).toBe('Words under it');
    expect(rows[0]?.querySelector('.primitive-tooltip-icon')).toBeNull();
    expect(rows[1]?.querySelector('.preferences-row-description')).toBeNull();
    expect(rows[1]?.querySelector('.primitive-tooltip-icon button')?.getAttribute('aria-label')).toBe('About Two');
  });

  it('lays the Appearance groups out in a grid that is two columns from 1024px and one below', () => {
    expect(preferencesSource).toContain('className="preferences-grid"');
    expect(ruleBlock('.preferences-grid')).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(appCss).toMatch(
      /@media \(min-width: 1024px\) \{\s*\.preferences-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    );
  });

  it('has an en and nl label for every info icon', () => {
    expect(preferencesViewMessages.en.infoLabel('Language')).toBe('About Language');
    expect(preferencesViewMessages.nl.infoLabel('Taal')).toBe('Over Taal');
  });
});
