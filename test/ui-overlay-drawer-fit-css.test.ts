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

describe('Life Events drawer height (#1506/#1439)', () => {
  const drawer = readFileSync(new URL('../src/ui/LifeEventsDrawer.tsx', import.meta.url), 'utf8');

  it('reuses the shared drawer-fit rule on the right-anchored main drawer and keeps its own class', () => {
    expect(drawer).toMatch(/dialogClassName="[^"]*\blife-events-drawer\b[^"]*"/);
    expect(drawer).toMatch(
      /dialogClassName="[^"]*\bdrawer-fit\b[^"]*\blife-events-drawer\b|dialogClassName="[^"]*\blife-events-drawer\b[^"]*\bdrawer-fit\b/,
    );
    expect(drawer).toMatch(/placement="right"[\s\S]{0,80}dialogClassName="[^"]*\bdrawer-fit\b/);
  });
});

/**
 * Owner decision 2026-11-12 (#1508): every multi-row drawer is a bottom sheet at 40rem (640px) and narrower, including
 * the Change filters dialog. One shared rule, switched on by `phoneSheet` (-> data-sheet="phone") on the StagedDialog.
 * Single-message dialogs (sign-in, reconcile prompt, saved interpretations, PDF picker) are not marked.
 */
describe('multi-row drawers are phone bottom sheets (#1508)', () => {
  const MULTI_ROW = [
    'TransitFilterPanel.tsx',
    'ExtendedSettingsPanel.tsx',
    'MapSettingsDialog.tsx',
    'ChartOverlaySettingsPanel.tsx',
    'CorpusOverridesPanel.tsx',
    'CorpusCorrectionEditor.tsx',
    'SuggestCorrectionDialog.tsx',
    'LifeEventsDrawer.tsx',
  ];
  const NOT_SHEETS = [
    'AccountPanel.tsx',
    'AccountPreferencesNotices.tsx',
    'SavedInterpretationsPanel.tsx',
    'PdfAiInterpretationPicker.tsx',
  ];
  const read = (file: string): string => readFileSync(new URL(`../src/ui/${file}`, import.meta.url), 'utf8');

  it.each(MULTI_ROW)('%s marks its dialog as a phone sheet', (file) => {
    expect(read(file)).toMatch(/<StagedDialog\b[^>]*?\sphoneSheet\b/s);
  });

  it.each(NOT_SHEETS)('%s (a single-message dialog) is not marked', (file) => {
    expect(read(file)).not.toMatch(/\bphoneSheet\b/);
  });

  it('StagedDialog turns the prop into data-sheet="phone"', () => {
    expect(read('primitives/StagedDialog.tsx')).toMatch(/'data-sheet': 'phone'/);
  });

  it('one rule under max-width 40rem makes the marked dialog a bottom sheet, with the Life Events values', () => {
    const phone =
      /@media \(max-width: 40rem\) \{\s*\.primitive-staged-dialog\[data-sheet='phone'\]\[open\] \{([^}]*)\}/.exec(css);
    expect(phone).not.toBeNull();
    expect(phone?.[1]).toContain('width: 100vw;');
    expect(phone?.[1]).toContain('height: fit-content;');
    expect(phone?.[1]).toContain('max-height: calc(100dvh - 2 * var(--space-8));');
    expect(phone?.[1]).toContain('margin: auto 0 0;');
    expect(phone?.[1]).toContain('border-radius: var(--radius) var(--radius) 0 0;');
    expect(phone?.[1]).not.toContain('92dvh');
    expect(css).toMatch(
      /\.primitive-staged-dialog\[data-sheet='phone'\] \.settings-card-header::before \{[^}]*content: '';/,
    );
  });

  it('the desktop drawer-fit cap stays at the viewport minus 4rem and the Life Events rule is not duplicated', () => {
    expect(css).toMatch(/\.drawer-fit \{[^}]*max-height: calc\(100dvh - 2 \* var\(--space-8\)\);/);
    expect(css).not.toContain(
      ".primitive-staged-dialog.life-events-drawer[data-placement='right'] {\n    width: 100vw",
    );
  });
});
