// @vitest-environment jsdom
/**
 * The workspace rail's collapsed preference (#1747): reads and writes the `astraya:workspaceRailCollapsed`
 * key, notifies other components and other tabs (the `storage` event), and falls back to expanded (`false`)
 * when localStorage throws. The storage key and its behaviour are unchanged by #1747; only the meaning of
 * "collapsed" (an icon rail, not a hidden one) changed.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readRailCollapsed, useRailCollapsed, writeRailCollapsed } from '../src/ui/workspace-rail-setting.js';

const KEY = 'astraya:workspaceRailCollapsed';
const CHANGED_EVENT = 'astraya:workspace-rail-collapsed-changed';

let mounted: { container: HTMLElement; root: Root } | undefined;

beforeEach(() => {
  localStorage.removeItem(KEY);
});

afterEach(() => {
  vi.restoreAllMocks();
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  localStorage.removeItem(KEY);
});

/** A probe component that renders the hook's value, so a test can observe re-renders. */
function Probe(): React.JSX.Element {
  const [collapsed] = useRailCollapsed();
  return createElement('span', { 'data-testid': 'probe' }, collapsed ? 'collapsed' : 'expanded');
}

function mountProbe(): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(createElement(Probe));
  });
  return container;
}

function probeText(container: HTMLElement): string | null {
  return container.querySelector('[data-testid="probe"]')?.textContent ?? null;
}

describe('readRailCollapsed', () => {
  it('is false when nothing is stored', () => {
    expect(readRailCollapsed()).toBe(false);
  });

  it('is true only for the stored string "true"', () => {
    localStorage.setItem(KEY, 'true');
    expect(readRailCollapsed()).toBe(true);
    localStorage.setItem(KEY, 'false');
    expect(readRailCollapsed()).toBe(false);
    localStorage.setItem(KEY, 'yes');
    expect(readRailCollapsed()).toBe(false);
  });

  it('falls back to false when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(readRailCollapsed()).toBe(false);
  });
});

describe('writeRailCollapsed', () => {
  it('stores "true" and "false" under the unchanged key', () => {
    writeRailCollapsed(true);
    expect(localStorage.getItem(KEY)).toBe('true');
    writeRailCollapsed(false);
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('dispatches the cross-component change event after a successful write', () => {
    const listener = vi.fn();
    window.addEventListener(CHANGED_EVENT, listener);
    try {
      writeRailCollapsed(true);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(CHANGED_EVENT, listener);
    }
  });

  it('does not throw and does not dispatch when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const listener = vi.fn();
    window.addEventListener(CHANGED_EVENT, listener);
    try {
      expect(() => {
        writeRailCollapsed(true);
      }).not.toThrow();
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(CHANGED_EVENT, listener);
    }
  });
});

describe('useRailCollapsed', () => {
  it('reads the stored value on mount', () => {
    localStorage.setItem(KEY, 'true');
    expect(probeText(mountProbe())).toBe('collapsed');
  });

  it('updates a mounted consumer on the same-tab change event', () => {
    const container = mountProbe();
    expect(probeText(container)).toBe('expanded');

    act(() => {
      writeRailCollapsed(true);
    });
    expect(probeText(container)).toBe('collapsed');
  });

  it('updates a mounted consumer on a cross-tab storage event', () => {
    const container = mountProbe();
    expect(probeText(container)).toBe('expanded');

    localStorage.setItem(KEY, 'true');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: 'true' }));
    });
    expect(probeText(container)).toBe('collapsed');
  });
});
