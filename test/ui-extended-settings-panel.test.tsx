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
import { readDefaultCalculationProfile } from '../src/ui/default-calculation-profile.js';
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

/** The `<select>` a dialog label names, found the way a user's label click would: by `for`/`id`, or nested. */
function selectLabeled(container: HTMLElement, text: string): HTMLSelectElement {
  const label = Array.from(container.querySelectorAll('dialog label')).find((candidate) =>
    candidate.textContent.includes(text),
  );
  const target = label?.querySelector('select') ?? (label instanceof HTMLLabelElement ? label.control : null);
  if (!(target instanceof HTMLSelectElement)) throw new Error(`test fixture bug: no select labeled "${text}"`);
  return target;
}

function chooseOption(select: HTMLSelectElement, value: string): void {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/** The option card of a calculation profile, by its title. */
function profileCard(container: HTMLElement, title: string): HTMLInputElement {
  const card = Array.from(
    container.querySelectorAll('[role="radiogroup"][aria-label="Calculation profile"] .primitive-option-card'),
  ).find((candidate) => candidate.querySelector('.primitive-option-card-title')?.textContent === title);
  const radio = card?.querySelector('input');
  if (radio === null || radio === undefined) throw new Error(`fixture bug: no profile card "${title}"`);
  return radio;
}

/** Picks the nth planetary-rulers option card (modern, traditional, both). */
function chooseRulers(container: HTMLElement, index: number): void {
  const radio = container
    .querySelector('[role="radiogroup"][aria-label="Planetary rulers"]')
    ?.querySelectorAll<HTMLInputElement>('input[type="radio"]')[index];
  if (radio === undefined) throw new Error('fixture bug: no rulers option');
  act(() => {
    radio.click();
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

  it('remembers a Custom draft as the device default without redrawing the open chart (#510)', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);

    const rainbowCheckbox = checkboxLabeled(container, 'Rainbow Color Zodiac');
    act(() => {
      rainbowCheckbox.click();
    });

    act(() => {
      buttonNamed(container, 'Save as my default')?.click();
    });

    expect(onRedraw).not.toHaveBeenCalled();
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(readDefaultCalculationProfile()?.settings).toEqual({ ...DEFAULT_EXTENDED_SETTINGS, rainbowZodiac: true });
    expect(readDefaultCalculationProfile()?.rulership).toBe('modern');

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

    // The house-system select, the symbols and line-weight selects and
    // the Uranus and Pluto form selects (#419); the ayanamsa picker joins them.
    expect(container.querySelectorAll('select')).toHaveLength(5);
    const siderealRadio = Array.from(
      container.querySelectorAll<HTMLInputElement>('[role="radiogroup"][aria-label="Zodiac"] input[type="radio"]'),
    ).find((radio) => !radio.checked);
    expect(siderealRadio).not.toBeUndefined();
    act(() => {
      siderealRadio?.click();
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelectorAll('select')).toHaveLength(6);

    unmount(container, root);
  });

  it('selects the Interpolated Lilith radio and applies it set (#380)', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);

    const interpolatedRadio = Array.from(
      container.querySelectorAll<HTMLInputElement>('[role="radiogroup"][aria-label*="Lilith"] input[type="radio"]'),
    ).find((radio) => (radio.closest('label')?.textContent ?? '').includes('Interpolated'));
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

  it('replaces every profile-owned value from a built-in calculation profile, and shows Custom once it no longer matches', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);

    expect(profileCard(container, 'Modern Western').checked).toBe(true);
    act(() => {
      profileCard(container, 'Traditional Western').click();
    });
    expect(checkboxLabeled(container, 'Part of Fortune').checked).toBe(true);
    expect(profileCard(container, 'Traditional Western').checked).toBe(true);
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
    act(() => {
      profileCard(container, 'Sidereal (Lahiri)').click();
    });
    act(() => {
      buttonNamed(container, 'Cancel')?.click();
    });
    expect(localStorage.getItem('astraya:rulershipChoice')).not.toBe('traditional');
    unmount(container, root);
  });

  it('previews a rulership or symbol change at once, and Cancel puts both back (#510)', async () => {
    const { container, root } = await mount(fakeProvider(), vi.fn());
    openCard(container);
    expect(buttonNamed(container, 'Apply and redraw')?.disabled).toBe(true);
    chooseRulers(container, 1);
    expect(localStorage.getItem('astraya:rulershipChoice')).toBe('traditional');
    const symbolsBefore = selectLabeled(container, 'Symbols').value;
    const symbolsAfter = symbolsBefore === 'text' ? 'unicode' : 'text';
    chooseOption(selectLabeled(container, 'Symbols'), symbolsAfter);
    expect(selectLabeled(container, 'Symbols').value).toBe(symbolsAfter);
    // A device preference changed in the card counts as a change to apply or drop.
    expect(buttonNamed(container, 'Apply and redraw')?.disabled).toBe(false);

    act(() => {
      buttonNamed(container, 'Cancel')?.click();
    });
    expect(localStorage.getItem('astraya:rulershipChoice')).toBe('modern');
    openCard(container);
    expect(selectLabeled(container, 'Symbols').value).toBe(symbolsBefore);
    unmount(container, root);
  });

  it('keeps a previewed rulership when the card is applied (#510)', async () => {
    const { container, root } = await mount(fakeProvider(), vi.fn());
    openCard(container);
    chooseRulers(container, 1);
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });
    expect(localStorage.getItem('astraya:rulershipChoice')).toBe('traditional');
    unmount(container, root);
  });

  it('has two resets that name their target: "my default" only when one is saved, and "Astraya default" always (#510)', async () => {
    const { container, root } = await mount(fakeProvider(), vi.fn());
    openCard(container);
    expect(buttonNamed(container, 'Reset to my default')).toBeUndefined();
    expect(buttonNamed(container, 'Reset to Astraya default')).toBeDefined();
    expect(buttonNamed(container, 'Reset to defaults')).toBeUndefined();

    // Save a Custom default, then wander off it: "my default" returns to it, "Astraya default" to the shipped one.
    act(() => {
      checkboxLabeled(container, 'Rainbow Color Zodiac').click();
    });
    act(() => {
      buttonNamed(container, 'Save as my default')?.click();
    });
    expect(readDefaultCalculationProfile()?.settings.rainbowZodiac).toBe(true);

    openCard(container);
    expect(checkboxLabeled(container, 'Rainbow Color Zodiac').checked).toBe(false);
    act(() => {
      buttonNamed(container, 'Reset to my default')?.click();
    });
    expect(checkboxLabeled(container, 'Rainbow Color Zodiac').checked).toBe(true);
    act(() => {
      buttonNamed(container, 'Reset to Astraya default')?.click();
    });
    expect(checkboxLabeled(container, 'Rainbow Color Zodiac').checked).toBe(false);
    unmount(container, root);
  });
});
