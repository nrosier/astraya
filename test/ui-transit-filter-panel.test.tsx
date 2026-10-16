// @vitest-environment jsdom
/**
 * The transit filter controls (#416), driven the way a user does: change the preset, adjust a
 * control, read the count — against the real contacts of a real transit.
 */
import { act, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Aspect } from '../src/astrology/aspects.js';
import { bodyById } from '../src/astrology/bodies.js';
import {
  TRANSIT_ORB_CONFIG,
  filterTransits,
  transitPreset,
  type TransitContext,
  type TransitRuleContext,
} from '../src/astrology/transit-importance.js';
import { computeTransit } from '../src/domain/transit.js';
import { setLocale } from '../src/ui/locale.js';
import { EVERY_BODY_KEY, TransitFilterPanel, useTransitFilter } from '../src/ui/TransitFilterPanel.js';
import { getEngine } from './engine-harness.js';

let contacts: readonly Aspect[];
let mounted: { container: HTMLElement; root: Root } | undefined;
const keyOf = (id: number): string => bodyById(id)?.key ?? '';
const RULES: Record<TransitContext, TransitRuleContext> = {
  daily: { everyBodyKey: EVERY_BODY_KEY, context: 'daily' },
  yearly: { everyBodyKey: EVERY_BODY_KEY, context: 'yearly' },
};

beforeAll(async () => {
  const engine = await getEngine();
  const target = await engine.julianDayFromUtc(2024, 4, 8, 12, 0, 0);
  contacts = (
    await computeTransit(
      {
        civil: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
        coordinates: { latitude: 41.1833, longitude: -84.7333 },
        zoneOverride: 'America/New_York',
      },
      target,
      engine,
      { orbConfig: TRANSIT_ORB_CONFIG },
    )
  ).contacts;
}, 60_000);

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  localStorage.clear();
});

function Harness({ locale, context }: { locale: 'en' | 'nl'; context: TransitContext }) {
  const rules = RULES[context];
  const [filter, setFilter, applyForThisViewOnly] = useTransitFilter(rules);
  const shown = useMemo(() => filterTransits(contacts, filter), [filter]);
  return (
    <TransitFilterPanel
      filter={filter}
      rules={rules}
      onChange={setFilter}
      onApply={applyForThisViewOnly}
      onApplyAsDefault={setFilter}
      shown={shown.length}
      total={contacts.length}
      locale={locale}
    />
  );
}

async function mount(locale: 'en' | 'nl' = 'en', context: TransitContext = 'daily'): Promise<HTMLElement> {
  setLocale(locale);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Harness locale={locale} context={context} />);
    await Promise.resolve();
  });
  mounted = { container, root };
  return container;
}

async function unmount(): Promise<void> {
  if (mounted === undefined) return;
  const current = mounted;
  await act(async () => {
    current.root.unmount();
    await Promise.resolve();
  });
  current.container.remove();
  mounted = undefined;
}

const count = (container: HTMLElement): string => container.querySelector('[role="status"]')?.textContent ?? '';
const totalCount = (): string => String(contacts.length);

/** The radio of a named choice group (the preset row, or the orb scale in the dialog), by its visible label. */
function radio(container: HTMLElement, group: 'Show' | 'Orb', label: string): HTMLInputElement {
  const found = [...container.querySelectorAll(`[role="radiogroup"][aria-label="${group}"] label`)]
    .find((candidate) => candidate.textContent.trim() === label)
    ?.querySelector('input');
  if (found === null || found === undefined) throw new Error(`fixture bug: no "${label}" in "${group}"`);
  return found;
}

async function choose(container: HTMLElement, group: 'Show' | 'Orb', label: string): Promise<void> {
  const input = radio(container, group, label);
  await act(async () => {
    input.click();
    await Promise.resolve();
  });
}

/** The label of the preset radio that is selected. */
const selectedPreset = (container: HTMLElement): string | undefined =>
  [...container.querySelectorAll<HTMLInputElement>('[role="radiogroup"][aria-label="Show"] input')]
    .find((input) => input.checked)
    ?.closest('label')
    ?.textContent.trim();

