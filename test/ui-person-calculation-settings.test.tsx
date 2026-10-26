// @vitest-environment jsdom
/**
 * The hook that gives a screen one person's calculation settings and rulers (#806).
 *
 * Real store (fake-indexeddb via test/setup.ts), real device-preference modules over jsdom localStorage.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { buildCalculationSnapshot } from '../src/domain/calculation-snapshot.js';
import { differingPrimaryDirectionsSettings } from '../src/domain/primary-directions-settings.js';
import { serializeCalculationSettings } from '../src/domain/person.js';
import { openStore, type Store } from '../src/store/store.js';
import { resetDefaultCalculationProfileMemory } from '../src/ui/default-calculation-profile.js';
import { type PersonCalculationSettings, usePersonCalculationSettings } from '../src/ui/person-calculation-settings.js';
import { resetRulershipMemory, writeRulershipChoice } from '../src/ui/rulership-setting.js';
import { StoreProvider } from '../src/ui/store-context.js';

let counter = 0;
let store: Store;
let root: Root | undefined;
let container: HTMLElement | undefined;
const latest: Record<string, PersonCalculationSettings | undefined> = {};

function Probe({ id }: { readonly id: string }): null {
  latest[id] = usePersonCalculationSettings(id);
  return null;
}

function mount(...ids: string[]): void {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <StoreProvider store={store}>
        {ids.map((id) => (
          <Probe key={id} id={id} />
        ))}
      </StoreProvider>,
    );
  });
}

function current(id: string): PersonCalculationSettings {
  const value = latest[id];
  if (value === undefined) throw new Error(`no probe for ${id}`);
  return value;
}

async function addPeople(...ids: string[]): Promise<void> {
  await store.mutate(ids.map((id) => ({ entity: 'person', entityId: id, field: 'displayName', value: id })));
}

beforeEach(async () => {
  counter += 1;
  localStorage.clear();
  resetRulershipMemory();
  resetDefaultCalculationProfileMemory();
  store = await openStore({ name: `astraya-person-calc-${String(counter)}` });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = undefined;
  container = undefined;
  for (const key of Object.keys(latest)) latest[key] = undefined;
});

describe('usePersonCalculationSettings rulership (#806)', () => {
  it('follows the device default rulership until the person has their own', async () => {
    writeRulershipChoice('traditional');
    await addPeople('a');
    mount('a');
    expect(current('a').rulership).toBe('traditional');
    expect(current('a').rulershipSource).toBe('device-default');
  });

  it("writing one person's rulership leaves another unchanged", async () => {
    await addPeople('a', 'b');
    mount('a', 'b');
    await act(async () => {
      await current('a').setSettings(current('a').settings, 'both');
    });
    expect(current('a').rulership).toBe('both');
    expect(current('a').rulershipSource).toBe('person');
    expect(current('b').rulership).toBe('modern');
    expect(current('b').rulershipSource).toBe('device-default');
  });

  it('writes both registers in one batch and skips a register that already holds the value', async () => {
    await addPeople('a');
    mount('a');
    const spy = vi.spyOn(store, 'mutate');
    const next = { ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'K' };
    await act(async () => {
      await current('a').setSettings(next, 'traditional');
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0].map((mutation) => mutation.field)).toEqual(['calculationSettings', 'rulership']);

    await act(async () => {
      await current('a').setSettings(next, 'traditional');
    });
    expect(spy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await current('a').setSettings(next, 'both');
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1]?.[0].map((mutation) => mutation.field)).toEqual(['rulership']);
  });

  it('leaves the rulership register alone when no rulership is passed', async () => {
    await addPeople('a');
    mount('a');
    await act(async () => {
      await current('a').setSettings({ ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'K' });
    });
    expect(store.state.people.get('a')?.rulership).toBeUndefined();
  });

  it('rejects when the write fails', async () => {
    await addPeople('a');
    mount('a');
    vi.spyOn(store, 'mutate').mockRejectedValueOnce(new Error('disk full'));
    await expect(current('a').setSettings(DEFAULT_EXTENDED_SETTINGS, 'both')).rejects.toThrow('disk full');
  });

  it('reports an unreadable rulership register as unreadable with placeholder values', async () => {
    await addPeople('a');
    await store.mutate([{ entity: 'person', entityId: 'a', field: 'rulership', value: 'ptolemaic' }]);
    mount('a');
    expect(current('a').unreadable).toBe(true);
    expect(current('a').rulership).toBe('modern');
    expect(current('a').rulershipSource).toBe('application-default');
  });

  it('reads a person with their own settings register but no rulership as device-default for rulers', async () => {
    writeRulershipChoice('both');
    await addPeople('a');
    await store.mutate([
      {
        entity: 'person',
        entityId: 'a',
        field: 'calculationSettings',
        value: serializeCalculationSettings(DEFAULT_EXTENDED_SETTINGS),
      },
    ]);
    mount('a');
    expect(current('a').source).toBe('person');
    expect(current('a').rulership).toBe('both');
  });

  it("feeds the #797 primary-directions mismatch from the person's rulers, not the device's", async () => {
    await addPeople('a', 'b');
    mount('a', 'b');
    await act(async () => {
      await current('a').setSettings(current('a').settings, 'traditional');
    });
    const mismatches = (id: string): readonly string[] =>
      differingPrimaryDirectionsSettings(buildCalculationSnapshot(current(id).settings, current(id).rulership));
    expect(mismatches('a')).toEqual(['rulership']);
    expect(mismatches('b')).toEqual([]);
  });
});
