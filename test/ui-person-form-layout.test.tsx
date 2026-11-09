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
import { LIFE_EVENTS_MAX, type LifeEvent } from '../src/domain/life-events.js';
import { personFileActionsMessages } from '../src/ui/PersonFileActions.messages.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

const { PersonForm } = await import('../src/ui/PersonForm.js');
const { StoreProvider } = await import('../src/ui/store-context.js');
const { setLocale } = await import('../src/ui/locale.js');

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
  it('puts the one-hour-error explanation in a tooltip on the identity heading, not in body text (#1228)', () => {
    const heading = card('identity').querySelector('#birth-card-identity');
    expect(heading?.textContent).toContain(t.identityCardHeading);
    const trigger = heading?.querySelector('button[aria-label]');
    expect(trigger?.getAttribute('aria-label')).toBe(t.identityInfoLabel);
    expect(container?.querySelector('p.tagline')).toBeNull();
  });

  it('orders the cards identity, place, notes, timezone details, export, replace data, danger', () => {
    const order = cards().map((element) =>
      [...element.classList].find((name) => name.startsWith('birth-record-card--')),
    );
    expect(order).toEqual([
      'birth-record-card--identity',
      'birth-record-card--location',
      'birth-record-card--notes',
      'birth-record-card--life-events',
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
    // Pristine: Save reads Saved ✓ and is idle (#896 owner spec 2026-11-01).
    expect(save?.textContent).toBe(t.savedButton);
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

describe('Life events card (#1399, slice S3)', () => {
  const tl = personFormMessages;

  function lifeCard(): HTMLElement {
    return card('life-events');
  }
  function rowEls(): HTMLElement[] {
    return [...lifeCard().querySelectorAll<HTMLElement>('.life-events-row')];
  }
  function rowAt(index: number): HTMLElement {
    const row = rowEls()[index];
    if (row === undefined) throw new Error('test fixture bug: no row ' + String(index));
    return row;
  }
  function addButton(): HTMLButtonElement {
    const button = lifeCard().querySelector<HTMLButtonElement>('button.life-events-add');
    if (button === null) throw new Error('test fixture bug: no Add event button');
    return button;
  }
  function saveBtn(): HTMLButtonElement {
    const button = container?.querySelector<HTMLButtonElement>('.page-header-row .birth-record-save button');
    if (button === null || button === undefined) throw new Error('no Save button');
    return button;
  }
  function typeInto(input: HTMLInputElement, value: string): void {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  function fields(row: HTMLElement): { date: HTMLInputElement; time: HTMLInputElement; label: HTMLInputElement } {
    const date = row.querySelector<HTMLInputElement>('input[type="date"]');
    const time = row.querySelector<HTMLInputElement>('input[type="time"]');
    const label = row.querySelector<HTMLInputElement>('input[type="text"]');
    if (date === null || time === null || label === null) throw new Error('test fixture bug: row inputs');
    return { date, time, label };
  }
  function clickAdd(): void {
    act(() => {
      addButton().click();
    });
  }
  async function clickSave(): Promise<void> {
    await act(async () => {
      saveBtn().click();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
  function fill(row: HTMLElement, date: string, label: string, time = ''): void {
    const inputs = fields(row);
    typeInto(inputs.date, date);
    typeInto(inputs.label, label);
    if (time !== '') typeInto(inputs.time, time);
  }
  function storedEvents(): readonly LifeEvent[] | undefined {
    return store.state.people.get('ada')?.lifeEvents;
  }

  afterEach(() => {
    act(() => {
      setLocale('en');
    });
  });

  it('adds, edits and deletes events through the page Save, and they survive a reload', async () => {
    expect(rowEls()).toHaveLength(0);
    expect(lifeCard().textContent).toContain(t.lifeEventsCount(0, 100));
    clickAdd();
    fill(rowAt(0), '2001-05-04', 'Moved abroad', '09:30');
    expect(saveBtn().disabled).toBe(false);
    await clickSave();
    expect(storedEvents()).toEqual([
      { id: expect.any(String) as string, date: '2001-05-04', time: '09:30', label: 'Moved abroad' },
    ]);

    // Edit: change the label and drop the time.
    const edited = rowAt(0);
    typeInto(fields(edited).label, 'Moved to Lisbon');
    typeInto(fields(edited).time, '');
    await clickSave();
    expect(storedEvents()).toEqual([
      { id: expect.any(String) as string, date: '2001-05-04', label: 'Moved to Lisbon' },
    ]);

    // A second event, then a reload of the store from the same database.
    clickAdd();
    fill(rowAt(1), '1999-01-02', 'Graduated');
    await clickSave();
    const reopened = await openStore({ name: `astraya-person-form-layout-${String(counter)}` });
    try {
      expect(reopened.state.people.get('ada')?.lifeEvents?.map((event) => event.label)).toEqual([
        'Graduated',
        'Moved to Lisbon',
      ]);
    } finally {
      reopened.close();
    }

    // Delete the first row shown; the page Save writes the removal.
    const removeButton = rowEls()[0]?.querySelector<HTMLButtonElement>('.life-events-remove');
    act(() => {
      removeButton?.click();
    });
    await clickSave();
    expect(storedEvents()?.map((event) => event.label)).toEqual(['Moved to Lisbon']);
  });

  it('shows rows in date, then time order, untimed events after timed ones on the same day', async () => {
    await act(async () => {
      await store.mutate([
        {
          entity: 'person',
          entityId: 'ada',
          field: 'lifeEvents',
          value: [
            { id: 'a', date: '2010-01-01', label: 'untimed' },
            { id: 'b', date: '2010-01-01', time: '08:00', label: 'timed' },
            { id: 'c', date: '2005-06-06', label: 'earlier' },
          ],
        },
      ]);
    });
    expect(rowEls().map((row) => fields(row).label.value)).toEqual(['earlier', 'timed', 'untimed']);
  });

  it('refuses the 101st event, disabled with a visible count and the reason', async () => {
    const events = Array.from({ length: LIFE_EVENTS_MAX - 1 }, (_, index) => ({
      id: `e${String(index)}`,
      date: '2000-01-01',
      label: `Event ${String(index)}`,
    }));
    await act(async () => {
      await store.mutate([{ entity: 'person', entityId: 'ada', field: 'lifeEvents', value: events }]);
    });
    expect(lifeCard().textContent).toContain(t.lifeEventsCount(99, 100));
    expect(addButton().disabled).toBe(false);
    clickAdd();
    expect(rowEls()).toHaveLength(100);
    expect(lifeCard().textContent).toContain(t.lifeEventsCount(100, 100));
    expect(addButton().disabled).toBe(true);
    expect(lifeCard().textContent).toContain(t.lifeEventsAtCap(100));
    const reason = lifeCard().querySelector(`#${addButton().getAttribute('aria-describedby') ?? 'none'}`);
    expect(reason?.textContent).toBe(t.lifeEventsAtCap(100));
    act(() => {
      addButton().click();
    });
    expect(rowEls()).toHaveLength(100);
  });

  for (const locale of ['en', 'nl'] as const) {
    it(`shows an error for invalid input and blocks Save (${locale})`, () => {
      act(() => {
        setLocale(locale);
      });
      const tt = tl[locale];
      clickAdd();
      const row = rowAt(0);
      typeInto(fields(row).label, 'x'.repeat(5));
      // Date missing: error beside the field, Save blocked with the reason beside it.
      expect(row.textContent).toContain(tt.lifeEventDateRequired);
      expect(row.querySelector('input[type="date"]')?.getAttribute('aria-invalid')).toBe('true');
      expect(saveBtn().disabled).toBe(true);
      expect(container?.textContent).toContain(tt.lifeEventsFixHint);
      typeInto(fields(row).date, '2001-05-04');
      typeInto(fields(row).label, '   ');
      expect(row.textContent).toContain(tt.lifeEventLabelRequired);
      expect(saveBtn().disabled).toBe(true);
    });
  }

  it('shows the warning for an unreadable list, offers no editor, and does not overwrite it', async () => {
    const broken = [{ id: 'a', date: '2001-02-30', label: 'impossible date' }];
    await act(async () => {
      await store.mutate([{ entity: 'person', entityId: 'ada', field: 'lifeEvents', value: broken }]);
    });
    expect(store.state.people.get('ada')?.lifeEventsUnreadable).toBe(true);
    expect(lifeCard().textContent).toContain(t.lifeEventsUnreadable);
    expect(lifeCard().textContent).toContain(t.lifeEventsUnreadableDetail);
    expect(lifeCard().querySelector('.life-events-row')).toBeNull();
    expect(lifeCard().querySelector('button.life-events-add')).toBeNull();

    // A save of another field leaves the unreadable register untouched.
    const nameInput = card('identity').querySelector<HTMLInputElement>('input');
    if (nameInput === null) throw new Error('test fixture bug: no name input');
    typeInto(nameInput, 'Ada King');
    await clickSave();
    expect(store.state.people.get('ada')?.displayName).toBe('Ada King');
    expect(store.state.people.get('ada')?.lifeEventsUnreadable).toBe(true);
    const sent = JSON.stringify(store.outgoing());
    expect(sent).toContain('impossible date');
    expect(sent.match(/"field":"lifeEvents"/g)).toHaveLength(1);
  });

  it('has an en/nl pair for every life events string', () => {
    const keys = (catalogue: object): string[] => Object.keys(catalogue).filter((key) => key.startsWith('lifeEvent'));
    expect(keys(personFormMessages.nl)).toEqual(keys(personFormMessages.en));
    expect(keys(personFormMessages.en).length).toBeGreaterThan(10);
  });
});