function checkboxUnder(container: HTMLElement, legend: string, label: string): HTMLInputElement {
  const group = [...container.querySelectorAll('fieldset')].find(
    (fieldset) => fieldset.querySelector('legend')?.textContent === legend,
  );
  const input = [...(group?.querySelectorAll('label') ?? [])]
    .find((l) => l.textContent.trim().startsWith(label))
    ?.querySelector('input');
  if (input === null || input === undefined) throw new Error(`fixture bug: no "${label}" under "${legend}"`);
  return input;
}

async function check(container: HTMLElement, legend: string, label: string): Promise<void> {
  const input = checkboxUnder(container, legend, label);
  await act(async () => {
    input.click();
    await Promise.resolve();
  });
}

/** The "Adjust the filter" trigger that opens the staged card (#489). */
function adjustTrigger(container: HTMLElement): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
  if (found === null) throw new Error('fixture bug: no Adjust the filter trigger');
  return found;
}

async function openCard(container: HTMLElement): Promise<void> {
  await act(async () => {
    adjustTrigger(container).click();
    await Promise.resolve();
  });
}

/** A footer button inside the Adjust card, by its exact text (Apply / Apply as Default / Reset to Default / Cancel). */
function cardButton(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>('dialog button')].find(
    (button) => button.textContent === text,
  );
  if (found === undefined) throw new Error(`fixture bug: no "${text}" button in the Adjust card`);
  return found;
}

async function clickCardButton(container: HTMLElement, text: string): Promise<void> {
  await act(async () => {
    cardButton(container, text).click();
    await Promise.resolve();
  });
}

