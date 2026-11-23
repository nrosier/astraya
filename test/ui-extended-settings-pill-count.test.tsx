// @vitest-environment jsdom
/**
 * The Extended settings pill shows how many settings differ from the defaults, never which ones (#1929).
 * The names stay in the drawer. Mounted with `createRoot` and real DOM nodes, in the style of
 * `ui-extended-settings-panel.test.tsx`; the provider is a hand-built fake (no ephemeris value is read here),
 * and the house-system name it returns is what the drawer's option label must still show.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { ExtendedSettingsPanel } from '../src/ui/ExtendedSettingsPanel.js';
import { extendedSettingsPanelMessages } from '../src/ui/ExtendedSettingsPanel.messages.js';
import { resetAccountPreferencesForTests } from '../src/ui/account-preferences.js';
import type { Locale } from '../src/interpretation/schema.js';
import { setLocale } from '../src/ui/locale.js';

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

const LOCALES: readonly Locale[] = ['en', 'nl'];

afterEach(() => {
  act(() => {
    setLocale('en');
  });
  resetAccountPreferencesForTests();
});

async function mount(locale: Locale, value: ExtendedSettings): Promise<{ container: HTMLElement; root: Root }> {
  act(() => {
    setLocale(locale);
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ExtendedSettingsPanel value={value} rulership="modern" onRedraw={() => undefined} provider={fakeProvider()} />,
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

const trigger = (container: HTMLElement): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>('button.extended-settings-trigger');
  if (found === null) throw new Error('fixture bug: no trigger');
  return found;
};

/** Three changes: a house system, a sidereal zodiac and a visibility policy. */
const THREE_CHANGES: ExtendedSettings = {
  ...DEFAULT_EXTENDED_SETTINGS,
  houseSystem: 'W',
  zodiac: { kind: 'sidereal', ayanamsa: 1 },
  objectPolicies: {
    ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
    chiron: { ...DEFAULT_EXTENDED_SETTINGS.objectPolicies.chiron, visible: false },
  },
};

/** One change: the house system alone. Its name, "House system W", must not reach the pill. */
const ONE_CHANGE: ExtendedSettings = { ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'W' };

for (const locale of LOCALES) {
  const messages = extendedSettingsPanelMessages[locale];
  const heading = messages.heading;
  const changed = (count: number): string => messages.triggerChanged(String(count));

  describe(`the Extended settings pill in ${locale} (#1929)`, () => {
    it('shows the default text and no count when nothing differs from the defaults', async () => {
      const { container, root } = await mount(locale, DEFAULT_EXTENDED_SETTINGS);
      const pill = trigger(container);
      expect(pill.querySelector('.extended-settings-trigger-count')).toBeNull();
      expect(pill.querySelector('.extended-settings-trigger-detail')).toBeNull();
      expect(pill.textContent).toBe(heading);
      expect(pill.getAttribute('aria-label')).toBe(heading);
      unmount(container, root);
    });

    it('shows the count of one change and no setting name', async () => {
      const { container, root } = await mount(locale, ONE_CHANGE);
      const pill = trigger(container);
      expect(pill.querySelector('.extended-settings-trigger-count')?.textContent).toBe(changed(1));
      expect(pill.textContent).toBe(`${heading}${changed(1)}`);
      expect(pill.textContent).not.toContain('House system');
      expect(pill.getAttribute('aria-label')).toBe(`${heading}: ${changed(1)}`);
      unmount(container, root);
    });

    it('shows the correct count of several changes and no setting name', async () => {
      const { container, root } = await mount(locale, THREE_CHANGES);
      const pill = trigger(container);
      expect(pill.querySelector('.extended-settings-trigger-count')?.textContent).toBe(changed(3));
      expect(pill.textContent).toBe(`${heading}${changed(3)}`);
      expect(pill.textContent).not.toContain('House system');
      expect(pill.textContent).not.toContain('Ayanamsa');
      expect(pill.textContent).not.toContain('Sidereal');
      expect(pill.textContent).not.toContain('Object');
      expect(pill.getAttribute('aria-label')).toBe(`${heading}: ${changed(3)}`);
      unmount(container, root);
    });

    it('keeps the names in the drawer', async () => {
      const { container, root } = await mount(locale, THREE_CHANGES);
      act(() => {
        trigger(container).click();
      });
      const dialog = container.querySelector('dialog');
      // The house-system option is labelled with the provider's name, as the drawer has always shown it.
      expect(dialog?.textContent).toContain('House system W');
      unmount(container, root);
    });
  });
}
