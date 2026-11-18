// @vitest-environment jsdom
/**
 * The birth record's single Export / Import card (#1732): one card with Export / Import pill tabs. Export is the
 * default tab, the tab strip is the card's heading (so the card carries an aria-label), each tab shows only its own
 * panel, and the arrow, Home and End keys move between the two tabs.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store.js';
import { personFileActionsMessages } from '../src/ui/PersonFileActions.messages.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

const { PersonForm } = await import('../src/ui/PersonForm.js');
const { StoreProvider } = await import('../src/ui/store-context.js');
const { setLocale } = await import('../src/ui/locale.js');

const tFiles = personFileActionsMessages.en;
const tFilesNl = personFileActionsMessages.nl;
let counter = 0;
let store: Store;
let root: Root | undefined;
let container: HTMLElement | undefined;

beforeEach(async () => {
  counter += 1;
  store = await openStore({ name: `astraya-person-file-tabs-${String(counter)}` });
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
  act(() => {
    root?.render(
      <StoreProvider store={store}>
        <PersonForm personId="ada" />
      </StoreProvider>,
    );
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
    setLocale('en');
  });
  container?.remove();
});

function fileCard(): HTMLElement {
  const found = container?.querySelector<HTMLElement>('.birth-record section.birth-record-card--files');
  if (found === undefined || found === null) throw new Error('test fixture bug: no files card');
  return found;
}

function tablist(card: HTMLElement): HTMLElement {
  const found = card.querySelector<HTMLElement>('[role="tablist"]');
  if (found === null) throw new Error('test fixture bug: no tablist');
  return found;
}

function tabs(card: HTMLElement): HTMLButtonElement[] {
  return [...tablist(card).querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

function importTab(card: HTMLElement): HTMLButtonElement {
  const found = tabs(card)[1];
  if (found === undefined) throw new Error('test fixture bug: no Import tab');
  return found;
}

function buttonTexts(scope: Element): (string | null)[] {
  return [...scope.querySelectorAll('button')].map((button) => button.textContent);
}

function exportRow(card: HTMLElement): HTMLElement | null {
  return card.querySelector<HTMLElement>('.birth-record-export-row');
}

function selectTab(tab: HTMLButtonElement): void {
  act(() => {
    tab.click();
  });
}

function pressKey(target: HTMLElement, key: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

describe('Export / Import card with pill tabs (#1732)', () => {
  it('is one card named by its aria-label, with a tablist of Export and Import', () => {
    const card = fileCard();
    expect(card.getAttribute('aria-label')).toBe(tFiles.cardLabel);
    expect(tablist(card).getAttribute('aria-label')).toBe(tFiles.tabsLabel);
    expect(tabs(card).map((tab) => tab.textContent)).toEqual([tFiles.heading, tFiles.replaceHeading]);
    expect(document.querySelectorAll('.birth-record-card--files')).toHaveLength(1);
    expect(document.querySelectorAll('.birth-record-card--replace')).toHaveLength(0);
  });

  it('selects Export by default and shows only the AAF, JSON and CSV buttons with no file input', () => {
    const card = fileCard();
    const [exportTab, importTab] = tabs(card);
    expect(exportTab?.getAttribute('aria-selected')).toBe('true');
    expect(importTab?.getAttribute('aria-selected')).toBe('false');
    expect(buttonTexts(card)).toEqual(expect.arrayContaining([tFiles.exportAaf, tFiles.exportJson, tFiles.exportCsv]));
    expect(exportRow(card)?.querySelectorAll('button').length).toBe(3);
    expect(card.querySelector('input[type="file"]')).toBeNull();
    expect(card.textContent).toContain(tFiles.exportHint);
  });

  it('shows the Import File control and hides the three download buttons when Import is selected', () => {
    const card = fileCard();
    selectTab(importTab(card));
    expect(tabs(card)[1]?.getAttribute('aria-selected')).toBe('true');
    expect(card.querySelector('input[type="file"]')).not.toBeNull();
    expect(buttonTexts(card)).toContain(tFiles.importButton);
    expect(exportRow(card)).toBeNull();
    expect(buttonTexts(card)).not.toContain(tFiles.exportAaf);
    expect(buttonTexts(card)).not.toContain(tFiles.exportJson);
    expect(buttonTexts(card)).not.toContain(tFiles.exportCsv);
  });

  it('moves between the tabs with the arrow keys, and Home and End go to the first and last tab', () => {
    const card = fileCard();
    const list = tablist(card);
    const [exportTab, importTab] = tabs(card);

    pressKey(list, 'ArrowRight');
    expect(importTab?.getAttribute('aria-selected')).toBe('true');
    expect(exportTab?.getAttribute('aria-selected')).toBe('false');
    expect(card.querySelector('input[type="file"]')).not.toBeNull();

    pressKey(list, 'ArrowLeft');
    expect(exportTab?.getAttribute('aria-selected')).toBe('true');
    expect(card.querySelector('input[type="file"]')).toBeNull();

    pressKey(list, 'End');
    expect(importTab?.getAttribute('aria-selected')).toBe('true');

    pressKey(list, 'Home');
    expect(exportTab?.getAttribute('aria-selected')).toBe('true');
  });

  it('gives the Import File control the form-action class (2.75rem pill)', () => {
    const card = fileCard();
    selectTab(importTab(card));
    const importButton = [...card.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === tFiles.importButton,
    );
    expect(importButton).toBeDefined();
    expect(importButton?.classList.contains('primitive-button-form-action')).toBe(true);
  });

  it('labels the card and its tabs in nl', () => {
    act(() => {
      setLocale('nl');
    });
    const card = fileCard();
    expect(card.getAttribute('aria-label')).toBe(tFilesNl.cardLabel);
    expect(tablist(card).getAttribute('aria-label')).toBe(tFilesNl.tabsLabel);
    expect(tabs(card).map((tab) => tab.textContent)).toEqual([tFilesNl.heading, tFilesNl.replaceHeading]);
  });
});