describe('TransitFilterPanel (#416)', () => {
  it('starts on the important transits and says how many of the total are shown, naming the preset', async () => {
    const container = await mount();
    const expected = filterTransits(contacts, transitPreset('important', RULES.daily));
    expect(selectedPreset(container)).toBe('Important');
    expect(count(container)).toBe(`Important · ${String(expected.length)} of ${String(contacts.length)} shown`);
  });

  it('explains the daily rule on a daily screen and the yearly rule on a yearly one', async () => {
    expect((await mount('en', 'daily')).textContent).toContain('Important, for a day');
    await unmount();
    const yearly = await mount('en', 'yearly');
    expect(yearly.textContent).toContain('Important, for a year');
    expect(yearly.textContent).not.toContain('Important, for a day');
  });

  it('the two screens start on different important lists', async () => {
    const daily = count(await mount('en', 'daily'));
    await unmount();
    const yearly = count(await mount('en', 'yearly'));
    expect(yearly).toBe(
      `Important · ${String(filterTransits(contacts, transitPreset('important', RULES.yearly)).length)} of ${String(contacts.length)} shown`,
    );
    expect(daily).toBe(
      `Important · ${String(filterTransits(contacts, transitPreset('important', RULES.daily)).length)} of ${String(contacts.length)} shown`,
    );
  });

  it('the “All” preset shows everything and names itself; no separate Show all button exists', async () => {
    const container = await mount();
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Show all')).toBe(false);
    await choose(container, 'Show', 'All');
    expect(count(container)).toBe(`All · ${totalCount()} of ${totalCount()} shown`);
    expect(selectedPreset(container)).toBe('All');
    expect(container.textContent).not.toContain('Important, for a day');
  });

  it('adjusting a control stays a draft until Apply, then moves the preset to Custom and the count follows it', async () => {
    const container = await mount();
    await openCard(container);
    await check(container, 'Natal points', 'Jupiter');
    await check(container, 'Natal points', 'Saturn');
    // Still the live, unapplied filter — the whole point of staging (#489).
    expect(selectedPreset(container)).toBe('Important');
    await clickCardButton(container, 'Apply');
    expect(selectedPreset(container)).toBe('Custom');
    const base = transitPreset('important', RULES.daily);
    const expected = filterTransits(contacts, { ...base, natal: [...base.natal, 'jupiter', 'saturn'] });
    expect(count(container)).toBe(`Custom · ${String(expected.length)} of ${String(contacts.length)} shown`);
  });

  it('the orb scale re-filters once applied: Wide shows at least as many as Balanced, Tight no more', async () => {
    const container = await mount('en', 'yearly');
    const shownOf = (): number => Number(/· (\d+) of/.exec(count(container))?.[1]);
    const balanced = shownOf();
    await openCard(container);
    await choose(container, 'Orb', 'Wide (at least 5°)');
    await clickCardButton(container, 'Apply');
    const wide = shownOf();
    await openCard(container);
    await choose(container, 'Orb', 'Tight (up to 1.5°)');
    await clickCardButton(container, 'Apply');
    const tight = shownOf();
    expect(wide).toBeGreaterThanOrEqual(balanced);
    expect(tight).toBeLessThanOrEqual(balanced);
    expect(wide).toBeGreaterThan(tight);
  });

  it('the aspect groups toggle their aspects together: Minor adds the three minors, unticking Hard removes the three hard ones', async () => {
    const container = await mount();
    await openCard(container);
    const minor = checkboxUnder(container, 'Aspects', 'Minor');
    expect(minor.checked).toBe(false);
    expect(checkboxUnder(container, 'Aspects', 'Hard').checked).toBe(true);
    await check(container, 'Aspects', 'Minor');
    expect(checkboxUnder(container, 'Aspects', 'Minor').checked).toBe(true);
    await check(container, 'Aspects', 'Hard');
    expect(checkboxUnder(container, 'Aspects', 'Hard').checked).toBe(false);
    expect(checkboxUnder(container, 'Aspects', 'Soft').checked).toBe(true);
  });

  it('says so when the filter hides everything', async () => {
    const container = await mount();
    await openCard(container);
    for (const label of [
      'Sun',
      'Moon',
      'Mercury',
      'Venus',
      'Mars',
      'Jupiter',
      'Saturn',
      'Uranus',
      'Neptune',
      'Pluto',
    ]) {
      await check(container, 'Transiting planets', label);
    }
    await clickCardButton(container, 'Apply');
    expect(count(container)).toContain('· 0 of');
    expect(container.textContent).toContain('No transits match the Custom filter');
    const clear = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Clear filters');
    if (clear === undefined) throw new Error('fixture bug: no Clear filters button');
    await act(async () => {
      clear.click();
      await Promise.resolve();
    });
    expect(selectedPreset(container)).toBe('All');
  });

  it('remembers the choice per screen on this device, and a preset is rebuilt rather than frozen', async () => {
    const container = await mount('en', 'daily');
    await choose(container, 'Show', 'Outer');
    await unmount();
    expect(JSON.parse(localStorage.getItem('astraya:transitFilter:daily') ?? 'null')).toEqual({ preset: 'outer' });
    expect(selectedPreset(await mount('en', 'daily'))).toBe('Outer');
    await unmount();
    // The yearly screen is its own context and still starts on its default.
    expect(selectedPreset(await mount('en', 'yearly'))).toBe('Important');
  });

  it('remembers a customised filter in full, once applied as the default', async () => {
    const container = await mount();
    await openCard(container);
    await check(container, 'Aspects', 'Minor');
    await clickCardButton(container, 'Apply as Default');
    const before = count(container);
    await unmount();
    const again = await mount();
    expect(selectedPreset(again)).toBe('Custom');
    expect(count(again)).toBe(before);
  });

  it('"Apply" (not "Apply as Default") commits to this view only, without changing the remembered default', async () => {
    const container = await mount();
    await openCard(container);
    await check(container, 'Aspects', 'Minor');
    await clickCardButton(container, 'Apply');
    expect(selectedPreset(container)).toBe('Custom');
    expect(localStorage.getItem('astraya:transitFilter:daily')).toBeNull();
    await unmount();
    // A fresh mount reads from storage, not the unmounted screen's in-memory state — the applied
    // customization was never remembered, so it starts back on the real default.
    const again = await mount();
    expect(selectedPreset(again)).toBe('Important');
  });

  it('"Reset to Default" resets the draft, not the live filter, and does not close the card', async () => {
    const container = await mount();
    await openCard(container);
    await check(container, 'Aspects', 'Minor');
    await clickCardButton(container, 'Reset to Default');
    // Still open, and the live filter untouched (never applied).
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(selectedPreset(container)).toBe('Important');
    expect(checkboxUnder(container, 'Aspects', 'Minor').checked).toBe(false);
  });

  it('Cancel discards the draft entirely', async () => {
    const container = await mount();
    await openCard(container);
    await check(container, 'Aspects', 'Minor');
    await clickCardButton(container, 'Cancel');
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(selectedPreset(container)).toBe('Important');
    await openCard(container);
    expect(checkboxUnder(container, 'Aspects', 'Minor').checked).toBe(false);
  });

  it('ignores a damaged saved value and starts on the default', async () => {
    localStorage.setItem('astraya:transitFilter:daily', '{"custom":{"transiting":"nope"}}');
    expect(selectedPreset(await mount())).toBe('Important');
    await unmount();
    localStorage.setItem('astraya:transitFilter:daily', 'not json');
    expect(selectedPreset(await mount())).toBe('Important');
  });

  it('has an accessible name for every control, and a legend for every group', async () => {
    const container = await mount();
    await openCard(container);
    const unnamed = [...container.querySelectorAll('input, select')].filter(
      (control) => control.closest('label') === null && container.querySelector(`label[for="${control.id}"]`) === null,
    );
    expect(unnamed).toHaveLength(0);
    expect(container.querySelectorAll('[role="radiogroup"][aria-label]').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('fieldset').length).toBe(3);
    expect(container.querySelectorAll('fieldset legend')).toHaveLength(3);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('is in Dutch when the language is Dutch', async () => {
    const container = await mount('nl');
    expect(count(container)).toMatch(/^Belangrijk · \d+ van \d+ getoond$/);
    expect(container.textContent).toContain('Filters wijzigen');
    await openCard(container);
    expect(container.textContent).toContain('Alleen toenemend');
    expect(container.textContent).toContain('Belangrijk, voor een dag');
  });
});

describe('the dialog’s group actions (#513)', () => {
  it('All and Clear set every body in a group at once, as a draft', async () => {
    const container = await mount();
    await openCard(container);
    const group = [...container.querySelectorAll('fieldset')].find(
      (fieldset) => fieldset.querySelector('legend')?.textContent === 'Natal points',
    );
    const press = async (label: string): Promise<void> => {
      const button = [...(group?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label);
      if (button === undefined) throw new Error(`fixture bug: no ${label}`);
      await act(async () => {
        button.click();
        await Promise.resolve();
      });
    };
    await press('Clear');
    expect([...(group?.querySelectorAll('input') ?? [])].every((input) => !input.checked)).toBe(true);
    await press('All');
    expect([...(group?.querySelectorAll('input') ?? [])].every((input) => input.checked)).toBe(true);
    // Still a draft: the live filter is the preset it was.
    expect(selectedPreset(container)).toBe('Important');
  });

  it('keeps the global planetary-rulers preference out of the dialog and points to Preferences', async () => {
    const container = await mount();
    await openCard(container);
    expect(container.querySelector('dialog [aria-label="Planetary rulers"]')).toBeNull();
    expect(container.querySelector('dialog a[href="#/preferences/astrology"]')).not.toBeNull();
  });
});

describe('every body can be chosen', () => {
  it('lists the transiting bodies and the natal points from the same body list', () => {
    expect(EVERY_BODY_KEY).toContain('chiron');
    expect(EVERY_BODY_KEY).toContain('meanNode');
    expect(contacts.every((c) => EVERY_BODY_KEY.includes(keyOf(c.bodyA)))).toBe(true);
  });
});
