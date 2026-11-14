// @vitest-environment jsdom
/**
 * The Advanced groups of the Extended settings drawer (#856), driven through the real panel with every group closed:
 * a hidden non-default value survives Apply untouched, a closed group says how many of its values are customised,
 * the first-screen house system always shows the current system, and opening a group is remembered per browser
 * without ever entering the applied settings.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RulershipChoice } from '../src/astrology/rulership.js';
import { applyCalculationProfile } from '../src/chart/calculation-profiles.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { resetAccountPreferencesForTests } from '../src/ui/account-preferences.js';
import {
  ADVANCED_GROUPS_KEY,
  readOpenAdvancedGroups,
  resetAdvancedGroupsForTests,
} from '../src/ui/advanced-groups-setting.js';
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

/** The panel of the tab that is showing: the three Advanced tabs' panels are all mounted, the others hidden. */
function visiblePanel(container: HTMLElement): HTMLElement {
  const found = Array.from(container.querySelectorAll<HTMLElement>('dialog [role="tabpanel"]')).find(
    (panel) => !panel.hidden,
  );
  if (found === undefined) throw new Error('fixture bug: no visible tab panel');
  return found;
}

/** The Advanced group's trigger on the open tab: its title starts with "Advanced". */
function advancedTrigger(container: HTMLElement): HTMLButtonElement {
  const found = Array.from(
    visiblePanel(container).querySelectorAll<HTMLButtonElement>('.primitive-disclosure-trigger'),
  ).find((button) => (button.querySelector('.primitive-disclosure-title')?.textContent ?? '').startsWith('Advanced'));
  if (found === undefined) throw new Error('fixture bug: no Advanced group on the open tab');
  return found;
}

function checkboxLabeled(container: HTMLElement, text: string): HTMLInputElement {
  const label = Array.from(container.querySelectorAll('label')).find(
    (candidate) => candidate.querySelector('input[type="checkbox"]') !== null && candidate.textContent.includes(text),
  );
  const input = label?.querySelector('input[type="checkbox"]');
  if (!(input instanceof HTMLInputElement)) throw new Error(`fixture bug: no checkbox "${text}"`);
  return input;
}

const KOCH_TRUE_LILITH: ExtendedSettings = {
  ...DEFAULT_EXTENDED_SETTINGS,
  houseSystem: 'K',
  lilithVariant: 'true',
  nodeVariant: 'true',
  orbScalePercent: -30,
  enabledMinorAspects: ['quincunx'],
  boundsScheme: 'ptolemaic',
};

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

describe('Advanced groups start closed (#856)', () => {
  it('shows no Advanced control until a group is opened, on each of the two tabs that have one', async () => {
    const container = await mount(DEFAULT_EXTENDED_SETTINGS);
    openCard(container);
    for (const tab of ['Profile & frame', 'Special points']) {
      act(() => {
        tabButton(container, tab).click();
      });
      expect(advancedTrigger(container).getAttribute('aria-expanded'), tab).toBe('false');
    }
    // Orbs & aspects has no Advanced group: the orb scale and minor aspects are on its first screen (#1544).
    act(() => {
      tabButton(container, 'Orbs & aspects').click();
    });
    expect(() => advancedTrigger(container)).toThrow('no Advanced group');
    expect(visiblePanel(container).querySelector('input[type="range"]')).not.toBeNull();
    // The visibility matrix is no longer Advanced: it is the Bodies tab's first screen (#1544).
    act(() => {
      tabButton(container, 'Bodies').click();
    });
    expect(visiblePanel(container).querySelector('table')).not.toBeNull();
    expect(visiblePanel(container).querySelector('.primitive-disclosure-title')?.textContent ?? '').not.toMatch(
      /^Advanced/,
    );
    expect(container.textContent).not.toContain('Every house system');
  });

  it('keeps the Display tab without an Advanced group, since it only changes appearance', async () => {
    const container = await mount(DEFAULT_EXTENDED_SETTINGS);
    openCard(container);
    act(() => {
      tabButton(container, 'Display & glyphs').click();
    });
    const titles = Array.from(visiblePanel(container).querySelectorAll('.primitive-disclosure-title')).map(
      (node) => node.textContent,
    );
    expect(titles.some((title) => title.startsWith('Advanced'))).toBe(false);
  });
});

describe('a hidden value is kept', () => {
  it('applies a hidden non-default value untouched when only a visible control changed', async () => {
    const onRedraw = vi.fn();
    const container = await mount(KOCH_TRUE_LILITH, onRedraw);
    openCard(container);
    act(() => {
      tabButton(container, 'Special points').click();
    });
    // Midpoints is a first-screen control of the Special tab; the Lilith variant is hidden in its Advanced group.
    act(() => {
      checkboxLabeled(container, 'Midpoints').click();
    });
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });
    expect(onRedraw).toHaveBeenCalledTimes(1);
    expect(onRedraw).toHaveBeenCalledWith({ ...KOCH_TRUE_LILITH, midpointsVisible: true }, 'modern');
  });

  it('keeps the hidden values through a change to the house system on the first screen', async () => {
    const onRedraw = vi.fn();
    const container = await mount(KOCH_TRUE_LILITH, onRedraw);
    openCard(container);
    const houses = Array.from(container.querySelectorAll('select')).find((select) =>
      Array.from(select.options).some((option) => option.value === 'W'),
    );
    if (houses === undefined) throw new Error('fixture bug: no first-screen house system select');
    act(() => {
      houses.value = 'W';
      houses.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });
    expect(onRedraw).toHaveBeenCalledWith({ ...KOCH_TRUE_LILITH, houseSystem: 'W' }, 'modern');
  });
});

