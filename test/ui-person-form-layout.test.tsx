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
import { lifeEventCategoryMessages } from '../src/ui/LifeEventCategories.messages.js';
import { lifeEventsCardMessages } from '../src/ui/LifeEventsCard.messages.js';
import { lifeEventsDrawerMessages } from '../src/ui/LifeEventsDrawer.messages.js';
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

describe('Life events summary card and drawer (#1439)', () => {
  const td = lifeEventsDrawerMessages.en;
  const tc = lifeEventsCardMessages.en;

  function lifeCard(): HTMLElement {
    return card('life-events');
  }
  function drawer(): HTMLDialogElement {
    const found = container?.querySelector<HTMLDialogElement>('dialog.life-events-drawer');
    if (found === null || found === undefined) throw new Error('test fixture bug: no drawer');
    return found;
  }
  function buttonByText(scope: ParentNode, text: string): HTMLButtonElement {
    const found = [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text);
    if (found === undefined) throw new Error(`test fixture bug: no button ${text}`);
    return found;
  }
  function click(button: HTMLElement): void {
    act(() => {
      button.click();
    });
  }
  function typeInto(input: HTMLInputElement, value: string): void {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  function pressEnter(input: HTMLElement): void {
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
  }
  function input(scope: ParentNode, selector: string): HTMLInputElement {
    const found = scope.querySelector<HTMLInputElement>(selector);
    if (found === null) throw new Error(`test fixture bug: no ${selector}`);
    return found;
  }
  function openDrawer(): void {
    click(buttonByText(lifeCard(), tc.manageButton));
  }
  function quick(date: string, label: string): void {
    const form = drawer().querySelector('form.life-events-quick');
    if (form === null) throw new Error('test fixture bug: no quick add');
    typeInto(input(form, 'input[type="date"]'), date);
    typeInto(input(form, 'input[type="text"]'), label);
    pressEnter(input(form, 'input[type="text"]'));
  }
  async function saveAndClose(): Promise<void> {
    await act(async () => {
      buttonByText(drawer(), td.saveClose).click();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
  async function seed(events: readonly object[]): Promise<void> {
    await act(async () => {
      await store.mutate([{ entity: 'person', entityId: 'ada', field: 'lifeEvents', value: events as never }]);
    });
  }
  function stored(): readonly LifeEvent[] | undefined {
    return store.state.people.get('ada')?.lifeEvents;
  }
  function bodyRows(): HTMLElement[] {
    return [
      ...drawer().querySelectorAll<HTMLElement>(
        '.life-events-table .life-events-line, .life-events-table .life-events-edit-row',
      ),
    ];
  }

  afterEach(() => {
    act(() => {
      setLocale('en');
    });
  });

  it('shows the empty state: one line, the count and the same button, and no input fields', () => {
    const c = lifeCard();
    expect(c.textContent).toContain(tc.empty);
    expect(c.textContent).toContain(tc.manage(0));
    expect(buttonByText(c, tc.manageButton)).toBeDefined();
    expect(c.querySelector('.life-events-preview')).toBeNull();
    expect(c.querySelector('input, select, textarea')).toBeNull();
  });

  it('previews at most the 5 latest events, read-only, newest first, with the count of 100', async () => {
    await seed(
      Array.from({ length: 8 }, (_, index) => ({
        id: `e${String(index)}`,
        date: `200${String(index)}-01-01`,
        label: `Event ${String(index)}`,
      })),
    );
    const items = [...lifeCard().querySelectorAll('.life-events-preview li')].map((li) => li.textContent);
    expect(items).toEqual([
      '2007-01-01Event 7',
      '2006-01-01Event 6',
      '2005-01-01Event 5',
      '2004-01-01Event 4',
      '2003-01-01Event 3',
    ]);
    expect(lifeCard().textContent).toContain(tc.showing(8, 100));
    expect(lifeCard().textContent).toContain(tc.manage(8));
    expect(lifeCard().querySelector('input, select, textarea')).toBeNull();
  });

  it('opens the drawer from either button, with a heading that names the person and the count', async () => {
    await seed([{ id: 'a', date: '2001-05-04', label: 'Moved abroad' }]);
    click(buttonByText(lifeCard(), tc.manage(1)));
    expect(drawer().open || drawer().hasAttribute('open')).toBe(true);
    expect(drawer().querySelector('h2')?.textContent).toBe(td.heading('Ada Lovelace'));
    expect(drawer().textContent).toContain(td.configured(1, 100));
    expect(drawer().getAttribute('data-placement')).toBe('right');
  });

  it('adds with the quick-add row on Enter, writes only on Save and close, through the op log, and keeps the list after a reload', async () => {
    openDrawer();
    quick('2001-05-04', 'Moved abroad');
    expect(bodyRows()).toHaveLength(1);
    expect(stored()).toBeUndefined();
    // The next blank row has focus: the date field is empty and active.
    expect(document.activeElement).toBe(input(drawer(), 'form.life-events-quick input[type="date"]'));
    expect(input(drawer(), 'form.life-events-quick input[type="date"]').value).toBe('');
    quick('1999-01-02', 'Graduated');
    await saveAndClose();
    expect(stored()?.map((event) => event.label)).toEqual(['Graduated', 'Moved abroad']);
    expect(store.outgoing().filter((op) => op.field === 'lifeEvents')).toHaveLength(1);
    const reopened = await openStore({ name: `astraya-person-form-layout-${String(counter)}` });
    try {
      expect(reopened.state.people.get('ada')?.lifeEvents).toHaveLength(2);
    } finally {
      reopened.close();
    }
  });

  it('refuses a quick-add with a missing date or description and says why', () => {
    openDrawer();
    quick('', 'No date');
    expect(drawer().textContent).toContain(personFormMessages.en.lifeEventDateRequired);
    expect(bodyRows()).toHaveLength(0);
  });

  it('edits one row in place and leaves the others; the other Edit buttons are off meanwhile', async () => {
    await seed([
      { id: 'a', date: '2001-01-01', label: 'First' },
      { id: 'b', date: '2002-02-02', label: 'Second', category: 'career' },
    ]);
    openDrawer();
    click(buttonByText(drawer(), td.edit));
    const editing = drawer().querySelector<HTMLElement>('.life-events-edit-row');
    expect(editing).not.toBeNull();
    expect(bodyRows()).toHaveLength(2);
    const edits = [...drawer().querySelectorAll<HTMLButtonElement>('.life-events-cell-actions button')];
    expect(edits.every((button) => button.disabled)).toBe(true);
    expect(buttonByText(drawer(), td.saveClose).disabled).toBe(true);
    const label = editing?.querySelector<HTMLInputElement>('input[type="text"]');
    if (label === null || label === undefined) throw new Error('no label input');
    typeInto(label, 'First, edited');
    const select = editing?.querySelector('select');
    act(() => {
      if (select === null || select === undefined) return;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'marriage');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    click(buttonByText(drawer(), td.rowSave));
    await saveAndClose();
    expect(stored()).toEqual([
      { id: 'a', date: '2001-01-01', label: 'First, edited', category: 'marriage' },
      { id: 'b', date: '2002-02-02', label: 'Second', category: 'career' },
    ]);
  });

  it('searches the description, filters by category, sorts by date and offers Clear filters', async () => {
    await seed([
      { id: 'a', date: '2001-01-01', label: 'Moved to Lisbon', category: 'relocation' },
      { id: 'b', date: '2002-02-02', label: 'Wedding', category: 'marriage' },
      { id: 'c', date: '2003-03-03', label: 'Moved again' },
    ]);
    openDrawer();
    const labels = (): string[] => bodyRows().map((row) => row.querySelectorAll('[role="cell"]')[3]?.textContent ?? '');
    expect(labels()).toEqual(['Moved to Lisbon', 'Wedding', 'Moved again']);
    typeInto(input(drawer(), '.life-events-toolbar input'), 'moved');
    expect(labels()).toEqual(['Moved to Lisbon', 'Moved again']);
    click(buttonByText(drawer(), td.sortAscending));
    expect(labels()).toEqual(['Moved again', 'Moved to Lisbon']);
    const select = drawer().querySelector('.life-events-toolbar select');
    act(() => {
      if (select === null) return;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'marriage');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(labels()).toEqual([]);
    expect(drawer().textContent).toContain(td.noMatches);
    click(buttonByText(drawer(), td.clearFilters));
    expect(labels()).toHaveLength(3);
  });

  it('enforces the 100-event cap: add and quick-add are off, with the reason shown', async () => {
    await seed(
      Array.from({ length: LIFE_EVENTS_MAX }, (_, index) => ({
        id: `e${String(index)}`,
        date: '2000-01-01',
        label: `Event ${String(index)}`,
      })),
    );
    openDrawer();
    expect(drawer().textContent).toContain(td.configured(100, 100));
    expect(drawer().textContent).toContain(td.atCap(100));
    expect(buttonByText(drawer(), td.addNew).disabled).toBe(true);
    expect(buttonByText(drawer(), td.quickAddButton).disabled).toBe(true);
    expect(input(drawer(), 'form.life-events-quick input[type="date"]').disabled).toBe(true);
  });

  it('Clear all names the count, says it cannot be undone, deletes only after confirmation', async () => {
    await seed([
      { id: 'a', date: '2001-01-01', label: 'First' },
      { id: 'b', date: '2002-02-02', label: 'Second' },
    ]);
    openDrawer();
    click(buttonByText(drawer(), td.clearAll));
    const confirm = container?.querySelector<HTMLDialogElement>('dialog.life-events-confirm');
    expect(confirm?.textContent).toContain(td.confirmBody(2, 'Ada Lovelace'));
    expect(confirm?.textContent).toContain('cannot be undone');
    // Keeping the events deletes nothing.
    click(buttonByText(confirm as HTMLElement, td.confirmKeep));
    expect(stored()).toHaveLength(2);
    click(buttonByText(drawer(), td.clearAll));
    await act(async () => {
      buttonByText(
        container?.querySelector('dialog.life-events-confirm') ?? document.body,
        td.confirmDelete(2),
      ).click();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(stored()).toEqual([]);
  });

  it('imports a CSV into the draft, rejects a malformed file with a clear error and changes nothing', async () => {
    openDrawer();
    const file = drawer().querySelector<HTMLInputElement>('input[type="file"]');
    if (file === null) throw new Error('no file input');
    const choose = async (text: string): Promise<void> => {
      await act(async () => {
        Object.defineProperty(file, 'files', {
          configurable: true,
          value: [new File([text], 'events.csv', { type: 'text/csv' })],
        });
        file.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 25));
      });
    };
    await choose('date,time,category,description\n2020-02-30,,,Bad date\n');
    expect(drawer().textContent).toContain(td.importFailed);
    expect(drawer().textContent).toContain(td.csvDate(2));
    expect(bodyRows()).toHaveLength(0);
    await choose('date,time,category,description\n2020-02-02,10:00,career,New job\n');
    expect(drawer().textContent).toContain(td.importDone(1));
    expect(bodyRows()).toHaveLength(1);
    await saveAndClose();
    expect(stored()).toEqual([
      { id: expect.any(String) as string, date: '2020-02-02', time: '10:00', label: 'New job', category: 'career' },
    ]);
  });

  it('closes on Escape (cancel) without saving', () => {
    openDrawer();
    quick('2001-05-04', 'Discarded');
    act(() => {
      drawer().dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    expect(stored()).toBeUndefined();
    expect(drawer().hasAttribute('open') || drawer().open).toBe(false);
  });

  it('does not make the page Save dirty: the drawer writes on its own', () => {
    openDrawer();
    quick('2001-05-04', 'Moved abroad');
    const save = container?.querySelector<HTMLButtonElement>('.page-header-row .birth-record-save button');
    expect(save?.disabled).toBe(true);
  });

  it('shows the warning for an unreadable list, offers no buttons, and does not overwrite it', async () => {
    await seed([{ id: 'a', date: '2001-02-30', label: 'impossible date' }]);
    expect(store.state.people.get('ada')?.lifeEventsUnreadable).toBe(true);
    expect(lifeCard().textContent).toContain(t.lifeEventsUnreadable);
    expect(lifeCard().textContent).toContain(t.lifeEventsUnreadableDetail);
    expect(lifeCard().querySelector('button')).toBeNull();
    expect(container?.querySelector('dialog.life-events-drawer')).toBeNull();
  });

  it('has an en/nl pair for every new string', () => {
    for (const catalogue of [lifeEventsDrawerMessages, lifeEventsCardMessages, lifeEventCategoryMessages]) {
      expect(Object.keys(catalogue.nl)).toEqual(Object.keys(catalogue.en));
    }
    const keys = (catalogue: object): string[] => Object.keys(catalogue).filter((key) => key.startsWith('lifeEvent'));
    expect(keys(personFormMessages.nl)).toEqual(keys(personFormMessages.en));
  });
});
