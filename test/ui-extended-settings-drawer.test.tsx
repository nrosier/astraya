// @vitest-environment jsdom
/**
 * The Extended settings drawer (#824): a right-anchored `StagedDialog` with four tabbed categories, a pinned footer
 * (Save and Reset on the left; Cancel and Apply on the right), and a staged formula-point draft. A pending add or
 * delete is written only by Apply, and Cancel discards it (D-824b). Mounted with `createRoot` and real DOM nodes,
 * like `ui-extended-settings-panel.test.tsx`; the ephemeris provider is a hand-built fake, since no value is computed.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import type { CustomPointDefinition } from '../src/domain/person.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import type { RulershipChoice } from '../src/astrology/rulership.js';
import { ExtendedSettingsPanel } from '../src/ui/ExtendedSettingsPanel.js';
import type { FormulaProblem } from '../src/ui/custom-point-problem.js';
import { writeRulershipChoice } from '../src/ui/rulership-setting.js';

function notImplemented(): never {
  throw new Error('not used by this test');
}

function fakeProvider(): EphemerisProvider {
  return {
    initialize: notImplemented,
    julianDay: notImplemented,
    julianDayFromUtc: notImplemented,
    position: notImplemented,
    positions: notImplemented,
    houses: notImplemented,
    houseSystemName: (system) => Promise.resolve(`House system ${system}`),
    ayanamsa: notImplemented,
    obliquity: notImplemented,
    ayanamsaName: (mode) => Promise.resolve(`Ayanamsa ${String(mode)}`),
    fixedStar: notImplemented,
    fixedStarMagnitude: notImplemented,
    nextSunCrossing: notImplemented,
    nextMoonCrossing: notImplemented,
    nextSolarEclipse: notImplemented,
    nextLunarEclipse: notImplemented,
    azimuthAltitude: notImplemented,
    version: notImplemented,
    dispose: notImplemented,
  };
}

afterEach(() => {
  localStorage.clear();
  writeRulershipChoice('modern');
  document.body.innerHTML = '';
});

const SAVED: readonly CustomPointDefinition[] = [
  { id: 'p-fortune', name: 'Fortune check', formula: 'Asc + Moon - Sun' },
  { id: 'p-spirit', name: 'Spirit check', formula: 'Asc + Sun - Moon' },
];

/** The formula section shows only where a save callback exists (#824), as on the chart screens. */
const NO_SAVE = (): Promise<void> => Promise.resolve();

async function mount(
  customPoints: readonly CustomPointDefinition[] | undefined,
  onRedraw: (next: ExtendedSettings, rulers: RulershipChoice) => void,
  onCustomPointsChange: (next: readonly CustomPointDefinition[]) => Promise<void> = NO_SAVE,
  checkFormula?: (formula: string) => FormulaProblem | undefined,
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ExtendedSettingsPanel
        value={DEFAULT_EXTENDED_SETTINGS}
        rulership="modern"
        onRedraw={onRedraw}
        provider={fakeProvider()}
        customPoints={customPoints}
        onCustomPointsChange={onCustomPointsChange}
        {...(checkFormula === undefined ? {} : { checkFormula })}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

function unmount(container: HTMLElement, root: Root): void {
  act(() => {
    root.unmount();
  });
  container.remove();
}

const trigger = (container: HTMLElement): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>('button.extended-settings-trigger');
  if (found === null) throw new Error('fixture bug: no trigger');
  return found;
};

const drawer = (container: HTMLElement): HTMLDialogElement => {
  const found = container.querySelector<HTMLDialogElement>('dialog');
  if (found === null) throw new Error('fixture bug: no dialog');
  return found;
};

function openDrawer(container: HTMLElement): void {
  act(() => {
    trigger(container).click();
  });
}

function buttonNamed(container: HTMLElement, name: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('dialog button')).find(
    (button) => button.textContent.trim() === name,
  );
}

function clickButton(container: HTMLElement, name: string): void {
  const button = buttonNamed(container, name);
  if (button === undefined) throw new Error(`fixture bug: no button "${name}"`);
  act(() => {
    button.click();
  });
}

