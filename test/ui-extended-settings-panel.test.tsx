// @vitest-environment jsdom
/**
 * A jsdom smoke test for `ExtendedSettingsPanel` (#52, #442), in the style of the
 * existing `chart-astrochart-wheel.test.tsx`: mount with `createRoot`,
 * interact with real DOM nodes, no React Testing Library. The provider here
 * is a hand-built fake rather than the real engine (unlike the
 * `chart-compute.ts` integration tests) — this test only exercises the
 * panel's own rendering and state, never an actual ephemeris value, so a
 * fake keeping just the two methods the panel calls is the right scope.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { ExtendedSettingsPanel } from '../src/ui/ExtendedSettingsPanel.js';
import { writeRulershipChoice } from '../src/ui/rulership-setting.js';

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

/** The one checkbox whose own `<label>` text includes `text`, assumed unique among checkboxes. */
function checkboxLabeled(container: HTMLElement, text: string): HTMLInputElement {
  const label = Array.from(container.querySelectorAll('label')).find(
    (candidate) => candidate.querySelector('input[type="checkbox"]') !== null && candidate.textContent.includes(text),
  );
  const input = label?.querySelector('input[type="checkbox"]');
  if (!(input instanceof HTMLInputElement)) throw new Error(`test fixture bug: no checkbox labeled "${text}"`);
  return input;
}

afterEach(() => {
  localStorage.clear();
  writeRulershipChoice('modern');
});

async function mount(
  provider: EphemerisProvider,
  onRedraw: (next: unknown) => void,
  value: ExtendedSettings = DEFAULT_EXTENDED_SETTINGS,
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ExtendedSettingsPanel value={value} onRedraw={onRedraw} provider={provider} />);
    // Lets the fake provider's already-resolved name-lookup promises settle and the
    // resulting re-render commit before assertions run.
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

const buttonNamed = (container: HTMLElement, name: string): HTMLButtonElement | undefined =>
  Array.from(container.querySelectorAll('button')).find((button) => button.textContent === name);

const trigger = (container: HTMLElement): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>('button.extended-settings-trigger');
  if (found === null) throw new Error('fixture bug: no trigger');
  return found;
};

function openCard(container: HTMLElement): void {
  act(() => {
    trigger(container).click();
  });
}

describe('ExtendedSettingsPanel', () => {
  it('shows a button, opens a modal card from it, and resolves house-system names asynchronously', async () => {
    const { container, root } = await mount(fakeProvider(), vi.fn());

    expect(trigger(container).textContent).toBe('Extended settings');
    expect(container.querySelector('dialog.settings-card')?.hasAttribute('open')).toBe(false);
    openCard(container);
    expect(container.querySelector('dialog.settings-card')?.hasAttribute('open')).toBe(true);

    const houseSelect = container.querySelector('dialog select');
    expect(houseSelect).not.toBeNull();
    const placidusOption = Array.from(container.querySelectorAll('select option')).find(
      (option) => (option as HTMLOptionElement).value === 'P',
    );
    expect(placidusOption?.textContent).toBe('House system P');

    unmount(container, root);
  });

  it('applies the edited draft, not the original value, once Apply and redraw is clicked', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);

    const rainbowCheckbox = checkboxLabeled(container, 'Rainbow Color Zodiac');
    expect(rainbowCheckbox.checked).toBe(false);
    act(() => {
      rainbowCheckbox.click();
    });
    expect(onRedraw).not.toHaveBeenCalled();

    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });

    expect(onRedraw).toHaveBeenCalledTimes(1);
    expect(onRedraw).toHaveBeenCalledWith({ ...DEFAULT_EXTENDED_SETTINGS, rainbowZodiac: true });
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(false);

    unmount(container, root);
  });

  it('cannot apply while nothing has changed, and Cancel drops the draft', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);

    const apply = buttonNamed(container, 'Apply and redraw');
    expect(apply?.disabled).toBe(true);
    act(() => {
      checkboxLabeled(container, 'Part of Fortune').click();
    });
    expect(buttonNamed(container, 'Apply and redraw')?.disabled).toBe(false);
    act(() => {
      buttonNamed(container, 'Cancel')?.click();
    });
    expect(onRedraw).not.toHaveBeenCalled();

    // Opened again, the draft starts from the applied value, not from what was abandoned.
    openCard(container);
    expect(checkboxLabeled(container, 'Part of Fortune').checked).toBe(false);

    unmount(container, root);
  });

  it('closes without applying on Escape', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);
    act(() => {
      checkboxLabeled(container, 'Vertex').click();
    });
    act(() => {
      container.querySelector('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    expect(onRedraw).not.toHaveBeenCalled();
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    unmount(container, root);
  });

  it('toggles the Midpoints checkbox and applies it set', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);

    const midpointsCheckbox = checkboxLabeled(container, 'Midpoints (ASC/MC, Sun/Moon)');
    expect(midpointsCheckbox.checked).toBe(false);
    act(() => {
      midpointsCheckbox.click();
    });
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });

    expect(onRedraw).toHaveBeenCalledWith({ ...DEFAULT_EXTENDED_SETTINGS, midpointsVisible: true });
    unmount(container, root);
  });

  it('reveals the ayanamsa picker only once Sidereal is chosen', async () => {
    const { container, root } = await mount(fakeProvider(), vi.fn());
    openCard(container);

    // The starting point, the house-system select, the planetary-rulers select (#426), the symbols and line-weight selects and
    // the Uranus and Pluto form selects (#419); the ayanamsa picker joins them.
    expect(container.querySelectorAll('select')).toHaveLength(7);
    const siderealRadio = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]')).find(
      (radio) => radio.name === 'extended-settings-zodiac' && !radio.checked,
    );
    expect(siderealRadio).not.toBeUndefined();
    act(() => {
      siderealRadio?.click();
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelectorAll('select')).toHaveLength(8);

    unmount(container, root);
  });

  it('selects the Interpolated Lilith radio and applies it set (#380)', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);

    const interpolatedRadio = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]')).find(
      (radio) =>
        radio.name === 'extended-settings-lilith' &&
        (radio.closest('label')?.textContent ?? '').includes('Interpolated'),
    );
    expect(interpolatedRadio).not.toBeUndefined();
    act(() => {
      interpolatedRadio?.click();
    });
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });

    expect(onRedraw).toHaveBeenCalledWith({ ...DEFAULT_EXTENDED_SETTINGS, lilithVariant: 'interpolated' });
    unmount(container, root);
  });
});

