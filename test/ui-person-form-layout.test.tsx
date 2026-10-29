// @vitest-environment jsdom
/**
 * The birth record's card layout (#795): the markup order is the single-column order, so the resolved
 * timezone card comes before Save changes (D-795b), Save changes is the last control of the Notes card,
 * the raw timezone-data string is always shown (D-795a), the overrides sit in a Disclosure, and the
 * sticky action bar is gone.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store.js';
import { personFormMessages } from '../src/ui/PersonForm.messages.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

const { PersonForm } = await import('../src/ui/PersonForm.js');
const { StoreProvider } = await import('../src/ui/store-context.js');

const t = personFormMessages.en;
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
  return [...(container?.querySelectorAll<HTMLElement>('.birth-record > section.birth-record-card') ?? [])];
}

function card(modifier: string): HTMLElement {
  const found = cards().find((element) => element.classList.contains(`birth-record-card--${modifier}`));
  if (found === undefined) throw new Error(`test fixture bug: no ${modifier} card`);
  return found;
}

describe('PersonForm card layout (#795)', () => {
  it('orders the cards identity, place, resolved timezone, notes and save, files, danger', () => {
    const order = cards().map((element) =>
      [...element.classList].find((name) => name.startsWith('birth-record-card--')),
    );
    expect(order).toEqual([
      'birth-record-card--identity',
      'birth-record-card--location',
      'birth-record-card--timezone',
      'birth-record-card--notes',
      'birth-record-card--files',
      'birth-record-card--danger',
    ]);
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

  it('keeps Save changes as the last control of the Notes card, after the resolved timezone card', () => {
    const notes = card('notes');
    expect(notes.querySelector('textarea')).not.toBeNull();
    const controls = [...notes.querySelectorAll('textarea, button')];
    expect(controls.at(-1)?.textContent).toBe(t.saveButton);
    const timezone = card('timezone');
    expect(timezone.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container?.querySelector('.sticky-actions')).toBeNull();
  });

  it('shows the raw timezone data as a tabular value, with the overrides behind a Disclosure', () => {
    const timezone = card('timezone');
    expect(timezone.querySelector('.birth-record-raw')?.textContent).toMatch(/\S/);
    expect(timezone.querySelector('.primitive-disclosure-title')?.textContent).toBe(t.overridesTitle);
    const trigger = timezone.querySelector('button.primitive-disclosure-trigger');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(timezone.querySelector('.birth-record-overrides')).toBeNull();
    act(() => {
      (trigger as HTMLButtonElement).click();
    });
    expect(timezone.querySelector('.birth-record-overrides input')).not.toBeNull();
  });

  it('has a danger card with the delete button and a files card with the download buttons', () => {
    expect(card('danger').querySelector('button.danger')?.textContent).toBe(t.deleteButton('Ada Lovelace'));
    expect(card('files').querySelectorAll('button').length).toBeGreaterThanOrEqual(3);
  });
});
