// @vitest-environment jsdom
/**
 * The two orb controls on the Orbs & aspects first screen (#1544), driven through the real panel: the orb-scale
 * detent chips and the minor-aspects selector with its inline Custom checklist.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RulershipChoice } from '../src/astrology/rulership.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { resetAccountPreferencesForTests } from '../src/ui/account-preferences.js';
import { resetAdvancedGroupsForTests } from '../src/ui/advanced-groups-setting.js';
import { ExtendedSettingsPanel } from '../src/ui/ExtendedSettingsPanel.js';

function notImplemented(): never {
  throw new Error('not used by this test');
}

function fakeProvider(): EphemerisProvider {
  return {
    initialize: notImplemented,
    julianDay: notImplemented,
    julianDayFromUtc: notImplemented,
    position: notImplemented,
    positions: notImplemented,
    houses: notImplemented,
    houseSystemName: (system) => Promise.resolve(`House system ${system}`),
    ayanamsa: notImplemented,
    obliquity: notImplemented,
    ayanamsaName: (mode) => Promise.resolve(`Ayanamsa ${String(mode)}`),
    fixedStar: notImplemented,
    fixedStarMagnitude: notImplemented,
    nextSunCrossing: notImplemented,
    nextMoonCrossing: notImplemented,
    nextSolarEclipse: notImplemented,
    nextLunarEclipse: notImplemented,
    azimuthAltitude: notImplemented,
    version: notImplemented,
    dispose: notImplemented,
  };
}

let mounted: { container: HTMLElement; root: Root } | undefined;

async function mount(
  value: ExtendedSettings,
  onRedraw: (next: unknown, rulers: unknown) => void = vi.fn(),
  rulership: RulershipChoice = 'modern',
): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(
      <ExtendedSettingsPanel value={value} rulership={rulership} onRedraw={onRedraw} provider={fakeProvider()} />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return container;
}

function unmount(): void {
  if (mounted === undefined) return;
  const { container, root } = mounted;
  act(() => {
    root.unmount();
  });
  container.remove();
  mounted = undefined;
}

function openCard(container: HTMLElement): void {
  const trigger = container.querySelector<HTMLButtonElement>('button.extended-settings-trigger');
  if (trigger === null) throw new Error('fixture bug: no trigger');
  act(() => {
    trigger.click();
  });
}

function tabButton(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll<HTMLButtonElement>('dialog [role="tab"]')).find(
    (button) => button.textContent === label,
  );
  if (found === undefined) throw new Error(`fixture bug: no tab "${label}"`);
  return found;
}

const buttonNamed = (container: HTMLElement, name: string): HTMLButtonElement | undefined =>
  Array.from(container.querySelectorAll('button')).find((button) => button.textContent === name);

function checkboxLabeled(container: HTMLElement, text: string): HTMLInputElement {
  const label = Array.from(container.querySelectorAll('label')).find(
    (candidate) => candidate.querySelector('input[type="checkbox"]') !== null && candidate.textContent.includes(text),
  );
  const input = label?.querySelector('input[type="checkbox"]');
  if (!(input instanceof HTMLInputElement)) throw new Error(`fixture bug: no checkbox "${text}"`);
  return input;
}

beforeEach(() => {
  localStorage.clear();
  resetAdvancedGroupsForTests();
  resetAccountPreferencesForTests();
});

afterEach(() => {
  unmount();
  localStorage.clear();
  resetAdvancedGroupsForTests();
  resetAccountPreferencesForTests();
});

const OVERRIDDEN: ExtendedSettings = {
  ...DEFAULT_EXTENDED_SETTINGS,
  orbScalePercent: 20,
  orbRules: { bodyOrbs: { sun: 12 } },
};

function openOrbsTab(container: HTMLElement): void {
  openCard(container);
  act(() => {
    tabButton(container, 'Orbs & aspects').click();
  });
}

describe('the orb scale chips', () => {
  it('clears the orb overrides and sets the scale to -50 when Tight -50% is clicked', async () => {
    const onRedraw = vi.fn();
    const container = await mount(OVERRIDDEN, onRedraw);
    openOrbsTab(container);
    act(() => {
      buttonNamed(container, 'Tight -50%')?.click();
    });
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });
    expect(onRedraw).toHaveBeenCalledTimes(1);
    const applied = (onRedraw.mock.calls[0] as [ExtendedSettings, unknown])[0];
    expect(applied.orbScalePercent).toBe(-50);
    expect(applied.orbRules).toBeUndefined();
  });
});

describe('the minor aspects selector', () => {
  it('does not write enabledMinorAspects when Custom is chosen, and opens the checklist inline', async () => {
    const onRedraw = vi.fn();
    const container = await mount(DEFAULT_EXTENDED_SETTINGS, onRedraw);
    openOrbsTab(container);
    expect(container.textContent).not.toContain('Choose each minor aspect');
    const custom = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]')).find(
      (radio) => radio.closest('label')?.textContent.trim() === 'Custom',
    );
    if (custom === undefined) throw new Error('fixture bug: no Custom option');
    act(() => {
      custom.click();
    });
    expect(container.textContent).toContain('Choose each minor aspect');
    // Another change makes Apply available; the minor aspects must still be the ones the panel was given.
    act(() => {
      checkboxLabeled(container, 'Midpoints').click();
    });
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });
    const applied = (onRedraw.mock.calls[0] as [ExtendedSettings, unknown])[0];
    expect(applied.enabledMinorAspects).toEqual(DEFAULT_EXTENDED_SETTINGS.enabledMinorAspects);
  });
});

describe('the customised count on Orbs & aspects', () => {
  it('shows the count on the tab when a minor aspect is changed, and nothing when none is', async () => {
    const plain = await mount(DEFAULT_EXTENDED_SETTINGS);
    openOrbsTab(plain);
    expect(plain.textContent).not.toContain('customised');
    unmount();

    const changed = await mount({ ...DEFAULT_EXTENDED_SETTINGS, enabledMinorAspects: ['quincunx'] });
    openOrbsTab(changed);
    expect(changed.querySelector('.settings-card-customised')?.textContent).toBe('1 customised');
  });
});
