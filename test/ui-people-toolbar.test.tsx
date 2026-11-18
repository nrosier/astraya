// @vitest-environment jsdom
/**
 * The People toolbar above the one list (#1731): Add a person sits in the page header; the quick filter narrows the
 * list by name or place as you type; the Chart query panel is collapsed on load and opens from its toggle; the Saved
 * searches dropdown opens and closes its card. Real store (fake-indexeddb via test/setup.ts), as
 * test/ui-people-create.test.tsx does.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store.js';
import { People } from '../src/ui/People.js';
import { setLocale } from '../src/ui/locale.js';
import { resetDefaultCalculationProfileMemory } from '../src/ui/default-calculation-profile.js';
import { resetRulershipMemory } from '../src/ui/rulership-setting.js';
import { StoreProvider } from '../src/ui/store-context.js';

// The query panel reads the app's ephemeris provider; nothing here runs a search.
vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

let counter = 0;
let store: Store;
let root: Root | undefined;
let container: HTMLElement;

async function addPeople(people: readonly { id: string; name: string; place: string }[]): Promise<void> {
  await store.mutate(
    people.flatMap(({ id, name, place }) => [
      { entity: 'person', entityId: id, field: 'displayName', value: name },
      { entity: 'person', entityId: id, field: 'placeLabel', value: place },
    ]),
  );
}

async function mountPeople(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <StoreProvider store={store}>
        <People />
      </StoreProvider>,
    );
    await Promise.resolve();
  });
  // The query panel and the saved list come from one lazy chunk.
  await act(async () => {
    await import('../src/ui/ChartSearchPanel.js');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const names = (): string[] =>
  [...container.querySelectorAll('ul.people:not(.saved-query-list) a.person .name')].map((el) => el.textContent ?? '');
const buttonNamed = (name: string): HTMLButtonElement | undefined =>
  [...container.querySelectorAll('button')].find((button) => (button.textContent ?? '').trim() === name);

async function type(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
}

async function click(element: HTMLElement | undefined): Promise<void> {
  expect(element).toBeDefined();
  await act(async () => {
    element?.click();
    await Promise.resolve();
  });
}

beforeEach(async () => {
  counter += 1;
  localStorage.clear();
  setLocale('en');
  resetRulershipMemory();
  resetDefaultCalculationProfileMemory();
  window.location.hash = '#/people';
  store = await openStore({ name: `astraya-people-toolbar-${String(counter)}` });
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container.remove();
  root = undefined;
  store.close();
});

describe('People toolbar (#1731)', () => {
  it('puts Add a person in the page header as a form-action pill', async () => {
    await mountPeople();
    const add = buttonNamed('Add a person');
    expect(add?.closest('.page-header-actions')).not.toBeNull();
    expect(add?.classList.contains('primitive-button-capsule')).toBe(true);
    expect(add?.classList.contains('primitive-button-form-action')).toBe(true);
  });

  it('shows no toolbar while nobody is stored', async () => {
    await mountPeople();
    expect(container.querySelector('.people-toolbar')).toBeNull();
  });

  it('shows the list on load with the Chart query panel collapsed', async () => {
    await addPeople([{ id: 'p-aaaaaaaaaaaaaaaa', name: 'Ada', place: 'London' }]);
    await mountPeople();
    expect(names()).toEqual(['Ada']);
    const toggle = buttonNamed('Chart query');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    const panel = container.querySelector<HTMLElement>('#chart-query-panel');
    expect(panel?.hidden).toBe(true);
    await click(toggle);
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.hidden).toBe(false);
    expect(panel?.textContent).toContain('Run search');
    expect(panel?.textContent).toContain('Reset');
    expect(panel?.textContent).toContain('Save search');
  });

  it('narrows the list by name or place as you type, ignoring case and accents', async () => {
    await addPeople([
      { id: 'p-aaaaaaaaaaaaaaaa', name: 'Ada', place: 'London' },
      { id: 'p-bbbbbbbbbbbbbbbb', name: 'Bo', place: 'Zürich' },
    ]);
    await mountPeople();
    const input = container.querySelector<HTMLInputElement>('.people-toolbar input');
    expect(input).not.toBeNull();
    if (input === null) return;
    await type(input, 'zurich');
    expect(names()).toEqual(['Bo']);
    await type(input, 'ADA');
    expect(names()).toEqual(['Ada']);
    await type(input, 'nobody');
    expect(names()).toEqual([]);
    expect(container.textContent).toContain('No one matches this filter.');
    await type(input, '');
    expect(names()).toEqual(['Ada', 'Bo']);
  });

  it('opens and closes the Saved searches card from its pill, with no empty-state box', async () => {
    await addPeople([{ id: 'p-aaaaaaaaaaaaaaaa', name: 'Ada', place: 'London' }]);
    await mountPeople();
    const pill = buttonNamed('Saved searches');
    const card = container.querySelector<HTMLElement>('#people-saved-searches-card');
    expect(card?.hidden).toBe(true);
    await click(pill);
    expect(pill?.getAttribute('aria-expanded')).toBe('true');
    expect(card?.hidden).toBe(false);
    expect(card?.textContent).toContain('None yet.');
    expect(container.textContent).not.toContain('No saved searches yet');
    await click(pill);
    expect(card?.hidden).toBe(true);
  });

  it('labels the toolbar in Dutch', async () => {
    setLocale('nl');
    await addPeople([{ id: 'p-aaaaaaaaaaaaaaaa', name: 'Ada', place: 'London' }]);
    await mountPeople();
    expect(container.querySelector('.people-toolbar')?.getAttribute('aria-label')).toBe('Personen zoeken');
    expect(buttonNamed('Horoscoopzoekopdracht')).toBeDefined();
    expect(buttonNamed('Opgeslagen zoekopdrachten')).toBeDefined();
  });
});

describe('People toolbar CSS (#1731)', () => {
  it('hides the closed Saved searches card even though the open card is a grid', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/ui/app.css', 'utf-8');
    expect(css).toMatch(/\.people-saved-searches-card\[hidden\] \{\s*display: none;\s*\}/);
  });
});
