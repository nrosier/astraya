// @vitest-environment jsdom
/**
 * The orb library editor as an account-preference screen (#1220, db-integrity review): it never lets a save make the
 * library unreadable (a 51st profile), never lets a save replace a value it cannot read, and removes a profile and
 * the choices that named it in one durable commit.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_ORB_PROFILES, type OrbProfileRecord } from '../src/astrology/orb-library.js';
import { serializeOrbProfile } from '../src/domain/account-preferences.js';
import { DB_NAME } from '../src/store/db.js';
import { openStore, type Store } from '../src/store/store.js';
import {
  accountCacheKey,
  bindAccountPreferences,
  getAccountPreferences,
  resetAccountPreferencesForTests,
  unbindAccountPreferences,
} from '../src/ui/account-preferences.js';
import { OrbLibraryEditor } from '../src/ui/OrbLibraryEditor.js';

const profile = (n: number): OrbProfileRecord => ({
  id: `profile-${String(n)}`,
  name: `Profile ${String(n)}`,
  revision: 1,
  scalePercent: 0,
  aspectOrbs: {},
  bodyOrbs: {},
});

let root: Root | undefined;
let container: HTMLElement | undefined;
const opened: Store[] = [];

function mount(profiles: readonly OrbProfileRecord[], sources: Parameters<typeof OrbLibraryEditor>[0]['sources'] = {}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<OrbLibraryEditor profiles={profiles} sources={sources} />);
  });
  return container;
}

function button(box: HTMLElement, label: string): HTMLButtonElement {
  const found = [...box.querySelectorAll('button')].find((candidate) => candidate.textContent === label);
  if (found === undefined) throw new Error(`no button "${label}"`);
  return found;
}

function type(input: HTMLInputElement, value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  resetAccountPreferencesForTests();
});

afterEach(() => {
  if (root !== undefined) {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
  }
  unbindAccountPreferences();
  for (const store of opened.splice(0)) store.close();
  localStorage.clear();
  resetAccountPreferencesForTests();
});

describe('the limit of fifty profiles', () => {
  it('refuses a 51st profile with a message and writes nothing, so the library stays readable', () => {
    const full = Array.from({ length: MAX_ORB_PROFILES }, (_, n) => profile(n + 1));
    const box = mount(full);
    act(() => {
      button(box, 'Add orb profile').click();
    });
    const name = box.querySelector<HTMLInputElement>('input[type="text"]');
    if (name === null) throw new Error('fixture bug: no name field');
    type(name, 'One too many');
    act(() => {
      button(box, 'Save orb profile').click();
    });
    expect(box.textContent).toContain(`You can keep up to ${String(MAX_ORB_PROFILES)} orb profiles`);
    expect(getAccountPreferences().orbLibrary.profiles).toEqual([]);
    expect(getAccountPreferences().failure).toBeUndefined();
  });

  it('still lets an existing profile at the limit be edited into a new revision', () => {
    const full = Array.from({ length: MAX_ORB_PROFILES }, (_, n) => profile(n + 1));
    const box = mount(full);
    act(() => {
      button(box, 'Edit Profile 7').click();
    });
    act(() => {
      button(box, 'Save as revision 2').click();
    });
    expect(box.textContent).not.toContain('You can keep up to');
    expect(getAccountPreferences().orbLibrary.profiles).toHaveLength(MAX_ORB_PROFILES);
  });
});

describe('a value this version cannot read', () => {
  function loadUnreadable(cached: unknown): void {
    localStorage.setItem(accountCacheKey(DB_NAME), JSON.stringify(cached));
    resetAccountPreferencesForTests();
  }

  it('keeps the library read-only and says why, instead of letting a save replace what the reader cannot see', () => {
    loadUnreadable({ orbLibrary: { version: 2, profiles: [] } });
    const box = mount([]);
    expect(box.textContent).toContain('saved by a newer version of Astraya');
    expect(button(box, 'Add orb profile').disabled).toBe(true);
    // The per-context choices are a separate value and stay usable.
    expect([...box.querySelectorAll('select')].every((select) => !select.disabled)).toBe(true);
  });

  it('keeps the per-context choices read-only while the source is unreadable, and the library editable', () => {
    loadUnreadable({ orbContextSource: { version: 2, transit: 'x' } });
    const box = mount([profile(1)]);
    expect(button(box, 'Add orb profile').disabled).toBe(false);
    expect([...box.querySelectorAll('select')].every((select) => select.disabled)).toBe(true);
  });

  it('removes a profile without touching an unreadable source', async () => {
    const store = await openStore({ name: 'astraya-orb-editor-locked' });
    opened.push(store);
    await store.mutate([
      { entity: 'account', entityId: 'preferences', field: 'orbContextSource', value: { version: 2, transit: 'x' } },
    ]);
    bindAccountPreferences(store);
    const box = mount([profile(1)]);
    await act(async () => {
      button(box, 'Remove Profile 1').click();
      await Promise.resolve();
    });
    expect(store.state.account.orbContextSource?.value).toEqual({ version: 2, transit: 'x' });
  });
});

describe('removing a profile', () => {
  it('writes the library and the reset choices in one durable commit', async () => {
    const store = await openStore({ name: 'astraya-orb-editor-remove' });
    opened.push(store);
    // Both profiles are in the account first, as they are when the editor shows them.
    await store.mutate(
      [profile(1), profile(2)].map((entry) => ({
        entity: 'account',
        entityId: 'preferences',
        field: `orbProfile.${entry.id}`,
        value: serializeOrbProfile(entry),
      })),
    );
    bindAccountPreferences(store);
    const box = mount([profile(1), profile(2)], { transit: 'profile-1', natal: 'profile-2' });
    await act(async () => {
      button(box, 'Remove Profile 1').click();
      await Promise.resolve();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const written = store.outgoing().slice(2);
    expect(written.map((record) => record.field)).toEqual(['orbProfile.profile-1', 'orbContextSource']);
    // The removed profile is a null in its own register (#1250), not a rewrite of the other profile.
    expect(written[0]?.value).toBeNull();
    expect(store.state.account.orbContextSource?.value).toEqual({ version: 1, transit: 'card', natal: 'profile-2' });
  });
});