describe('the customised marker', () => {
  it('counts a closed group’s differing values against the profile the draft is closest to', async () => {
    const container = await mount(KOCH_TRUE_LILITH);
    openCard(container);
    const summaryOf = (tab: string): string => {
      act(() => {
        tabButton(container, tab).click();
      });
      return advancedTrigger(container).querySelector('.primitive-disclosure-summary')?.textContent ?? '';
    };
    expect(summaryOf('Profile & frame')).toBe('1 customised');
    // The orb scale and minor aspects are first-screen settings now (#1544): no Advanced group counts them.
    act(() => {
      tabButton(container, 'Orbs & aspects').click();
    });
    expect(visiblePanel(container).querySelector('.primitive-disclosure-summary')).toBeNull();
    expect(summaryOf('Special points')).toBe('2 customised');
  });

  it('shows no marker for a profile exactly as it is, and for the Astraya defaults', async () => {
    const traditional = applyCalculationProfile(DEFAULT_EXTENDED_SETTINGS, 'traditional-western-v1');
    const container = await mount(traditional, vi.fn(), 'traditional');
    openCard(container);
    for (const tab of ['Profile & frame', 'Special points']) {
      act(() => {
        tabButton(container, tab).click();
      });
      expect(advancedTrigger(container).querySelector('.primitive-disclosure-summary'), tab).toBeNull();
    }
  });

  it('does not open a group because it holds a customised value', async () => {
    const container = await mount(KOCH_TRUE_LILITH);
    openCard(container);
    expect(advancedTrigger(container).getAttribute('aria-expanded')).toBe('false');
    expect(readOpenAdvancedGroups()).toEqual([]);
  });
});

describe('the first-screen house system', () => {
  function firstScreenHouseOptions(container: HTMLElement): string[] {
    const select = Array.from(container.querySelectorAll('select')).find(
      (candidate) =>
        candidate.closest('label')?.textContent.startsWith('House system') === true ||
        candidate.labels[0]?.textContent === 'House system',
    );
    if (select === undefined) throw new Error('fixture bug: no first-screen house system select');
    return Array.from(select.options).map((option) => option.value);
  }

  it('offers Placidus and Whole Sign, and nothing else when one of them is selected', async () => {
    const container = await mount(DEFAULT_EXTENDED_SETTINGS);
    openCard(container);
    expect(firstScreenHouseOptions(container)).toEqual(['P', 'W']);
  });

  it('always includes the selected system, so a saved Koch chart is not shown as something else', async () => {
    const container = await mount(KOCH_TRUE_LILITH);
    openCard(container);
    expect(firstScreenHouseOptions(container)).toEqual(['K', 'P', 'W']);
    const all = Array.from(container.querySelectorAll('select')).find(
      (select) => select.options.length > 20 && select.value === 'K',
    );
    expect(all).toBeUndefined();
  });

  it('lists every system in the Advanced group once it is opened, writing the same value', async () => {
    const onRedraw = vi.fn();
    const container = await mount(DEFAULT_EXTENDED_SETTINGS, onRedraw);
    openCard(container);
    act(() => {
      advancedTrigger(container).click();
    });
    const all = Array.from(container.querySelectorAll('select')).find((select) => select.options.length > 20);
    if (all === undefined) throw new Error('fixture bug: no full house system list');
    expect(all.options.length).toBeGreaterThan(20);
    act(() => {
      all.value = 'K';
      all.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });
    expect(onRedraw).toHaveBeenCalledWith({ ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'K' }, 'modern');
  });
});

describe('the open state', () => {
  it('is remembered in this browser, per tab, and is not part of the applied settings', async () => {
    const onRedraw = vi.fn();
    const container = await mount(DEFAULT_EXTENDED_SETTINGS, onRedraw);
    openCard(container);
    act(() => {
      tabButton(container, 'Special points').click();
    });
    act(() => {
      advancedTrigger(container).click();
    });
    expect(advancedTrigger(container).getAttribute('aria-expanded')).toBe('true');
    expect(JSON.parse(localStorage.getItem(ADVANCED_GROUPS_KEY) ?? 'null')).toEqual(['special']);
    // Another tab's group is still closed.
    act(() => {
      tabButton(container, 'Profile & frame').click();
    });
    expect(advancedTrigger(container).getAttribute('aria-expanded')).toBe('false');

    // A fresh page shows the same groups open.
    unmount();
    resetAdvancedGroupsForTests();
    const again = await mount(DEFAULT_EXTENDED_SETTINGS, onRedraw);
    openCard(again);
    act(() => {
      tabButton(again, 'Special points').click();
    });
    expect(advancedTrigger(again).getAttribute('aria-expanded')).toBe('true');

    // Applying changes nothing about the groups and the settings carry no trace of them.
    act(() => {
      checkboxLabeled(again, 'Midpoints').click();
    });
    act(() => {
      buttonNamed(again, 'Apply and redraw')?.click();
    });
    expect(onRedraw).toHaveBeenCalledWith({ ...DEFAULT_EXTENDED_SETTINGS, midpointsVisible: true }, 'modern');
  });
});
