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
    const container = render(<FileInput buttonLabel="Restore from file…" primary onChange={() => undefined} />);
    const button = container.querySelector('button');
    expect(button?.classList.contains('primitive-button-primary')).toBe(true);
  });

  it('keeps the Check button secondary (no primary class) by default', () => {
    const container = render(<FileInput buttonLabel="Check a calculation file…" onChange={() => undefined} />);
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
