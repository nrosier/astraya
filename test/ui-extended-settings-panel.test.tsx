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
import { extendedSettingsPanelMessages } from '../src/ui/ExtendedSettingsPanel.messages.js';
import type { RulershipChoice } from '../src/astrology/rulership.js';
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
  onRedraw: (next: unknown, rulers: unknown) => void,
  value: ExtendedSettings = DEFAULT_EXTENDED_SETTINGS,
  rulership: RulershipChoice = 'modern',
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ExtendedSettingsPanel value={value} rulership={rulership} onRedraw={onRedraw} provider={provider} />);
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

/** The option card of a named orb profile (#543), by its title. */
function orbProfileCard(container: HTMLElement, title: string): HTMLInputElement {
  const card = Array.from(
    container.querySelectorAll('[role="radiogroup"][aria-label="Orb profile"] .primitive-option-card'),
  ).find((candidate) => candidate.querySelector('.primitive-option-card-title')?.textContent === title);
  const radio = card?.querySelector('input');
  if (radio === null || radio === undefined) throw new Error(`fixture bug: no orb profile card "${title}"`);
  return radio;
}

/** The option card of a named traditional scheme (#549), by its title. */
function schemeCard(container: HTMLElement, title: string): HTMLInputElement {
  const card = Array.from(
    container.querySelectorAll('[role="radiogroup"][aria-label="Scheme"] .primitive-option-card'),
  ).find((candidate) => candidate.querySelector('.primitive-option-card-title')?.textContent === title);
  const radio = card?.querySelector('input');
  if (radio === null || radio === undefined) throw new Error(`fixture bug: no scheme card "${title}"`);
  return radio;
}

/** The planetary-rulers option cards (modern, traditional, both). */
function rulersRadios(container: HTMLElement): readonly HTMLInputElement[] {
  return [
    ...(container
      .querySelector('[role="radiogroup"][aria-label="Planetary rulers"]')
      ?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? []),
  ];
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
    expect(onRedraw).toHaveBeenCalledWith({ ...DEFAULT_EXTENDED_SETTINGS, rainbowZodiac: true }, 'modern');
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

  it('leaves an object out of the written report without hiding it, and includes it again cleanly (#721)', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);

    const interpreted = checkboxLabeled(container, 'Mars — included in the written report');
    expect(interpreted.checked).toBe(true);
    act(() => {
      interpreted.click();
    });
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });
    expect(onRedraw).toHaveBeenLastCalledWith(
      {
        ...DEFAULT_EXTENDED_SETTINGS,
        objectPolicies: {
          ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
          mars: { visible: true, aspectParticipant: true, interpreted: false },
        },
      },
      'modern',
    );
    unmount(container, root);

    // Ticked again, the flag is dropped rather than stored as `true`: the settings equal the defaults.
    const excluded = {
      ...DEFAULT_EXTENDED_SETTINGS,
      objectPolicies: {
        ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
        mars: { visible: true, aspectParticipant: true, interpreted: false },
      },
    };
    const again = await mount(fakeProvider(), onRedraw, excluded);
    openCard(again.container);
    act(() => {
      checkboxLabeled(again.container, 'Mars — included in the written report').click();
    });
    act(() => {
      buttonNamed(again.container, 'Apply and redraw')?.click();
    });
    expect(onRedraw).toHaveBeenLastCalledWith(DEFAULT_EXTENDED_SETTINGS, 'modern');
    unmount(again.container, again.root);
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

    expect(onRedraw).toHaveBeenCalledWith({ ...DEFAULT_EXTENDED_SETTINGS, midpointsVisible: true }, 'modern');
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

    expect(onRedraw).toHaveBeenCalledWith({ ...DEFAULT_EXTENDED_SETTINGS, lilithVariant: 'interpolated' }, 'modern');
    unmount(container, root);
  });

  it('explains Chiron, the Vertex and the Part of Spirit in plain words (#560)', async () => {
    const { container, root } = await mount(fakeProvider(), vi.fn());
    openCard(container);

    const hints = Array.from(container.querySelectorAll('.hint')).map((hint) => hint.textContent);
    expect(hints).toContain(extendedSettingsPanelMessages.en.chironHelp);
    expect(hints).toContain(extendedSettingsPanelMessages.en.vertexHelp);
    expect(hints).toContain(extendedSettingsPanelMessages.en.spiritHelp);
    unmount(container, root);
  });
});

