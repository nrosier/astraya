// @vitest-environment jsdom
/**
 * The fixed-star picker in the Extended settings drawer (#803): its staged list (added and removed stars are written
 * only by Apply, Cancel discards them, D-803e), the search control (results carry the magnitude, the result cap
 * holds), the seven-star preset, the read-only uncited 1.0° orb (D-803d) and the source-file line (D-803c). Mounted
 * with `createRoot`, like `ui-extended-settings-drawer.test.tsx`; the catalogue is the real shipped `sefstars.txt`
 * read from disk and handed in, so no fetch is made.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { NATAL_FIXED_STARS } from '../src/domain/chart-compute.js';
import type { ChosenFixedStar } from '../src/domain/person.js';
import { FIXED_STARS_ASSET } from '../src/ephemeris/assets.js';
import { parseStarCatalogue, sha256Hex, STAR_SEARCH_LIMIT } from '../src/ephemeris/star-catalogue.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { ExtendedSettingsPanel } from '../src/ui/ExtendedSettingsPanel.js';
import {
  chosenStarOf,
  sameChosenStars,
  withPresetStars,
  withStarAdded,
  withStarRemoved,
} from '../src/ui/fixed-star-draft.js';
import { fixedStarPickerMessages } from '../src/ui/FixedStarPicker.messages.js';
import { setLocale } from '../src/ui/locale.js';
import { writeRulershipChoice } from '../src/ui/rulership-setting.js';
import type { LoadedStarCatalogue } from '../src/ui/star-catalogue-source.js';

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

let catalogue: LoadedStarCatalogue;

beforeAll(async () => {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public/ephe/sefstars.txt')));
  catalogue = { entries: parseStarCatalogue(new TextDecoder().decode(bytes)).entries, sha256: await sha256Hex(bytes) };
});

afterEach(() => {
  localStorage.clear();
  writeRulershipChoice('modern');
  setLocale('en');
  document.body.innerHTML = '';
});

function entry(name: string): LoadedStarCatalogue['entries'][number] {
  const found = catalogue.entries.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`fixture bug: no ${name} in the catalogue`);
  return found;
}

describe('the staged chosen-star list (#803)', () => {
  it('stores the Swiss identifier, the equinox and the source-file hash with a selection', () => {
    expect(chosenStarOf(entry('Regulus'), catalogue.sha256)).toEqual({
      id: ',alLeo',
      name: 'Regulus',
      designation: 'alLeo',
      equinox: 'ICRS',
      sourceSha256: FIXED_STARS_ASSET.sha256,
    });
  });

  it('adds a star once, removes it by identifier, and compares lists in order', () => {
    const regulus = chosenStarOf(entry('Regulus'), catalogue.sha256);
    const vega = chosenStarOf(entry('Vega'), catalogue.sha256);
    const both = withStarAdded(withStarAdded([], regulus), vega);
    expect(withStarAdded(both, regulus)).toBe(both);
    expect(withStarRemoved(both, regulus.id)).toEqual([vega]);
    expect(sameChosenStars(both, [regulus, vega])).toBe(true);
    expect(sameChosenStars(both, [vega, regulus])).toBe(false);
  });

  it('the preset adds the seven NATAL_FIXED_STARS, keeping stars already chosen and not repeating any', () => {
    const vega = chosenStarOf(entry('Vega'), catalogue.sha256);
    const regulus = chosenStarOf(entry('Regulus'), catalogue.sha256);
    const next = withPresetStars([vega, regulus], catalogue.entries, catalogue.sha256);
    expect(next.map((star) => star.name)).toEqual(['Vega', 'Regulus', ...NATAL_FIXED_STARS.slice(1)]);
    expect(new Set(next.map((star) => star.name))).toEqual(new Set(['Vega', ...NATAL_FIXED_STARS]));
  });
});

const REGULUS: ChosenFixedStar = {
  id: ',alLeo',
  name: 'Regulus',
  designation: 'alLeo',
  equinox: 'ICRS',
  sourceSha256: FIXED_STARS_ASSET.sha256,
};

async function mount(
  fixedStars: readonly ChosenFixedStar[],
  onFixedStarsChange: (next: readonly ChosenFixedStar[]) => Promise<void>,
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ExtendedSettingsPanel
        value={DEFAULT_EXTENDED_SETTINGS}
        rulership="modern"
        onRedraw={vi.fn()}
        provider={fakeProvider()}
        fixedStars={fixedStars}
        onFixedStarsChange={onFixedStarsChange}
        loadCatalogue={() => Promise.resolve(catalogue)}
      />,
    );
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

async function openSpecialPoints(container: HTMLElement): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLButtonElement>('button.extended-settings-trigger')?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
  const tab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (candidate) => candidate.textContent === 'Special points',
  );
  act(() => {
    tab?.click();
  });
}

function starSection(container: HTMLElement): HTMLFieldSetElement {
  const found = Array.from(container.querySelectorAll<HTMLFieldSetElement>('dialog fieldset')).find(
    (candidate) => candidate.querySelector('legend')?.textContent === 'Fixed stars',
  );
  if (found === undefined) throw new Error('fixture bug: no fixed-star section');
  return found;
}

function search(container: HTMLElement, text: string): void {
  const input = starSection(container).querySelector<HTMLInputElement>('input[type="text"]');
  if (input === null) throw new Error('fixture bug: no search input');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function resultItems(container: HTMLElement): readonly HTMLLIElement[] {
  return Array.from(starSection(container).querySelectorAll<HTMLLIElement>('ul.fixed-star-results li'));
}

function click(container: HTMLElement, name: string): void {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('dialog button')).find(
    (candidate) => candidate.textContent.trim() === name,
  );
  if (button === undefined) throw new Error(`fixture bug: no button "${name}"`);
  act(() => {
    button.click();
  });
}

function chosenNames(container: HTMLElement): readonly string[] {
  return Array.from(starSection(container).querySelectorAll('tbody tr td:first-child')).map((cell) =>
    Array.from(cell.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join('')
      .trim(),
  );
}

describe('the picker in the drawer (#803)', () => {
  it('lives in the Special points tab', async () => {
    const { container, root } = await mount([], () => Promise.resolve());
    await openSpecialPoints(container);
    const panel = starSection(container).closest('[role="tabpanel"]');
    expect(panel?.hasAttribute('hidden')).toBe(false);
    expect(panel?.getAttribute('aria-labelledby')).toContain('special');
    unmount(container, root);
  });

  it('search results show name, designation and magnitude', async () => {
    const { container, root } = await mount([], () => Promise.resolve());
    await openSpecialPoints(container);
    search(container, 'Regulus');
    const [first] = resultItems(container);
    expect(first?.textContent).toContain('Regulus');
    expect(first?.textContent).toContain('alLeo');
    expect(first?.textContent).toContain(`magnitude ${String(entry('Regulus').magnitude)}`);
    unmount(container, root);
  });

  it('caps the results at STAR_SEARCH_LIMIT and says so', async () => {
    const { container, root } = await mount([], () => Promise.resolve());
    await openSpecialPoints(container);
    search(container, 'a');
    expect(resultItems(container)).toHaveLength(STAR_SEARCH_LIMIT);
    expect(starSection(container).textContent).toContain(`Only the first ${String(STAR_SEARCH_LIMIT)} are shown.`);
    unmount(container, root);
  });

  it('an added star is staged, not saved, and Cancel discards it', async () => {
    const save = vi.fn<(next: readonly ChosenFixedStar[]) => Promise<void>>(() => Promise.resolve());
    const { container, root } = await mount([], save);
    await openSpecialPoints(container);
    search(container, 'Vega');
    click(container, 'Add Vega');
    expect(chosenNames(container)).toEqual(['Vega']);
    expect(starSection(container).textContent).toContain('Draft, saved on Apply');
    expect(save).not.toHaveBeenCalled();
    click(container, 'Cancel');
    expect(save).not.toHaveBeenCalled();
    await openSpecialPoints(container);
    expect(chosenNames(container)).toEqual([]);
    unmount(container, root);
  });

  it('a removed star is staged too, and Cancel restores it', async () => {
    const save = vi.fn<(next: readonly ChosenFixedStar[]) => Promise<void>>(() => Promise.resolve());
    const { container, root } = await mount([REGULUS], save);
    await openSpecialPoints(container);
    click(container, 'Remove Regulus');
    expect(chosenNames(container)).toEqual([]);
    expect(save).not.toHaveBeenCalled();
    click(container, 'Cancel');
    await openSpecialPoints(container);
    expect(chosenNames(container)).toEqual(['Regulus']);
    expect(save).not.toHaveBeenCalled();
    unmount(container, root);
  });

  it('Apply writes the whole staged list once, with the selection’s identifier and file hash', async () => {
    const save = vi.fn<(next: readonly ChosenFixedStar[]) => Promise<void>>(() => Promise.resolve());
    const { container, root } = await mount([REGULUS], save);
    await openSpecialPoints(container);
    search(container, 'Vega');
    click(container, 'Add Vega');
    click(container, 'Remove Regulus');
    await act(async () => {
      click(container, 'Apply and redraw');
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toEqual([
      { id: ',alLyr', name: 'Vega', designation: 'alLyr', equinox: 'ICRS', sourceSha256: FIXED_STARS_ASSET.sha256 },
    ]);
    unmount(container, root);
  });

  it('the preset button stages the seven preset stars', async () => {
    const { container, root } = await mount([], () => Promise.resolve());
    await openSpecialPoints(container);
    click(container, 'Use the seven-star preset');
    expect(chosenNames(container)).toEqual(NATAL_FIXED_STARS);
    unmount(container, root);
  });

  it('shows the orb as a read-only 1.0° uncited label, with no control to change it', async () => {
    const { container, root } = await mount([REGULUS], () => Promise.resolve());
    await openSpecialPoints(container);
    const section = starSection(container);
    const orbCell = section.querySelector('tbody tr td:nth-child(3)');
    expect(orbCell?.textContent).toBe('1.0° uncited');
    expect(orbCell?.querySelector('input, select, button')).toBeNull();
    expect(section.textContent).toContain('The 1.0° orb is an Astraya convention and is not cited to a source.');
    unmount(container, root);
  });

  it('writes the orb in Dutch notation for a Dutch reader', async () => {
    setLocale('nl');
    const { container, root } = await mount([REGULUS], () => Promise.resolve());
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button.extended-settings-trigger')?.click();
      await Promise.resolve();
    });
    const orbCell = Array.from(container.querySelectorAll('dialog tbody tr td:nth-child(3)')).find((cell) =>
      cell.textContent.includes('zonder bron'),
    );
    expect(orbCell?.textContent).toBe('1,0° zonder bron');
    unmount(container, root);
  });

  it('names the source file and the first eight hex digits of its SHA-256, with no invented epoch', async () => {
    const { container, root } = await mount([], () => Promise.resolve());
    await openSpecialPoints(container);
    const line = starSection(container).querySelector('.fixed-star-source-line')?.textContent;
    expect(line).toBe(`Source file: sefstars.txt · SHA-256 ${FIXED_STARS_ASSET.sha256.slice(0, 8)}`);
    expect(line).not.toMatch(/ICRS|J2000|epoch/i);
    unmount(container, root);
  });
});

describe('the picker messages (#803)', () => {
  it('have the same keys in English and Dutch', () => {
    expect(Object.keys(fixedStarPickerMessages.nl).sort()).toEqual(Object.keys(fixedStarPickerMessages.en).sort());
  });
});
