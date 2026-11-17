// @vitest-environment jsdom
/**
 * `useDrawerDeepLink` (#1667): reports a `drawer` key requested on its host route, ignores absent, unknown and
 * wrong-host keys, follows `hashchange`, and `clear` removes only the `drawer` parameter.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { DRAWER_KEYS, type DrawerKey } from '../src/ui/route.js';
import { useDrawerDeepLink } from '../src/ui/use-drawer-deep-link.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HOST_PATH: Record<DrawerKey, string> = {
  overlays: '#/people/p-aaaaaaaaaaaaaaaa/charts/natal/wheel',
  'extended-settings': '#/people/p-aaaaaaaaaaaaaaaa/charts/natal/wheel',
  'life-events': '#/people/p-aaaaaaaaaaaaaaaa/birth-record',
  'map-settings': '#/people/p-aaaaaaaaaaaaaaaa/location/astrocartography',
};

const WRONG_HOST_PATH: Record<DrawerKey, string> = {
  overlays: '#/people/p-aaaaaaaaaaaaaaaa/location/astrocartography',
  'extended-settings': '#/people/p-aaaaaaaaaaaaaaaa/birth-record',
  'life-events': '#/people/p-aaaaaaaaaaaaaaaa/charts/natal/wheel',
  'map-settings': '#/people/p-aaaaaaaaaaaaaaaa/charts/natal/wheel',
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  container?.remove();
  container = undefined;
  window.history.replaceState(null, '', '#/');
});

interface Probe {
  requested: boolean;
  clear: () => void;
}

function mount(key: DrawerKey): { current: () => Probe } {
  const latest: { value: Probe | undefined } = { value: undefined };
  function ProbeComponent(): null {
    latest.value = useDrawerDeepLink(key);
    return null;
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<ProbeComponent />);
  });
  return {
    current: () => {
      if (latest.value === undefined) throw new Error('probe not rendered');
      return latest.value;
    },
  };
}

function setHash(hash: string): void {
  window.history.replaceState(window.history.state, '', hash);
}

describe('useDrawerDeepLink', () => {
  it.each(DRAWER_KEYS)('reports %s as requested on its host route', (key) => {
    setHash(`${HOST_PATH[key]}?drawer=${key}`);
    expect(mount(key).current().requested).toBe(true);
  });

  it.each(DRAWER_KEYS)('reports %s as not requested on a wrong host route', (key) => {
    setHash(`${WRONG_HOST_PATH[key]}?drawer=${key}`);
    expect(mount(key).current().requested).toBe(false);
  });

  it.each(DRAWER_KEYS)('reports %s as not requested when the hash has no drawer', (key) => {
    setHash(HOST_PATH[key]);
    expect(mount(key).current().requested).toBe(false);
  });

  it('reports nothing for an unknown drawer key', () => {
    setHash(`${HOST_PATH.overlays}?drawer=not-a-drawer`);
    expect(mount('overlays').current().requested).toBe(false);
  });

  it('reports only the requested key when another drawer is named', () => {
    setHash(`${HOST_PATH.overlays}?drawer=overlays`);
    expect(mount('extended-settings').current().requested).toBe(false);
  });

  it('follows hashchange to a new request', async () => {
    setHash(HOST_PATH.overlays);
    const probe = mount('overlays');
    expect(probe.current().requested).toBe(false);
    await act(async () => {
      window.location.hash = `${HOST_PATH.overlays.slice(1)}?drawer=overlays`;
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    });
    expect(probe.current().requested).toBe(true);
  });

  it('clear removes only the drawer parameter and keeps the path, other query values and history.state', () => {
    const state = { keep: 'me' };
    window.history.replaceState(state, '', `${HOST_PATH.overlays}?date=2026-03-01&drawer=overlays&view=wheel`);
    const probe = mount('overlays');
    expect(probe.current().requested).toBe(true);
    act(() => {
      probe.current().clear();
    });
    expect(window.location.hash).toBe(`${HOST_PATH.overlays}?date=2026-03-01&view=wheel`);
    expect(window.history.state).toEqual(state);
    expect(probe.current().requested).toBe(false);
  });

  it('clear drops the query string when drawer was the only parameter', () => {
    setHash(`${HOST_PATH['life-events']}?drawer=life-events`);
    const probe = mount('life-events');
    act(() => {
      probe.current().clear();
    });
    expect(window.location.hash).toBe(HOST_PATH['life-events']);
    expect(probe.current().requested).toBe(false);
  });
});
