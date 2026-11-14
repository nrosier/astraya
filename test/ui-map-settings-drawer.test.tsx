// @vitest-environment jsdom
/**
 * The Map settings drawer (#512, #1449): a staged `MapSettingsDialog` that edits a draft and hands the whole draft to
 * the caller only on Apply; Cancel and the other exits drop it. Mounted with `createRoot` and real DOM nodes, with a
 * small harness that holds the saved value the way the Astrocartography screen does. The height rule is checked as a
 * CSS string: the drawer carries `drawer-fit` and the shared rule caps it one --space-8 short of the viewport.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAP_SETTINGS, type LineType, type MapSettings } from '../src/ui/map-settings.js';
import { MapSettingsDialog } from '../src/ui/MapSettingsDialog.js';
import { mapSettingsDialogMessages } from '../src/ui/MapSettingsDialog.messages.js';

const t = mapSettingsDialogMessages.en;
const LINE_LABELS: Readonly<Record<LineType, string>> = {
  MC: 'Midheaven line',
  IC: 'Nadir line',
  AC: 'Ascendant line',
  DC: 'Descendant line',
};

/** Holds the applied settings, as the screen does: only an Apply reaches it. */
function Harness({ onApply }: { readonly onApply: (next: MapSettings) => void }): React.JSX.Element {
  const [saved, setSaved] = useState<MapSettings>(DEFAULT_MAP_SETTINGS);
  return (
    <>
      <span data-testid="saved-local-space">{String(saved.localSpace)}</span>
      <span data-testid="saved-line-types">{saved.lineTypes.join(',')}</span>
      <MapSettingsDialog
        applied={saved}
        lineTypeLabels={LINE_LABELS}
        onApply={(next) => {
          onApply(next);
          setSaved(next);
        }}
      />
    </>
  );
}

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(onApply: (next: MapSettings) => void): void {
  act(() => {
    root.render(<Harness onApply={onApply} />);
  });
}

function dialog(): HTMLDialogElement {
  const found = container.querySelector<HTMLDialogElement>('dialog.primitive-staged-dialog');
  if (found === null) throw new Error('fixture bug: no map settings dialog');
  return found;
}

function isOpen(): boolean {
  return dialog().hasAttribute('open');
}

function buttonWhere(predicate: (button: HTMLButtonElement) => boolean, what: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find(predicate);
  if (found === undefined) throw new Error(`fixture bug: no button ${what}`);
  return found;
}

function openDrawer(): void {
  const trigger = buttonWhere((button) => button.textContent === t.trigger, t.trigger);
  act(() => {
    trigger.click();
  });
}

function checkbox(label: string): HTMLInputElement {
  const span = [...dialog().querySelectorAll<HTMLSpanElement>('label.primitive-choice > span')].find(
    (item) => item.textContent === label,
  );
  const input = span?.parentElement?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (input === null || input === undefined) throw new Error(`fixture bug: no checkbox "${label}"`);
  return input;
}

function toggle(label: string): void {
  act(() => {
    checkbox(label).click();
  });
}

function savedText(id: string): string | null | undefined {
  return container.querySelector(`[data-testid="${id}"]`)?.textContent;
}

describe('Map settings drawer staged draft (#512, #1449)', () => {
  it('stages a change until Apply: the saved setting is unchanged, then Apply saves it and closes', () => {
    const onApply = vi.fn();
    render(onApply);
    expect(savedText('saved-local-space')).toBe('false');

    openDrawer();
    expect(isOpen()).toBe(true);
    toggle(t.showLocalSpaceLines);

    // Before Apply: the draft shows the change, the saved setting does not, and nothing was committed.
    expect(checkbox(t.showLocalSpaceLines).checked).toBe(true);
    expect(savedText('saved-local-space')).toBe('false');
    expect(onApply).not.toHaveBeenCalled();

    const apply = buttonWhere((button) => button.getAttribute('aria-label') === t.apply, t.apply);
    expect(apply.disabled).toBe(false);
    act(() => {
      apply.click();
    });

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({ localSpace: true });
    expect(savedText('saved-local-space')).toBe('true');
    expect(isOpen()).toBe(false);
  });

  it('Discard (Cancel) drops an uncommitted change: nothing is saved and the next open starts from the saved value', () => {
    const onApply = vi.fn();
    render(onApply);

    openDrawer();
    toggle(LINE_LABELS.MC);
    expect(checkbox(LINE_LABELS.MC).checked).toBe(false);

    act(() => {
      buttonWhere((button) => button.textContent === t.cancel, t.cancel).click();
    });

    expect(isOpen()).toBe(false);
    expect(onApply).not.toHaveBeenCalled();
    expect(savedText('saved-line-types')).toBe('MC,IC,AC,DC');

    openDrawer();
    expect(checkbox(LINE_LABELS.MC).checked).toBe(true);
    expect(buttonWhere((button) => button.getAttribute('aria-label') === t.applyNothing, t.applyNothing).disabled).toBe(
      true,
    );
  });
});

describe('Map settings drawer height (#1449)', () => {
  it('carries the drawer-fit class on the right-anchored drawer', () => {
    render(vi.fn());
    openDrawer();
    expect(dialog().classList.contains('drawer-fit')).toBe(true);
    expect(dialog().getAttribute('data-placement')).toBe('right');
  });

  it('the drawer-fit CSS rule caps the height at calc(100dvh - 2 * var(--space-8))', () => {
    const css = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'app.css'), 'utf8');
    const rule = /\.primitive-staged-dialog\[data-placement='right'\]\.drawer-fit \{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule?.[1]).toContain('max-height: calc(100dvh - 2 * var(--space-8));');
  });
});