function typeInto(input: HTMLInputElement, text: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** The name and formula inputs in the formula section, found by their labels. */
function formulaInputs(container: HTMLElement): { name: HTMLInputElement; formula: HTMLInputElement } {
  const fieldset = Array.from(container.querySelectorAll('dialog fieldset')).find(
    (candidate) => candidate.querySelector('legend')?.textContent === 'Custom formula points',
  );
  const inputs = Array.from(fieldset?.querySelectorAll<HTMLInputElement>('input[type="text"]') ?? []);
  const [name, formula] = inputs;
  if (name === undefined || formula === undefined) throw new Error('fixture bug: no formula inputs');
  return { name, formula };
}

function formulaRowNames(container: HTMLElement): readonly string[] {
  const fieldset = Array.from(container.querySelectorAll('dialog fieldset')).find(
    (candidate) => candidate.querySelector('legend')?.textContent === 'Custom formula points',
  );
  // The name cell carries a draft tag beside the name; only the name itself is compared.
  return Array.from(fieldset?.querySelectorAll('tbody tr td:first-child') ?? []).map((cell) =>
    Array.from(cell.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join('')
      .trim(),
  );
}

describe('the drawer structure (#824)', () => {
  it('is a right-anchored drawer, not a centred card', async () => {
    const { container, root } = await mount(undefined, vi.fn());
    openDrawer(container);
    expect(drawer(container).getAttribute('data-placement')).toBe('right');
    expect(drawer(container).classList.contains('settings-card')).toBe(true);
    unmount(container, root);
  });

  it('pins Save and Reset on the left, and Cancel and Apply on the right of one footer', async () => {
    const { container, root } = await mount(undefined, vi.fn());
    openDrawer(container);
    const footer = drawer(container).querySelector('.settings-card-footer');
    expect(footer).not.toBeNull();
    const [left, right] = Array.from(footer?.querySelectorAll(':scope > .settings-card-footer-group') ?? []);
    expect(Array.from(left?.querySelectorAll('button') ?? []).map((button) => button.textContent.trim())).toEqual([
      'Save as my default',
      'Reset to my default',
    ]);
    expect(Array.from(right?.querySelectorAll('button') ?? []).map((button) => button.textContent.trim())).toEqual([
      'Cancel',
      'Apply and redraw',
    ]);
    unmount(container, root);
  });

  it('has the four categories as tabs, in the order a chart is set up', async () => {
    const { container, root } = await mount(undefined, vi.fn());
    openDrawer(container);
    const tabs = Array.from(drawer(container).querySelectorAll('[role="tab"]')).map((tab) => tab.textContent);
    expect(tabs).toEqual(['Profile & frame', 'Bodies & orbs', 'Display & glyphs', 'Special points']);
    unmount(container, root);
  });

  it('gives the visibility matrix the Object, Visible, Aspects and Reports columns', async () => {
    const { container, root } = await mount(undefined, vi.fn());
    openDrawer(container);
    const headers = Array.from(drawer(container).querySelectorAll('.data-table table thead th'))
      .slice(0, 4)
      .map((th) => th.textContent.replace('?', '').trim());
    expect(headers).toEqual(['Object', 'Visible', 'Aspects', 'Reports']);
    unmount(container, root);
  });

  it('has a single Reset to my default button, not a factory-reset menu', async () => {
    const { container, root } = await mount(undefined, vi.fn());
    openDrawer(container);
    const resets = Array.from(drawer(container).querySelectorAll('button')).filter((button) =>
      button.textContent.includes('Reset'),
    );
    expect(resets.map((button) => button.textContent.trim())).toEqual(['Reset to my default']);
    unmount(container, root);
  });
});

describe('the staged formula draft (#824, D-824b)', () => {
  it('shows the saved points as the list, with nothing pending', async () => {
    const { container, root } = await mount(SAVED, vi.fn());
    openDrawer(container);
    expect(formulaRowNames(container)).toEqual(['Fortune check', 'Spirit check']);
    expect(buttonNamed(container, 'Apply and redraw')?.disabled).toBe(true);
    unmount(container, root);
  });

  it('a pending add is not saved until Apply, and Cancel discards it', async () => {
    const onCustomPointsChange = vi.fn<(next: readonly CustomPointDefinition[]) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const onRedraw = vi.fn();
    const { container, root } = await mount(SAVED, onRedraw, onCustomPointsChange);
    openDrawer(container);

    const { name, formula } = formulaInputs(container);
    typeInto(name, 'Staged point');
    typeInto(formula, 'Asc + Sun - MC');
    clickButton(container, 'Add formula point');
    // Staged: the row shows, the draft is dirty, and nothing has been written.
    expect(formulaRowNames(container)).toContain('Staged point');
    expect(buttonNamed(container, 'Apply and redraw')?.disabled).toBe(false);
    expect(onCustomPointsChange).not.toHaveBeenCalled();

    clickButton(container, 'Cancel');
    expect(onCustomPointsChange).not.toHaveBeenCalled();
    expect(drawer(container).hasAttribute('open')).toBe(false);

    openDrawer(container);
    expect(formulaRowNames(container)).toEqual(['Fortune check', 'Spirit check']);
    unmount(container, root);
  });

  it('a pending delete is not saved until Apply, and Cancel restores the point', async () => {
    const onCustomPointsChange = vi.fn<(next: readonly CustomPointDefinition[]) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const onRedraw = vi.fn();
    const { container, root } = await mount(SAVED, onRedraw, onCustomPointsChange);
    openDrawer(container);

    clickButton(container, 'Remove Fortune check');
    // Still in the draft, marked removed; nothing written yet.
    expect(drawer(container).textContent).toContain('Removed, saved on Apply');
    expect(onCustomPointsChange).not.toHaveBeenCalled();
    expect(buttonNamed(container, 'Apply and redraw')?.disabled).toBe(false);

    clickButton(container, 'Cancel');
    expect(onCustomPointsChange).not.toHaveBeenCalled();

    openDrawer(container);
    expect(formulaRowNames(container)).toEqual(['Fortune check', 'Spirit check']);
    unmount(container, root);
  });

  it('Apply saves the whole staged list once, with the add and the delete together', async () => {
    const onCustomPointsChange = vi.fn<(next: readonly CustomPointDefinition[]) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const onRedraw = vi.fn();
    const { container, root } = await mount(SAVED, onRedraw, onCustomPointsChange);
    openDrawer(container);

    clickButton(container, 'Remove Fortune check');
    const { name, formula } = formulaInputs(container);
    typeInto(name, 'Staged point');
    typeInto(formula, 'Asc + Sun - MC');
    clickButton(container, 'Add formula point');
    clickButton(container, 'Apply and redraw');

    expect(onCustomPointsChange).toHaveBeenCalledTimes(1);
    const saved = onCustomPointsChange.mock.calls[0]?.[0] ?? [];
    expect(saved.map((point) => point.name)).toEqual(['Spirit check', 'Staged point']);
    expect(saved.find((point) => point.name === 'Fortune check')).toBeUndefined();
    unmount(container, root);
  });

  it('refuses a duplicate name in the draft and says so, without staging it', async () => {
    const { container, root } = await mount(SAVED, vi.fn());
    openDrawer(container);
    const { name, formula } = formulaInputs(container);
    typeInto(name, 'fortune check');
    typeInto(formula, 'Asc + Sun');
    clickButton(container, 'Add formula point');
    expect(drawer(container).textContent).toContain('A formula point already uses this name.');
    expect(formulaRowNames(container)).toEqual(['Fortune check', 'Spirit check']);
    unmount(container, root);
  });

  it('refuses a formula the chart check rejects, with the chart check’s own reason', async () => {
    const check = vi.fn((formula: string): FormulaProblem | undefined =>
      formula === 'Sun + Moon' ? { kind: 'redundant', name: 'sun' } : undefined,
    );
    const { container, root } = await mount([], vi.fn(), undefined, check);
    openDrawer(container);
    const { name, formula } = formulaInputs(container);
    typeInto(name, 'Dup');
    typeInto(formula, 'Sun + Moon');
    clickButton(container, 'Add formula point');
    expect(check).toHaveBeenCalledWith('Sun + Moon');
    expect(drawer(container).textContent).toContain('This formula duplicates the built-in sun point.');
    expect(formulaRowNames(container)).toEqual([]);
    unmount(container, root);
  });
});

describe('the drawer width (#824, D-824c)', () => {
  it('caps the drawer at 42rem through the --drawer-max-width token, and is full width below it', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/app.css'), 'utf-8');
    expect(css).toMatch(/--drawer-max-width:\s*42rem;/);
    expect(css).toMatch(/width:\s*min\(var\(--drawer-max-width\),\s*100vw\);/);
  });

  it('lets the matrix headings and cells wrap inside the drawer, so long Dutch labels do not widen it', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/app.css'), 'utf-8');
    const rule = /\.primitive-staged-dialog\[data-placement='right'\] \.data-table td \{([^}]*)\}/.exec(css);
    expect(rule?.[1]).toMatch(/white-space:\s*normal;/);
    expect(rule?.[1]).toMatch(/overflow-wrap:\s*anywhere;/);
  });
});
