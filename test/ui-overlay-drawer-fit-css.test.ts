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

describe('icon-only circles take the shared circle size (#1650)', () => {
  it.each(['ChartOverlaySettingsPanel.tsx', 'DateAnimationBar.tsx', 'CorpusOverridesPanel.tsx'])(
    '%s marks its icon-only buttons with shape="circle"',
    (file) => {
      const source = readFileSync(new URL(`../src/ui/${file}`, import.meta.url), 'utf8');
      expect(source).toContain('shape="circle"');
    },
  );

  it('sizes .primitive-button-circle from the compact control height, with no padding', () => {
    const match = /button\.primitive-button-circle \{([^}]*)\}/.exec(css);
    expect(match?.[1]).toContain('width: var(--control-height-compact);');
    expect(match?.[1]).toContain('min-width: var(--control-height-compact);');
    expect(match?.[1]).toContain('padding: 0;');
  });
});

describe('date animation step buttons take the circle size (#1650)', () => {
  it('gives the step buttons no min-width from the step rule, so the circle class sets their size', () => {
    const match = /\.date-animation-bar \.date-animation-step \{([^}]*)\}/.exec(css);
    expect(match).not.toBeNull();
    expect(match?.[1]).not.toMatch(/min-width/);
  });

  it('keeps the min-width on the Play button, which has no circle class', () => {
    const match = /\.date-animation-bar \.date-animation-play \{([^}]*)\}/.exec(css);
    expect(match?.[1]).toContain('min-width: var(--control-height);');
  });
});

/**
 * Task 1650-7a (#1650): every action button in the Life events drawer and its card is a 2.75rem form action, so each
 * one carries `primitive-button-form-action`. Import CSV is rendered by FileInput, which takes the class through its
 * `className` prop, so the class sits on the FileInput element in the drawer source.
 */
describe('Life events form action buttons take the form-action class (#1650)', () => {
  const FORM_ACTION = 'primitive-button-form-action';
  const drawerSource = readFileSync(new URL('../src/ui/LifeEventsDrawer.tsx', import.meta.url), 'utf8');
  const cardSource = readFileSync(new URL('../src/ui/LifeEventsCard.tsx', import.meta.url), 'utf8');

  /**
   * The source of the element (`<Button` or `<FileInput`) that owns the first occurrence of `marker`. It runs from the
   * nearest opener before the marker to the marker itself, or, when `closing` is given, to the first `closing` after the
   * marker (a FileInput lists `className` after its label). Fails if the marker is absent or if the element is not one button.
   */
  function ownerTagOf(source: string, marker: string, closing?: string): string {
    const at = source.indexOf(marker);
    expect(at, `${marker} not found`).toBeGreaterThan(-1);
    const opener = [...source.slice(0, at).matchAll(/<(Button|FileInput)\b/g)].at(-1);
    expect(opener, `no button opens before ${marker}`).toBeDefined();
    const end = closing === undefined ? at + marker.length : source.indexOf(closing, at) + closing.length;
    const tag = source.slice(opener?.index ?? 0, end);
    expect(tag.match(/<(Button|FileInput)\b/g)?.length, `${marker} is not inside a single button`).toBe(1);
    return tag;
  }

  it.each([
    ['Save row', 'rowSave'],
    ['Cancel', 'rowCancel'],
    ['Add', 'quickAddButton'],
    ['Add new event', 'addNew'],
    ['Clear all', 'clearAll'],
    ['Export CSV', 'exportButton'],
  ])('the drawer %s button carries the class', (_name, key) => {
    expect(ownerTagOf(drawerSource, `{t.${key}}`)).toContain(`className="${FORM_ACTION}"`);
  });

  it('the Import CSV button, rendered by FileInput, carries the class through its className prop', () => {
    const tag = ownerTagOf(drawerSource, 'buttonLabel={t.importButton}', '/>');
    expect(tag).toMatch(/^<FileInput\b/);
    expect(tag).toContain(`className="${FORM_ACTION}"`);
  });

  it('the card Manage Life Events button carries the class', () => {
    expect(ownerTagOf(cardSource, '{t.manageButton}')).toContain(`className="${FORM_ACTION}"`);
  });
});