describe('the trigger and the starting points (#442)', () => {
  it('says nothing about the defaults, and names only what was changed', async () => {
    const changed: ExtendedSettings = {
      ...DEFAULT_EXTENDED_SETTINGS,
      houseSystem: 'W',
      zodiac: { kind: 'sidereal', ayanamsa: 1 },
      objectPolicies: {
        ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
        partOfFortune: { ...DEFAULT_EXTENDED_SETTINGS.objectPolicies.partOfFortune, visible: true },
        chiron: { ...DEFAULT_EXTENDED_SETTINGS.objectPolicies.chiron, visible: false },
      },
    };
    const { container, root } = await mount(fakeProvider(), vi.fn(), changed);
    const text = trigger(container).textContent;
    expect(text).toContain('House system W');
    expect(text).toContain('Sidereal (Ayanamsa 1)');
    // Fortune and Chiron's visibility now live in one unified policy (#585) — both changes
    // collapse into a single "Object visibility customized" segment, not two named ones.
    expect(text).toContain('Object visibility customized');
    expect(text).toContain('3 changed');
    expect(text).not.toContain('Rainbow');
    expect(trigger(container).getAttribute('aria-label')).toContain('Object visibility customized');
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
    // It also sets the rulers, but only when applied.
    expect(container.textContent).toContain('also sets the planetary rulers to Traditional');
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });
    const applied = onRedraw.mock.calls[0]?.[0] as ExtendedSettings | undefined;
    expect(applied?.houseSystem).toBe('W');
    expect(applied?.objectPolicies.partOfFortune.visible).toBe(true);
    expect(applied?.objectPolicies.chiron.visible).toBe(false);
    // The rulers go to the caller (who saves them on the person), never to the device preference (#806).
    expect(onRedraw.mock.calls[0]?.[1]).toBe('traditional');
    expect(localStorage.getItem('astraya:rulershipChoice')).toBe('modern');

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

  it('stages a rulership change until Apply, and previews a symbol change at once (#806, #510)', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);
    expect(buttonNamed(container, 'Apply and redraw')?.disabled).toBe(true);
    chooseRulers(container, 1);
    // Only a draft: nothing is written to the device and the caller has not heard of it yet.
    expect(localStorage.getItem('astraya:rulershipChoice')).toBe('modern');
    expect(onRedraw).not.toHaveBeenCalled();
    expect(buttonNamed(container, 'Apply and redraw')?.disabled).toBe(false);
    const symbolsBefore = selectLabeled(container, 'Symbols').value;
    const symbolsAfter = symbolsBefore === 'text' ? 'unicode' : 'text';
    chooseOption(selectLabeled(container, 'Symbols'), symbolsAfter);
    expect(selectLabeled(container, 'Symbols').value).toBe(symbolsAfter);

    act(() => {
      buttonNamed(container, 'Cancel')?.click();
    });
    expect(onRedraw).not.toHaveBeenCalled();
    expect(localStorage.getItem('astraya:rulershipChoice')).toBe('modern');
    openCard(container);
    // Cancel dropped the rulers draft and put the symbols back.
    expect(rulersRadios(container).map((radio) => radio.checked)).toEqual([true, false, false]);
    expect(selectLabeled(container, 'Symbols').value).toBe(symbolsBefore);
    unmount(container, root);
  });

  it('hands the chosen rulers to the caller on Apply, together with the settings (#806)', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);
    chooseRulers(container, 1);
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });
    expect(onRedraw).toHaveBeenCalledTimes(1);
    expect(onRedraw.mock.calls[0]?.[0]).toEqual(DEFAULT_EXTENDED_SETTINGS);
    expect(onRedraw.mock.calls[0]?.[1]).toBe('traditional');
    expect(localStorage.getItem('astraya:rulershipChoice')).toBe('modern');
    unmount(container, root);
  });

  it('opens on the rulers it is given, not on the device preference (#806)', async () => {
    const { container, root } = await mount(fakeProvider(), vi.fn(), DEFAULT_EXTENDED_SETTINGS, 'both');
    openCard(container);
    expect(rulersRadios(container).map((radio) => radio.checked)).toEqual([false, false, true]);
    unmount(container, root);
  });

  it('"Save as my default" saves the draft rulers as the device default and calls nothing on the person (#806)', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);
    chooseRulers(container, 1);
    act(() => {
      buttonNamed(container, 'Save as my default')?.click();
    });
    expect(onRedraw).not.toHaveBeenCalled();
    expect(readDefaultCalculationProfile()?.rulership).toBe('traditional');
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

