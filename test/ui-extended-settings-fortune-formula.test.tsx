// @vitest-environment jsdom
/**
 * The Part of Fortune formula choice in Extended settings (#1794): both labels in en and nl, the default, the draft
 * change reaching the redraw, and the chosen value surviving a save and reload of the settings.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADVANCED_GROUPS_KEY, resetAdvancedGroupsForTests } from '../src/ui/advanced-groups-setting.js';
import { resetAccountPreferencesForTests } from '../src/ui/account-preferences.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import { readCalculationSettings, serializeCalculationSettings } from '../src/domain/person.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { ExtendedSettingsPanel } from '../src/ui/ExtendedSettingsPanel.js';
import { extendedSettingsPanelMessages } from '../src/ui/ExtendedSettingsPanel.messages.js';

function unused(): never {
  throw new Error('not used by this test');
}

const provider: EphemerisProvider = {
  initialize: unused,
  julianDay: unused,
  julianDayFromUtc: unused,
  position: unused,
  positions: unused,
  houses: unused,
  houseSystemName: (system) => Promise.resolve(`House system ${system}`),
  ayanamsa: unused,
  obliquity: unused,
  ayanamsaName: (mode) => Promise.resolve(`Ayanamsa ${String(mode)}`),
  fixedStar: unused,
  fixedStarMagnitude: unused,
  nextSunCrossing: unused,
  nextMoonCrossing: unused,
  nextSolarEclipse: unused,
  nextLunarEclipse: unused,
  azimuthAltitude: unused,
  version: unused,
  dispose: unused,
};

beforeEach(() => {
  localStorage.setItem(ADVANCED_GROUPS_KEY, JSON.stringify(['profile', 'special']));
  resetAdvancedGroupsForTests();
});

afterEach(() => {
  localStorage.clear();
  resetAdvancedGroupsForTests();
  resetAccountPreferencesForTests();
});

async function mount(
  onRedraw: (next: ExtendedSettings, rulers: unknown) => void,
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ExtendedSettingsPanel
        value={DEFAULT_EXTENDED_SETTINGS}
        rulership="modern"
        onRedraw={onRedraw}
        provider={provider}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

function unmount(container: HTMLElement, root: Root): void {
  act(() => {
    root.unmount();
  });
  container.remove();
}

function openCard(container: HTMLElement): void {
  const trigger = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Extended settings');
  act(() => {
    trigger?.click();
  });
}

function formulaGroup(container: HTMLElement): HTMLElement {
  const group = container.querySelector('[role="radiogroup"][aria-label="Part of Fortune formula"]');
  if (!(group instanceof HTMLElement)) throw new Error('fixture bug: no Part of Fortune formula group');
  return group;
}

function radioLabeled(group: HTMLElement, text: string): HTMLInputElement {
  const label = Array.from(group.querySelectorAll('label')).find((l) => l.textContent.includes(text));
  const input = label?.querySelector('input');
  if (!(input instanceof HTMLInputElement)) throw new Error(`fixture bug: no option "${text}"`);
  return input;
}

describe('the Part of Fortune formula choice (#1794)', () => {
  it('shows the control with both English labels, the Hellenistic default selected', async () => {
    const { container, root } = await mount(vi.fn());
    openCard(container);
    const group = formulaGroup(container);
    expect(radioLabeled(group, 'Reverse at night (Hellenistic)').checked).toBe(true);
    expect(radioLabeled(group, 'Same formula day and night (modern)').checked).toBe(false);
    unmount(container, root);
  });

  it('has both Dutch labels, with the same keys in en and nl', () => {
    const { en, nl } = extendedSettingsPanelMessages;
    expect(nl.fortuneSectReversed).toBe("'s Nachts omgekeerd (hellenistisch)");
    expect(nl.fortuneSameDayAndNight).toBe('Dag en nacht dezelfde formule (modern)');
    expect(en.fortuneSectReversed).toBe('Reverse at night (Hellenistic)');
    expect(en.fortuneSameDayAndNight).toBe('Same formula day and night (modern)');
    expect(Object.keys(nl).sort()).toEqual(Object.keys(en).sort());
  });

  it('choosing the modern option puts same-day-and-night in the applied settings', async () => {
    const onRedraw = vi.fn<(next: ExtendedSettings, rulers: unknown) => void>();
    const { container, root } = await mount(onRedraw);
    openCard(container);
    act(() => {
      radioLabeled(formulaGroup(container), 'Same formula day and night (modern)').click();
    });
    const apply = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Apply and redraw');
    act(() => {
      apply?.click();
    });
    expect(onRedraw).toHaveBeenCalledTimes(1);
    expect(onRedraw.mock.calls[0]?.[0].fortuneFormula).toBe('same-day-and-night');
    expect(DEFAULT_EXTENDED_SETTINGS.fortuneFormula ?? 'sect-reversed').toBe('sect-reversed');
    unmount(container, root);
  });

  it('keeps the chosen formula through a save and reload of the settings', () => {
    const chosen: ExtendedSettings = { ...DEFAULT_EXTENDED_SETTINGS, fortuneFormula: 'same-day-and-night' };
    const reloaded = readCalculationSettings(JSON.parse(JSON.stringify(serializeCalculationSettings(chosen))));
    expect(reloaded?.kind === 'settings' ? reloaded.settings.fortuneFormula : undefined).toBe('same-day-and-night');
  });
});
