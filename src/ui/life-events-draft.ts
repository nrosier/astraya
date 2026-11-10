/**
 * The editable rows of a person's life events (#1399, slice S3): what the birth record's Life events card holds
 * between keystrokes, and the checks that decide whether the rows can be saved.
 */
/**
 * @module life-events-draft
 * @purpose Row draft type, conversion to and from `LifeEvent`, per-row validation and the dirty comparison for the birth record's Life events card.
 * @conventions Pure and DOM-free; rows are strings as typed (an empty time means no time); validation reuses `readLifeEvents` for the calendar check so the editor refuses exactly what the store would; error text comes from the caller's catalogue, never from here; the displayed order is `sortLifeEvents`'s.
 * @exports LifeEventRow, LifeEventView, LIFE_EVENT_NO_CATEGORY, viewLifeEvents, rowsFromEvents, rowsToEvents, validateLifeEventRows, lifeEventsChanged, LifeEventRowErrors
 */
import {
  LIFE_EVENT_LABEL_MAX_CHARACTERS,
  isLifeEventCategory,
  type LifeEventCategory,
  readLifeEvents,
  sortLifeEvents,
  type LifeEvent,
} from '../domain/life-events.js';
import type { personFormMessages } from './PersonForm.messages.js';

/** One row as typed: `time` is `''` when the event has no time of day. */
export interface LifeEventRow {
  readonly id: string;
  readonly date: string;
  readonly time: string;
  readonly label: string;
  /** The category, when the event has one (#1439); rows that do not touch it carry it through unchanged. */
  readonly category?: LifeEventCategory | undefined;
}

export interface LifeEventRowErrors {
  readonly date?: string;
  readonly label?: string;
}

/** The stored events as rows, in display order. */
export function rowsFromEvents(events: readonly LifeEvent[]): readonly LifeEventRow[] {
  return sortLifeEvents(events).map((event) => ({
    id: event.id,
    date: event.date,
    time: event.time ?? '',
    label: event.label,
    ...(event.category === undefined ? {} : { category: event.category }),
  }));
}

/** The rows as events, in display order. Only meaningful for rows that validate. */
export function rowsToEvents(rows: readonly LifeEventRow[]): readonly LifeEvent[] {
  return sortLifeEvents(
    rows.map((row) => ({
      id: row.id,
      date: row.date,
      ...(row.time === '' ? {} : { time: row.time }),
      label: row.label.trim(),
      ...(row.category === undefined ? {} : { category: row.category }),
    })),
  );
}

/** Errors for one row, keyed by field; an empty object means the row can be saved. */
export function validateLifeEventRows(
  rows: readonly LifeEventRow[],
  t: typeof personFormMessages.en,
): ReadonlyMap<string, LifeEventRowErrors> {
  const result = new Map<string, LifeEventRowErrors>();
  for (const row of rows) {
    const label = row.label.trim();
    let dateError: string | undefined;
    if (row.date === '') dateError = t.lifeEventDateRequired;
    else if (readLifeEvents([{ id: 'x', date: row.date, label: 'x' }]) === undefined)
      dateError = t.lifeEventDateInvalid;
    let labelError: string | undefined;
    if (label === '') labelError = t.lifeEventLabelRequired;
    else if (Array.from(label).length > LIFE_EVENT_LABEL_MAX_CHARACTERS)
      labelError = t.lifeEventLabelTooLong(LIFE_EVENT_LABEL_MAX_CHARACTERS);
    if (dateError !== undefined || labelError !== undefined) {
      result.set(row.id, {
        ...(dateError === undefined ? {} : { date: dateError }),
        ...(labelError === undefined ? {} : { label: labelError }),
      });
    }
  }
  return result;
}

/** Whether the rows, once saved, would differ from the stored events (whitespace-only label edits are not changes). */
export function lifeEventsChanged(rows: readonly LifeEventRow[], stored: readonly LifeEvent[]): boolean {
  const next = rowsToEvents(rows);
  const before = sortLifeEvents(stored);
  return (
    next.length !== before.length ||
    next.some((event, index) => {
      const old = before[index];
      return (
        old === undefined ||
        old.id !== event.id ||
        old.date !== event.date ||
        old.time !== event.time ||
        old.label !== event.label ||
        old.category !== event.category
      );
    })
  );
}

/** The drawer's category filter value for events that have no category. */
export const LIFE_EVENT_NO_CATEGORY = 'none';

/** What the drawer's toolbar asks for: `category` is '' for all, `none` for uncategorised, or a category. */
export interface LifeEventView {
  readonly search: string;
  readonly category: '' | typeof LIFE_EVENT_NO_CATEGORY | LifeEventCategory;
  readonly direction: 'asc' | 'desc';
}

/**
 * The events the drawer table shows: filtered by a case-insensitive match on the description and by category, then in
 * date order (`sortLifeEvents`'s, reversed for descending).
 */
export function viewLifeEvents(events: readonly LifeEvent[], view: LifeEventView): readonly LifeEvent[] {
  const needle = view.search.trim().toLocaleLowerCase();
  const kept = sortLifeEvents(events).filter((event) => {
    if (needle !== '' && !event.label.toLocaleLowerCase().includes(needle)) return false;
    if (view.category === '') return true;
    if (view.category === LIFE_EVENT_NO_CATEGORY) return event.category === undefined;
    return isLifeEventCategory(view.category) && event.category === view.category;
  });
  return view.direction === 'asc' ? kept : [...kept].reverse();
}