describe('the orb-profile quick-pick (#543)', () => {
  it('starts on Standard, matching the unscaled default, with no Custom card shown', async () => {
    const { container, root } = await mount(fakeProvider(), vi.fn());
    openCard(container);
    expect(orbProfileCard(container, 'Standard').checked).toBe(true);
    expect(() => orbProfileCard(container, 'Custom')).toThrow();
    unmount(container, root);
  });

  it('choosing Tight sets the scale slider and applies with it, without touching any other field', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);
    act(() => {
      orbProfileCard(container, 'Tight').click();
    });
    expect(orbProfileCard(container, 'Tight').checked).toBe(true);
    expect(container.textContent).toContain('-50%');
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });
    expect(onRedraw).toHaveBeenCalledWith(expect.objectContaining({ orbScalePercent: -50 }), 'modern');
    unmount(container, root);
  });

  it('shows Custom once the slider no longer matches any named profile', async () => {
    const changed: ExtendedSettings = { ...DEFAULT_EXTENDED_SETTINGS, orbScalePercent: 20 };
    const { container, root } = await mount(fakeProvider(), vi.fn(), changed);
    openCard(container);
    expect(orbProfileCard(container, 'Custom').checked).toBe(true);
    unmount(container, root);
  });
});

describe('the traditional-scheme quick-pick (#549)', () => {
  it('starts on Hellenistic — the app defaults (Egyptian bounds, standard orbs) are exactly that bundle', async () => {
    const { container, root } = await mount(fakeProvider(), vi.fn());
    openCard(container);
    expect(schemeCard(container, 'Hellenistic').checked).toBe(true);
    unmount(container, root);
  });

  it('choosing Renaissance (Lilly) sets Ptolemaic bounds and the Wide orb profile together, and applies both', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);
    act(() => {
      schemeCard(container, 'Renaissance (Lilly)').click();
    });
    expect(schemeCard(container, 'Renaissance (Lilly)').checked).toBe(true);
    expect(orbProfileCard(container, 'Wide').checked).toBe(true);
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });
    expect(onRedraw).toHaveBeenCalledWith(
      expect.objectContaining({ boundsScheme: 'ptolemaic', orbScalePercent: 40 }),
      'modern',
    );
    unmount(container, root);
  });

  it('shows Custom once the orb slider no longer matches any bundle at the chosen bounds table', async () => {
    const { container, root } = await mount(fakeProvider(), vi.fn());
    openCard(container);
    act(() => {
      schemeCard(container, 'Renaissance (Lilly)').click();
    });
    expect(schemeCard(container, 'Renaissance (Lilly)').checked).toBe(true);
    // Ptolemaic bounds + Standard orbs is not any named bundle (only Wide pairs with Ptolemaic here).
    act(() => {
      orbProfileCard(container, 'Standard').click();
    });
    expect(schemeCard(container, 'Custom').checked).toBe(true);
    unmount(container, root);
  });

  describe('the cited Lilly orb presets (#590)', () => {
    it('applies Lilly’s moieties at scale 0, and reads back as that preset', async () => {
      const onRedraw = vi.fn();
      const { container, root } = await mount(fakeProvider(), onRedraw);
      openCard(container);
      act(() => {
        orbProfileCard(container, 'Lilly (1647), first column').click();
      });
      expect(orbProfileCard(container, 'Lilly (1647), first column').checked).toBe(true);
      act(() => {
        buttonNamed(container, 'Apply and redraw')?.click();
      });
      const applied = onRedraw.mock.calls[0]?.[0] as ExtendedSettings;
      expect(applied.orbScalePercent).toBe(0);
      expect(applied.orbRules?.bodyOrbs).toEqual({
        saturn: 5,
        jupiter: 6,
        mars: 3.75,
        sun: 8.5,
        venus: 4,
        mercury: 3.5,
        moon: 6.25,
      });
      unmount(container, root);
    });

    it('is the selected card when the settings already hold exactly its moieties', async () => {
      const lilly: ExtendedSettings = {
        ...DEFAULT_EXTENDED_SETTINGS,
        orbRules: { bodyOrbs: { saturn: 4.5, jupiter: 4.5, mars: 3.5, sun: 7.5, venus: 3.5, mercury: 3.5, moon: 6 } },
      };
      const { container, root } = await mount(fakeProvider(), vi.fn(), lilly);
      openCard(container);
      expect(orbProfileCard(container, 'Lilly (1647), second column').checked).toBe(true);
      expect(() => orbProfileCard(container, 'Custom')).toThrow();
      unmount(container, root);
    });

    it('picking a built-in orb profile afterwards clears the moieties again', async () => {
      const onRedraw = vi.fn();
      const { container, root } = await mount(fakeProvider(), onRedraw);
      openCard(container);
      act(() => {
        orbProfileCard(container, 'Lilly (1647), first column').click();
      });
      act(() => {
        orbProfileCard(container, 'Standard').click();
      });
      act(() => {
        buttonNamed(container, 'Apply and redraw')?.click();
      });
      expect(onRedraw).not.toHaveBeenCalled();
      unmount(container, root);
    });
  });

  describe('the practitioner’s own orb rules (#590)', () => {
    /** Types into the number input inside the dialog whose label is `label`, the way a user's keystroke reaches React. */
    function typeInto(container: HTMLElement, legend: string, label: string, text: string): void {
      const group = Array.from(container.querySelectorAll('dialog fieldset')).find(
        (candidate) => candidate.querySelector('legend')?.textContent === legend,
      );
      const field = Array.from(group?.querySelectorAll('label') ?? []).find((candidate) =>
        candidate.textContent.startsWith(label),
      );
      const input = field instanceof HTMLLabelElement ? field.control : null;
      if (!(input instanceof HTMLInputElement)) throw new Error(`fixture bug: no "${label}" input in "${legend}"`);
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    const openGroup = (container: HTMLElement, name: string): void => {
      act(() => {
        Array.from(container.querySelectorAll<HTMLButtonElement>('dialog .primitive-disclosure-trigger'))
          .find((button) => button.textContent.startsWith(name))
          ?.click();
      });
    };

    it('applies a typed per-aspect orb as a rule, and nothing else changes', async () => {
      const onRedraw = vi.fn();
      const { container, root } = await mount(fakeProvider(), onRedraw);
      openCard(container);
      openGroup(container, 'Orb per aspect');
      typeInto(container, 'Trine', 'Orb', '9');
      act(() => {
        buttonNamed(container, 'Apply and redraw')?.click();
      });
      expect(onRedraw).toHaveBeenCalledWith(
        {
          ...DEFAULT_EXTENDED_SETTINGS,
          orbRules: { aspectOrbs: { trine: { base: 9, luminaryBonus: 0 } } },
        },
        'modern',
      );
      unmount(container, root);
    });

    it('does not offer Apply while a typed orb is out of range, and says why', async () => {
      const { container, root } = await mount(fakeProvider(), vi.fn());
      openCard(container);
      openGroup(container, 'Orb per aspect');
      typeInto(container, 'Trine', 'Orb', '45');
      expect(buttonNamed(container, 'Apply and redraw')?.disabled).toBe(true);
      expect(container.querySelector('dialog [role="alert"]')?.textContent).toContain('Check the orb rules');
      typeInto(container, 'Trine', 'Orb', '9');
      expect(buttonNamed(container, 'Apply and redraw')?.disabled).toBe(false);
      unmount(container, root);
    });

    it('shows Custom, and a built-in orb profile quick-pick clears the rules again', async () => {
      const onRedraw = vi.fn();
      const withRules: ExtendedSettings = {
        ...DEFAULT_EXTENDED_SETTINGS,
        orbRules: { bodyOrbs: { venus: 4, mars: 3 } },
      };
      const { container, root } = await mount(fakeProvider(), onRedraw, withRules);
      openCard(container);
      expect(orbProfileCard(container, 'Custom').checked).toBe(true);
      act(() => {
        orbProfileCard(container, 'Standard').click();
      });
      act(() => {
        buttonNamed(container, 'Apply and redraw')?.click();
      });
      expect(onRedraw).toHaveBeenCalledWith(DEFAULT_EXTENDED_SETTINGS, 'modern');
      unmount(container, root);
    });

    it('Cancel puts back the rules the card opened with', async () => {
      const withRules: ExtendedSettings = {
        ...DEFAULT_EXTENDED_SETTINGS,
        orbRules: { aspectOrbs: { trine: { base: 6, luminaryBonus: 1 } } },
      };
      const { container, root } = await mount(fakeProvider(), vi.fn(), withRules);
      openCard(container);
      openGroup(container, 'Orb per aspect');
      typeInto(container, 'Trine', 'Orb', '9');
      act(() => {
        buttonNamed(container, 'Cancel')?.click();
      });
      openCard(container);
      openGroup(container, 'Orb per aspect');
      const trine = Array.from(container.querySelectorAll('dialog fieldset')).find(
        (candidate) => candidate.querySelector('legend')?.textContent === 'Trine',
      );
      expect(trine?.querySelector('input')?.value).toBe('6');
      unmount(container, root);
    });
  });
});

