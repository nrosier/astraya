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
      {},
      TRANSIT_ORB_CONFIG,
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

async function choose(container: HTMLElement, label: 'Show' | 'Orb', value: string): Promise<void> {
  // By its label: the panel also holds the planetary-rulers select (#426), so an index would drift.
  const labelled = [...container.querySelectorAll('label')].find((l) => l.textContent.trim() === label);
  const select =
    labelled === undefined ? null : container.querySelector<HTMLSelectElement>(`select[id="${labelled.htmlFor}"]`);
  if (select === null) throw new Error(`fixture bug: no "${label}" select`);
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

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
    expect(container.querySelector('select')?.value).toBe('important');
    expect(count(container)).toBe(
      `Showing ${String(expected.length)} of ${String(contacts.length)} transits (Important)`,
    );
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
      `Showing ${String(filterTransits(contacts, transitPreset('important', RULES.yearly)).length)} of ${String(contacts.length)} transits (Important)`,
    );
    expect(daily).toBe(
      `Showing ${String(filterTransits(contacts, transitPreset('important', RULES.daily)).length)} of ${String(contacts.length)} transits (Important)`,
    );
  });

  it('“Show all” shows everything, names the preset, and then disappears', async () => {
    const container = await mount();
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Show all');
    if (button === undefined) throw new Error('fixture bug: no Show all button');
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    expect(count(container)).toBe(`Showing ${totalCount()} of ${totalCount()} transits (All transits)`);
    expect(container.querySelector('select')?.value).toBe('all');
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Show all')).toBe(false);
    expect(container.textContent).not.toContain('Important, for a day');
  });

  it('adjusting a control stays a draft until Apply, then moves the preset to Custom and the count follows it', async () => {
    const container = await mount();
    await openCard(container);
    await check(container, 'Natal points', 'Jupiter');
    await check(container, 'Natal points', 'Saturn');
    // Still the live, unapplied filter — the whole point of staging (#489).
    expect(container.querySelector('select')?.value).toBe('important');
    await clickCardButton(container, 'Apply');
    expect(container.querySelector('select')?.value).toBe('custom');
    const base = transitPreset('important', RULES.daily);
    const expected = filterTransits(contacts, { ...base, natal: [...base.natal, 'jupiter', 'saturn'] });
    expect(count(container)).toBe(`Showing ${String(expected.length)} of ${String(contacts.length)} transits (Custom)`);
  });

  it('the orb scale re-filters once applied: Wide shows at least as many as Balanced, Tight no more', async () => {
    const container = await mount('en', 'yearly');
    const shownOf = (): number => Number(/Showing (\d+)/.exec(count(container))?.[1]);
    const balanced = shownOf();
    await openCard(container);
    await choose(container, 'Orb', 'wide');
    await clickCardButton(container, 'Apply');
    const wide = shownOf();
    await openCard(container);
    await choose(container, 'Orb', 'tight');
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
    expect(count(container)).toContain('Showing 0 of');
    expect(container.textContent).toContain('No transits match this filter');
  });

  it('remembers the choice per screen on this device, and a preset is rebuilt rather than frozen', async () => {
    const container = await mount('en', 'daily');
    await choose(container, 'Show', 'outer');
    await unmount();
    expect(JSON.parse(localStorage.getItem('astraya:transitFilter:daily') ?? 'null')).toEqual({ preset: 'outer' });
    expect((await mount('en', 'daily')).querySelector('select')?.value).toBe('outer');
    await unmount();
    // The yearly screen is its own context and still starts on its default.
    expect((await mount('en', 'yearly')).querySelector('select')?.value).toBe('important');
  });

  it('remembers a customised filter in full, once applied as the default', async () => {
    const container = await mount();
    await openCard(container);
    await check(container, 'Aspects', 'Minor');
    await clickCardButton(container, 'Apply as Default');
    const before = count(container);
    await unmount();
    const again = await mount();
    expect(again.querySelector('select')?.value).toBe('custom');
    expect(count(again)).toBe(before);
  });

  it('"Apply" (not "Apply as Default") commits to this view only, without changing the remembered default', async () => {
    const container = await mount();
    await openCard(container);
    await check(container, 'Aspects', 'Minor');
    await clickCardButton(container, 'Apply');
    expect(container.querySelector('select')?.value).toBe('custom');
    expect(localStorage.getItem('astraya:transitFilter:daily')).toBeNull();
    await unmount();
    // A fresh mount reads from storage, not the unmounted screen's in-memory state — the applied
    // customization was never remembered, so it starts back on the real default.
    const again = await mount();
    expect(again.querySelector('select')?.value).toBe('important');
  });

  it('"Reset to Default" resets the draft, not the live filter, and does not close the card', async () => {
    const container = await mount();
    await openCard(container);
    await check(container, 'Aspects', 'Minor');
    await clickCardButton(container, 'Reset to Default');
    // Still open, and the live filter untouched (never applied).
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(container.querySelector('select')?.value).toBe('important');
    expect(checkboxUnder(container, 'Aspects', 'Minor').checked).toBe(false);
  });

  it('Cancel discards the draft entirely', async () => {
    const container = await mount();
    await openCard(container);
    await check(container, 'Aspects', 'Minor');
    await clickCardButton(container, 'Cancel');
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(container.querySelector('select')?.value).toBe('important');
    await openCard(container);
    expect(checkboxUnder(container, 'Aspects', 'Minor').checked).toBe(false);
  });

  it('ignores a damaged saved value and starts on the default', async () => {
    localStorage.setItem('astraya:transitFilter:daily', '{"custom":{"transiting":"nope"}}');
    expect((await mount()).querySelector('select')?.value).toBe('important');
    await unmount();
    localStorage.setItem('astraya:transitFilter:daily', 'not json');
    expect((await mount()).querySelector('select')?.value).toBe('important');
  });

  it('has an accessible name for every control, and a legend for every group', async () => {
    const container = await mount();
    const unnamed = [...container.querySelectorAll('input, select')].filter(
      (control) => control.closest('label') === null && container.querySelector(`label[for="${control.id}"]`) === null,
    );
    expect(unnamed).toHaveLength(0);
    expect(container.querySelectorAll('fieldset').length).toBe(3);
    expect(container.querySelectorAll('fieldset legend')).toHaveLength(3);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('is in Dutch when the language is Dutch', async () => {
    const container = await mount('nl');
    expect(count(container)).toMatch(/^\d+ van \d+ transits getoond \(Belangrijk\)$/);
    expect(container.textContent).toContain('Toon alles');
    expect(container.textContent).toContain('Alleen toenemend');
    expect(container.textContent).toContain('Belangrijk, voor een dag');
  });
});

describe('every body can be chosen', () => {
  it('lists the transiting bodies and the natal points from the same body list', () => {
    expect(EVERY_BODY_KEY).toContain('chiron');
    expect(EVERY_BODY_KEY).toContain('meanNode');
    expect(contacts.every((c) => EVERY_BODY_KEY.includes(keyOf(c.bodyA)))).toBe(true);
  });
});
