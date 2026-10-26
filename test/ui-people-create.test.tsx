// @vitest-environment jsdom
/**
 * Creating a person gives them a copy of the device default calculation profile (#806): their own
 * `calculationSettings` and `rulership` registers, written in the same single batch as the person.
 * Real store (fake-indexeddb via test/setup.ts).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { openStore, type Store } from '../src/store/store.js';
import { People } from '../src/ui/People.js';
import {
  resetDefaultCalculationProfileMemory,
  writeDefaultCalculationProfile,
} from '../src/ui/default-calculation-profile.js';
import { resetRulershipMemory, writeRulershipChoice } from '../src/ui/rulership-setting.js';
import { StoreProvider } from '../src/ui/store-context.js';

let counter = 0;
let store: Store;
let root: Root | undefined;
let container: HTMLElement | undefined;

async function mountPeople(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <StoreProvider store={store}>
        <People />
      </StoreProvider>,
    );
    await Promise.resolve();
  });
  return container;
}

async function addPerson(host: HTMLElement): Promise<void> {
  const button = [...host.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Add a person');
  if (button === undefined) throw new Error('fixture bug: no add button');
  await act(async () => {
    button.click();
    await vi.waitFor(() => {
      expect(store.state.people.size).toBeGreaterThan(0);
    });
  });
}

beforeEach(async () => {
  counter += 1;
  localStorage.clear();
  resetRulershipMemory();
  resetDefaultCalculationProfileMemory();
  window.location.hash = '#/people';
  store = await openStore({ name: `astraya-people-create-${String(counter)}` });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = undefined;
  container = undefined;
  store.close();
});

describe('creating a person (#806)', () => {
  it('copies the saved default profile onto the new person in one mutate call', async () => {
    const saved = { ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'K', orbScalePercent: -30 };
    writeDefaultCalculationProfile(saved, 'traditional');
    writeRulershipChoice('traditional');
    const host = await mountPeople();
    const spy = vi.spyOn(store, 'mutate');
    await addPerson(host);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0].map((mutation) => mutation.field)).toEqual([
      'displayName',
      'calculationSettings',
      'rulership',
    ]);
    const [person] = [...store.state.people.values()];
    expect(person?.calculationSettings).toEqual(saved);
    expect(person?.rulership).toBe('traditional');
  });

  it('stamps the application defaults when no default was saved', async () => {
    const host = await mountPeople();
    await addPerson(host);
    const [person] = [...store.state.people.values()];
    expect(person?.calculationSettings).toEqual(DEFAULT_EXTENDED_SETTINGS);
    expect(person?.rulership).toBe('modern');
  });

  it('leaves the new person unchanged when the default changes afterwards', async () => {
    writeDefaultCalculationProfile({ ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'K' }, 'both');
    writeRulershipChoice('both');
    const host = await mountPeople();
    await addPerson(host);
    writeDefaultCalculationProfile({ ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'W' }, 'modern');
    writeRulershipChoice('modern');
    const [person] = [...store.state.people.values()];
    expect(person?.calculationSettings).toMatchObject({ houseSystem: 'K' });
    expect(person?.rulership).toBe('both');
  });

  it('renders the shared EmptyState when nobody is saved yet', async () => {
    const host = await mountPeople();
    const empty = host.querySelector('div.empty.primitive-empty-state');
    expect(empty?.querySelector('p.primitive-empty-state-message')?.textContent).toMatch(/^Nobody yet\./);
    expect(host.querySelector('p.empty')).toBeNull();
  });
});