describe('the station window and motion score controls (#724)', () => {
  it('both are off by default, and the window is labelled an Astraya convention', async () => {
    const { container, root } = await mount(fakeProvider(), vi.fn());
    openCard(container);
    const windowCheckbox = checkboxLabeled(container, 'Station window (Astraya convention)');
    expect(windowCheckbox.checked).toBe(false);
    expect(checkboxLabeled(container, 'Show the motion score on the condition table').checked).toBe(false);
    // No k field until the window is on: its label is absent while the window is off.
    expect(container.textContent).not.toContain('Window fraction k');
    expect(container.textContent).toContain('Astraya convention');
    unmount(container, root);
  });

  it('turning the window on reveals k at 0.05 and applies it, and turning it off removes the field', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);
    act(() => {
      checkboxLabeled(container, 'Station window (Astraya convention)').click();
    });
    expect(container.textContent).toContain('Window fraction k');
    const kInput = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="number"]')).find(
      (input) => input.value === '0.05',
    );
    expect(kInput).not.toBeUndefined();
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });
    expect(onRedraw).toHaveBeenLastCalledWith({ ...DEFAULT_EXTENDED_SETTINGS, stationWindow: { k: 0.05 } }, 'modern');
    unmount(container, root);
  });

  it('a bad k is not applied: zero and above one leave the stored value alone', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw, {
      ...DEFAULT_EXTENDED_SETTINGS,
      stationWindow: { k: 0.2 },
    });
    openCard(container);
    const kInput = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="number"]')).find(
      (input) => input.value === '0.2',
    );
    if (kInput === undefined) throw new Error('fixture bug: k field not found');
    for (const bad of ['0', '-1', '1.5']) {
      act(() => {
        // React tracks the value itself, so a plain assignment would be swallowed: go through the native setter.
        const nativeValueSetter = Reflect.get(
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ?? {},
          'set',
        ) as ((this: HTMLInputElement, value: string) => void) | undefined;
        nativeValueSetter?.call(kInput, bad);
        kInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });
    // Nothing invalid was written, so the card had nothing to apply: Apply stays unavailable.
    expect(onRedraw).not.toHaveBeenCalled();
    unmount(container, root);
  });

  it('the motion score applies as a single boolean, and is absent again when switched off', async () => {
    const onRedraw = vi.fn();
    const { container, root } = await mount(fakeProvider(), onRedraw);
    openCard(container);
    act(() => {
      checkboxLabeled(container, 'Show the motion score on the condition table').click();
    });
    act(() => {
      buttonNamed(container, 'Apply and redraw')?.click();
    });
    expect(onRedraw).toHaveBeenLastCalledWith({ ...DEFAULT_EXTENDED_SETTINGS, motionScore: true }, 'modern');
    unmount(container, root);
  });
});
