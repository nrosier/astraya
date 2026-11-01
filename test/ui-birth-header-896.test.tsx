// @vitest-environment jsdom
/**
 * The birth record's header (#896, owner spec 2026-11-01): Save sits top-right and reads "Saved ✓" when pristine and
 * "Save changes" as the primary action when dirty; a status dot sits inline with the name heading; the header's Export
 * dropdown sits beside Save and lists AAF, JSON and CSV (#887), and the EXPORT card keeps the same three downloads.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store.js';
import { ExportRegistryProvider } from '../src/ui/export-registry.js';
import { personFileActionsMessages } from '../src/ui/PersonFileActions.messages.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

const { PersonForm } = await import('../src/ui/PersonForm.js');
const { StoreProvider } = await import('../src/ui/store-context.js');

const tFiles = personFileActionsMessages.en;
let counter = 0;
let store: Store;
let root: Root | undefined;
let container: HTMLElement | undefined;

beforeEach(async () => {
  counter += 1;
  store = await openStore({ name: `astraya-birth-header-896-${String(counter)}` });
  await store.mutate([
    { entity: 'person', entityId: 'ada', field: 'displayName', value: 'Ada Lovelace' },
    { entity: 'person', entityId: 'ada', field: 'timeAccuracy', value: 'recorded' },
    {
      entity: 'person',
      entityId: 'ada',
      field: 'civil',
      value: { year: 1815, month: 12, day: 10, hour: 13, minute: 0, second: 0 },
    },
    { entity: 'person', entityId: 'ada', field: 'coordinates', value: { latitude: 51.5074, longitude: -0.1278 } },
  ]);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <StoreProvider store={store}>
        <ExportRegistryProvider>
          <PersonForm personId="ada" />
        </ExportRegistryProvider>
      </StoreProvider>,
    );
    await Promise.resolve();
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
});

function card(modifier: string): HTMLElement {
  const found = container?.querySelector<HTMLElement>(`section.birth-record-card--${modifier}`);
  if (found === null || found === undefined) throw new Error(`test fixture bug: no ${modifier} card`);
  return found;
}

function saveButton(): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>('.page-header-row .birth-record-save button');
  if (button === null || button === undefined) throw new Error('no Save button in the page header');
  return button;
}

function nameInput(): HTMLInputElement {
  const input = card('identity').querySelector<HTMLInputElement>('input');
  if (input === null) throw new Error('test fixture bug: no name input');
  return input;
}

function changeName(value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(nameInput(), value);
    nameInput().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('birth record header Export (#896 part 3)', () => {
  it('has an Export dropdown beside Save, listing the AAF, JSON and CSV downloads (#887, owner 2026-10-30)', async () => {
    const toggle = container?.querySelector<HTMLButtonElement>('.page-header-export-toggle');
    expect(toggle).not.toBeUndefined();
    await act(async () => {
      toggle?.click();
      await Promise.resolve();
    });
    const items = [...(container?.querySelectorAll('.page-header-export-item') ?? [])].map((item) => item.textContent);
    expect(items).toEqual([tFiles.exportAaf, tFiles.exportJson, tFiles.exportCsv]);
  });

  it('keeps AAF, JSON and CSV in the EXPORT card in the right column', () => {
    const files = card('files');
    expect(files.querySelector('h3')?.textContent).toBe(tFiles.heading);
    expect([...files.querySelectorAll('.birth-record-export-row button')].map((button) => button.textContent)).toEqual([
      tFiles.exportAaf,
      tFiles.exportJson,
      tFiles.exportCsv,
    ]);
  });
});

describe('birth record Save action (#896 part 1)', () => {
  it('is idle and not primary when pristine, reading Saved ✓', () => {
    expect(saveButton().disabled).toBe(true);
    expect(saveButton().textContent).toBe('Saved ✓');
    expect(saveButton().classList.contains('primitive-button-primary')).toBe(false);
  });

  it('becomes the primary Save changes action once any field changes', () => {
    changeName('Ada King');
    expect(saveButton().disabled).toBe(false);
    expect(saveButton().textContent).toBe('Save changes');
    expect(saveButton().classList.contains('primitive-button-primary')).toBe(true);
  });
});

describe('birth record status dot (#896 part 2)', () => {
  function status(): HTMLElement {
    const found = container?.querySelector<HTMLElement>('.page-header-row .birth-record-status');
    if (found === null || found === undefined) throw new Error('no save status dot in the page header');
    return found;
  }

  it('sits beside the name heading, in the same title group, and reports saved on a pristine record', () => {
    const heading = container?.querySelector('.page-header-row h1');
    expect(status().parentElement).toBe(heading?.parentElement);
    expect(status().previousElementSibling).toBe(heading);
    const button = status().querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('Status: Saved on this device');
    expect(status().querySelector('.sr-only')?.textContent).toBe('Status: Saved on this device');
    expect(status().querySelector('.birth-record-status-dot')).not.toBeNull();
  });

  it('reports unsaved changes once a field is changed', () => {
    changeName('Ada King');
    expect(status().querySelector('button')?.getAttribute('aria-label')).toBe('Status: Unsaved changes');
    expect(status().querySelector('.sr-only')?.textContent).toBe('Status: Unsaved changes');
  });

  it('shows the tooltip text in the popup on focus, reachable from the keyboard', () => {
    const button = status().querySelector<HTMLButtonElement>('button');
    act(() => {
      button?.focus();
    });
    const popup = container?.querySelector('[role="tooltip"]');
    expect(popup).not.toBeNull();
    expect(popup?.textContent).toBe('All changes saved on this device');
  });

  it('uses the success and warning tokens for the two dot colours', () => {
    const css = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'app.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const body = (selector: string): string =>
      [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].find((m) => (m[1] ?? '').trim() === selector)?.[2] ?? '';
    expect(body('.birth-record-status--saved .birth-record-status-dot')).toMatch(/var\(--color-success\)/);
    expect(body('.birth-record-status--unsaved .birth-record-status-dot')).toMatch(/var\(--color-warning\)/);
  });
});
