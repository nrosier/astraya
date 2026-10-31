// @vitest-environment jsdom
/**
 * The birth record's card layout (#795, #896): the markup order is the single-column order. Save changes sits in
 * the page header (#896, overriding D-795b), the resolved timezone is an inline row at the foot of the location
 * card, the raw timezone-data string stays reachable behind Show details (D-795a), the overrides sit in a
 * Disclosure, and the sticky action bar is gone.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store.js';
import { personFormMessages } from '../src/ui/PersonForm.messages.js';
import { personFileActionsMessages } from '../src/ui/PersonFileActions.messages.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

const { PersonForm } = await import('../src/ui/PersonForm.js');
const { StoreProvider } = await import('../src/ui/store-context.js');

const t = personFormMessages.en;
const tFiles = personFileActionsMessages.en;
let counter = 0;
let store: Store;
let root: Root | undefined;
let container: HTMLElement | undefined;

beforeEach(async () => {
  counter += 1;
  store = await openStore({ name: `astraya-person-form-layout-${String(counter)}` });
  await store.mutate([
    { entity: 'person', entityId: 'ada', field: 'displayName', value: 'Ada Lovelace' },
    { entity: 'person', entityId: 'ada', field: 'timeAccuracy', value: 'recorded' },
    {
      entity: 'person',
      entityId: 'ada',
      field: 'civil',
      value: { year: 1815, month: 12, day: 10, hour: 13, minute: 0, second: 0 },
    },
    { entity: 'person', entityId: 'ada', field: 'coordinates', value: { latitude: 51.5074, longitude: -0.1278 } },
  ]);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <StoreProvider store={store}>
        <PersonForm personId="ada" />
      </StoreProvider>,
    );
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
});

function cards(): HTMLElement[] {
  return [...(container?.querySelectorAll<HTMLElement>('.birth-record section.birth-record-card') ?? [])];
}

function card(modifier: string): HTMLElement {
  const found = cards().find((element) => element.classList.contains(`birth-record-card--${modifier}`));
  if (found === undefined) throw new Error(`test fixture bug: no ${modifier} card`);
  return found;
}

describe('PersonForm card layout (#795)', () => {
  it('orders the cards identity, place, notes, timezone details, export, replace data, danger', () => {
    const order = cards().map((element) =>
      [...element.classList].find((name) => name.startsWith('birth-record-card--')),
    );
    expect(order).toEqual([
      'birth-record-card--identity',
      'birth-record-card--location',
      'birth-record-card--notes',
      'birth-record-card--timezone',
      'birth-record-card--files',
      'birth-record-card--replace',
      'birth-record-card--danger',
    ]);
  });

  it('keeps the timezone status row in the location card and moves the details to their own card (#896, #895)', () => {
    expect(card('location').querySelector('.birth-record-timezone-status')).not.toBeNull();
    expect(card('timezone').querySelector('.birth-record-timezone-status')).toBeNull();
    expect(card('timezone').querySelector('.primitive-disclosure-trigger')).not.toBeNull();
  });

  it('puts the date, how the time is known, and the time in the identity card, and the coordinates in the place card', () => {
    const identity = card('identity');
    expect(identity.querySelector('input[type="date"]')).not.toBeNull();
    expect(identity.querySelector('input[type="time"]')).not.toBeNull();
    expect(identity.querySelector('select')).not.toBeNull();
    expect(identity.querySelector('.birth-record-timestamp')?.children).toHaveLength(3);
    const location = card('location');
    expect(location.querySelectorAll('.birth-record-coordinates input')).toHaveLength(2);
    expect(location.querySelector('.birth-place-search-form button[type="submit"]')).not.toBeNull();
  });

  it('shows the birth time as HH:MM, inside the identity card timestamp grid, with a one-minute step', () => {
    const input = card('identity').querySelector<HTMLInputElement>('.birth-record-timestamp input[type="time"]');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('13:00');
    expect(input?.step).toBe('60');
  });

  it('orders the timestamp fields date, how the time is known, then time', () => {
    const grid = card('identity').querySelector('.birth-record-timestamp');
    const kinds = [...(grid?.children ?? [])].map((child) => {
      if (child.querySelector('input[type="date"]') !== null) return 'date';
      if (child.querySelector('select') !== null) return 'rating';
      if (child.querySelector('input[type="time"]') !== null) return 'time';
      return 'other';
    });
    expect(kinds).toEqual(['date', 'rating', 'time']);
  });

  it('puts Save changes in the page header beside the title, not inside the Notes card (#896)', () => {
    const notes = card('notes');
    expect(notes.querySelector('textarea')).not.toBeNull();
    expect([...notes.querySelectorAll('button')].map((button) => button.textContent)).not.toContain(t.saveButton);
    const header = container?.querySelector('.page-header-row');
    expect(header?.querySelector('h1')).not.toBeNull();
    expect(header?.parentElement?.className).toBe('page-header');
    const save = header?.querySelector('.birth-record-save button');
    expect(save?.textContent).toBe(t.saveButton);
    expect(container?.querySelector('.sticky-actions')).toBeNull();
  });

  it('shows the timezone as an inline status row with a Show details control (#896)', () => {
    const status = card('location').querySelector('.birth-record-timezone-status');
    expect(status?.textContent).toMatch(/\S/);
    const details = card('timezone').querySelector('.primitive-disclosure-title');
    expect(details?.textContent).toBe(t.timezoneDetailsTitle);
    expect(card('timezone').querySelector('.primitive-disclosure-action')?.textContent).toBe(t.timezoneShowDetails);
  });

  it('shows the raw timezone data as a tabular value, with the overrides behind a Disclosure (D-795a)', () => {
    const row = card('timezone');
    const outer = row.querySelector('button.primitive-disclosure-trigger');
    expect(outer?.getAttribute('aria-expanded')).toBe('false');
    expect(row.querySelector('.birth-record-raw')).toBeNull();
    act(() => {
      (outer as HTMLButtonElement).click();
    });
    expect(row.querySelector('.birth-record-raw')?.textContent).toMatch(/\S/);
    const overrides = row.querySelector('.birth-record-overrides');
    expect(overrides).toBeNull();
    const inner = [...row.querySelectorAll<HTMLButtonElement>('button.primitive-disclosure-trigger')].at(-1);
    expect(inner?.querySelector('.primitive-disclosure-title')?.textContent).toBe(t.overridesTitle);
    act(() => {
      inner?.click();
    });
    expect(row.querySelector('.birth-record-overrides input')).not.toBeNull();
  });

  it('has a replace card with the import control and a files card with the three download buttons (#896)', () => {
    expect(card('replace').querySelector('input[type="file"]')).not.toBeNull();
    expect(card('replace').querySelector('.birth-record-export-row')).toBeNull();
    const row = card('files').querySelector('.birth-record-export-row');
    expect([...(row?.querySelectorAll('button') ?? [])].map((button) => button.textContent)).toEqual([
      tFiles.exportAaf,
      tFiles.exportJson,
      tFiles.exportCsv,
    ]);
    expect(card('files').querySelector('input[type="file"]')).toBeNull();
  });

  it('has a danger card with the delete button', () => {
    expect(card('danger').querySelector('button.danger')?.textContent).toBe(t.deleteButton('Ada Lovelace'));
  });

  it('shows an unknown birth time as unset, not as the stored 00:00 (#795, owner 2026-10-30)', async () => {
    await act(async () => {
      await store.mutate([{ entity: 'person', entityId: 'ada', field: 'timeAccuracy', value: 'unknown' }]);
    });
    const input = card('identity').querySelector<HTMLInputElement>('.birth-record-timestamp input[type="time"]');
    expect(input?.value).toBe('');
    expect(input?.disabled).toBe(true);
  });
});

describe('birth record card styling uses tokens only (#795)', () => {
  const css = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'app.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  const blocks = [...css.matchAll(/([^{}]*\.birth-record[^{}]*)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1] ?? '',
    body: m[2] ?? '',
  }));

  it('has birth-record rules to check', () => {
    expect(blocks.length).toBeGreaterThan(10);
  });

  it('uses no literal colours, no raw hairline widths and no pixel font sizes', () => {
    for (const { selector, body } of blocks) {
      expect(body, selector).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
      expect(body, selector).not.toMatch(/border(-[a-z]+)?:\s*(\d+(\.\d+)?px|thin|medium|thick)\b/);
      expect(body, selector).not.toMatch(/font-size:\s*\d+(\.\d+)?px/);
    }
  });

  it('draws the card border with the hairline token', () => {
    const cardRule = blocks.find((block) => block.selector.trim() === '.birth-record-card');
    expect(cardRule?.body).toMatch(/var\(--border-hairline\)/);
  });
});
