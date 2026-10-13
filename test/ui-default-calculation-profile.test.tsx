// @vitest-environment jsdom
/**
 * The device's default calculation profile (#510): saved via "Save as my default", read by
 * every screen that seeds a chart's starting Extended settings, and safe when storage is
 * unusable.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import {
  DEFAULT_CALCULATION_PROFILE_KEY,
  readDefaultCalculationProfile,
  resetDefaultCalculationProfileMemory,
  useDefaultCalculationProfile,
  writeDefaultCalculationProfile,
} from '../src/ui/default-calculation-profile.js';

let mounted: { container: HTMLElement; root: Root } | undefined;

beforeEach(() => {
  localStorage.clear();
  resetDefaultCalculationProfileMemory();
});

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  vi.restoreAllMocks();
});

async function mount(node: React.JSX.Element): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

function Reader(): React.JSX.Element {
  const [profile] = useDefaultCalculationProfile();
  return <output data-testid="reader">{profile === undefined ? 'unset' : profile.rulership}</output>;
}

const SIDEREAL: ExtendedSettings = {
  ...DEFAULT_EXTENDED_SETTINGS,
  zodiac: { kind: 'sidereal', ayanamsa: 1 },
  houseSystem: 'W',
};

describe('the saved default (#510)', () => {
  it('is unset when nothing is saved', () => {
    expect(readDefaultCalculationProfile()).toBeUndefined();
  });

  it('is what was saved, and survives a read', () => {
    writeDefaultCalculationProfile(SIDEREAL, 'traditional');
    const saved = readDefaultCalculationProfile();
    expect(saved?.rulership).toBe('traditional');
    expect(saved?.settings.zodiac).toEqual({ kind: 'sidereal', ayanamsa: 1 });
  });

  it('treats unparseable JSON as unset', () => {
    for (const value of ['', 'not json']) {
      localStorage.setItem(DEFAULT_CALCULATION_PROFILE_KEY, value);
      expect(readDefaultCalculationProfile()).toBeUndefined();
    }
  });

  it('repairs a damaged-but-parseable saved value field by field instead of rejecting it outright (#541)', () => {
    // Each of these is valid JSON but not a well-formed profile — #541 elevated this from
    // "reject the whole thing" to "fill in whatever is missing or wrong-typed", the same
    // contract parseCalculationSnapshot documents for every untrusted-JSON entry point.
    for (const value of ['{"settings":{}}', '{"rulership":"modern"}', 'null', '"string"']) {
      localStorage.setItem(DEFAULT_CALCULATION_PROFILE_KEY, value);
      const read = readDefaultCalculationProfile();
      expect(read?.settings).toEqual(DEFAULT_EXTENDED_SETTINGS);
      expect(read?.rulership).toBe('modern');
    }
  });

  it('falls back to the page’s own memory when storage cannot be used', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => {
      writeDefaultCalculationProfile(SIDEREAL, 'both');
    }).not.toThrow();
  });
});

describe('the hook (#510)', () => {
  it('shows the saved default and updates every reader in the tab when it changes', async () => {
    const container = await mount(<Reader />);
    expect(container.querySelector('[data-testid="reader"]')?.textContent).toBe('unset');

    await act(async () => {
      writeDefaultCalculationProfile(SIDEREAL, 'traditional');
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="reader"]')?.textContent).toBe('traditional');
  });

  it('follows a change made in another tab (the storage event)', async () => {
    const container = await mount(<Reader />);
    await act(async () => {
      localStorage.setItem(DEFAULT_CALCULATION_PROFILE_KEY, JSON.stringify({ settings: SIDEREAL, rulership: 'both' }));
      window.dispatchEvent(new StorageEvent('storage', { key: DEFAULT_CALCULATION_PROFILE_KEY }));
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="reader"]')?.textContent).toBe('both');
  });
});