describe('the trigger and the starting points (#442)', () => {
  it('says nothing about the defaults, and names only what was changed', async () => {
    const changed: ExtendedSettings = {
      ...DEFAULT_EXTENDED_SETTINGS,
      houseSystem: 'W',
      zodiac: { kind: 'sidereal', ayanamsa: 1 },
      fortuneVisible: true,
      chironVisible: false,
    };
    const { container, root } = await mount(fakeProvider(), vi.fn(), changed);
    const text = trigger(container).textContent;
    expect(text).toContain('House system W');
    expect(text).toContain('Sidereal (Ayanamsa 1)');
    expect(text).toContain('Part of Fortune');
    expect(text).toContain('Chiron hidden');
    expect(text).toContain('4 changed');
    expect(text).not.toContain('Rainbow');
    expect(trigger(container).getAttribute('aria-label')).toContain('Chiron hidden');
    unmount(container, root);
  });

  it('fills the profile in one go from a starting point, and shows Custom once it no longer matches', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);

    const preset = container.querySelector<HTMLSelectElement>('dialog select');
    expect(preset?.value).toBe('modern');
    act(() => {
      if (preset === null) return;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(preset, 'traditional');
      preset.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(checkboxLabeled(container, 'Part of Fortune').checked).toBe(true);
    expect(container.querySelector<HTMLSelectElement>('dialog select')?.value).toBe('traditional');
    // It also sets the (device-wide) rulers, but only when applied.
    expect(container.textContent).toContain('also sets the planetary rulers to Traditional');
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });
    expect(onRedraw).toHaveBeenCalledWith(
      expect.objectContaining({ houseSystem: 'W', fortuneVisible: true, chironVisible: false }),
    );
    expect(localStorage.getItem('astraya:rulershipChoice')).toBe('traditional');

    unmount(container, root);
  });

  it('does not touch the rulers if the card is cancelled after choosing a starting point', async () => {
    const { container, root } = await mount(fakeProvider(), vi.fn());
    openCard(container);
    const preset = container.querySelector<HTMLSelectElement>('dialog select');
    act(() => {
      if (preset === null) return;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(preset, 'vedic');
      preset.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => {
      buttonNamed(container, 'Cancel')?.click();
    });
    expect(localStorage.getItem('astraya:rulershipChoice')).not.toBe('traditional');
    unmount(container, root);
  });
});
