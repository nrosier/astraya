/**
 * Dated life events of one person (#1399), stored as a single `lifeEvents` register on the person.
 *
 * An event is a date, an optional time and a short label: the facts later screens (rectification, progressions,
 * returns, exports) pick from. Event times are civil times at the birth place (owner decision, 2026-11-09); that
 * resolution happens where an event is used, not here.
 *
 * The register is one op-log value, so its size is bounded: at most {@link LIFE_EVENTS_MAX} events, each id and label
 * length-capped. `test/domain-life-events.test.ts`
 * measures the largest valid list against the sync push batch limit.
 */
/**
 * @module life-events
 * @purpose Defines the `LifeEvent` type, the atomic reader and write guard for a person's `lifeEvents` register, and the owner-chosen ordering.
 * @conventions Pure and DOM-free; a list is read atomically, so one invalid row, a list over the cap, a repeated id or an impossible calendar date makes the whole list unreadable (undefined), never a repaired partial list; dates are checked against the proleptic Gregorian calendar and are not Julian-aware; the write guard throws on exactly what the reader rejects; the list is ordered by date, then time, with untimed events after timed ones on the same day, then by id.
 * @exports LifeEvent, LIFE_EVENTS_MAX, LIFE_EVENT_LABEL_MAX_CHARACTERS, LIFE_EVENT_ID_MAX_CHARACTERS, readLifeEvents, lifeEventsMutation, sortLifeEvents, LifeEventPickerOption, lifeEventPickerOptions
 */
import type { Mutation } from '../store/oplog.js';
import type { JsonValue } from '../store/ops.js';

/** One dated event in a person's life. */
export interface LifeEvent {
  /** Stable local identifier for editing and removal; unique within one person's list. */
  readonly id: string;
  /** Calendar date as `YYYY-MM-DD`. */
  readonly date: string;
  /** Civil time as `HH:MM` at the birth place; absent when the time of day is not known. */
  readonly time?: string | undefined;
  /** Reader-facing description, 1 to {@link LIFE_EVENT_LABEL_MAX_CHARACTERS} code points after trimming. */
  readonly label: string;
}

/**
 * The longest an event label may be, in code points: the same limit as a person's name and place (#1288), which
 * `person.ts` owns. Repeated here because `person.ts` imports this module; the tests assert the two are equal.
 */
export const LIFE_EVENT_LABEL_MAX_CHARACTERS = 200;

/** The most events one person can store (owner decision, 2026-11-09). */
export const LIFE_EVENTS_MAX = 100;

/** The longest an event id may be, in UTF-16 code units, as for a saved location's id. */
export const LIFE_EVENT_ID_MAX_CHARACTERS = 128;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A real proleptic-Gregorian calendar date: 2023-02-30 is not one, and neither is year 0000. */
function isCalendarDate(text: string): boolean {
  const match = DATE_PATTERN.exec(text);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1) return false;
  const probe = new Date(0);
  // `setUTCFullYear` rather than `Date.UTC`, which maps years 0 to 99 onto 1900 to 1999.
  probe.setUTCFullYear(year, month - 1, day);
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function readLifeEvent(candidate: unknown): LifeEvent | undefined {
  if (!isRecordValue(candidate)) return undefined;
  const { id, date, time, label } = candidate;
  if (typeof id !== 'string' || id.length === 0 || id.length > LIFE_EVENT_ID_MAX_CHARACTERS) return undefined;
  if (typeof date !== 'string' || !isCalendarDate(date)) return undefined;
  if (time !== undefined && (typeof time !== 'string' || !TIME_PATTERN.test(time))) return undefined;
  if (typeof label !== 'string') return undefined;
  const trimmed = label.trim();
  if (trimmed === '' || Array.from(trimmed).length > LIFE_EVENT_LABEL_MAX_CHARACTERS) return undefined;
  return { id, date, ...(time === undefined ? {} : { time }), label: trimmed };
}

/**
 * Reads a `lifeEvents` register atomically, as `readRelocationPlaces` does: anything that is not an array, a list
 * over {@link LIFE_EVENTS_MAX}, a repeated id, or one invalid row (empty id or label, label over 200 code points,
 * impossible date, bad time) makes the whole list unreadable, so a partial list never stands in for what was saved.
 */
export function readLifeEvents(value: unknown): readonly LifeEvent[] | undefined {
  if (!Array.isArray(value) || value.length > LIFE_EVENTS_MAX) return undefined;
  const events: LifeEvent[] = [];
  const ids = new Set<string>();
  for (const candidate of value as readonly unknown[]) {
    const event = readLifeEvent(candidate);
    if (event === undefined || ids.has(event.id)) return undefined;
    ids.add(event.id);
    events.push(event);
  }
  return events;
}

/**
 * The write for a person's `lifeEvents` register. Throws when the list would not read back (invalid row, over the
 * cap, repeated id), so an oversized or malformed list can never reach the op log. The stored value is the
 * normalised list (labels trimmed).
 */
export function lifeEventsMutation(personId: string, events: readonly LifeEvent[]): Mutation {
  const checked = readLifeEvents(events);
  if (checked === undefined) {
    throw new Error(
      `Life events are not valid: at most ${String(LIFE_EVENTS_MAX)} events, each with a unique id, a real date, an optional HH:MM time and a label.`,
    );
  }
  return {
    entity: 'person',
    entityId: personId,
    field: 'lifeEvents',
    value: checked.map((event) => ({
      id: event.id,
      date: event.date,
      ...(event.time === undefined ? {} : { time: event.time }),
      label: event.label,
    })) satisfies JsonValue,
  };
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * The events in display order (owner decision, 2026-11-09): by date, then time, an event without a time after those
 * with one on the same day, remaining ties by id. Returns a new array.
 */
export function sortLifeEvents(events: readonly LifeEvent[]): readonly LifeEvent[] {
  return [...events].sort((a, b) => {
    const byDate = compareText(a.date, b.date);
    if (byDate !== 0) return byDate;
    if (a.time !== b.time) {
      if (a.time === undefined) return 1;
      if (b.time === undefined) return -1;
      return compareText(a.time, b.time);
    }
    return compareText(a.id, b.id);
  });
}

/** One stored event offered as a date to pick (#1399, slice S5). */
export interface LifeEventPickerOption {
  /** The event's id, unique within the person's list. */
  readonly id: string;
  /** The date to set, `YYYY-MM-DD`. */
  readonly isoDate: string;
  /** The date as shown, `YYYY-MM-DD` with ` HH:MM` appended when the event has a time. */
  readonly dateLabel: string;
  /** The event's own label. */
  readonly label: string;
}

/** The events as picker options, in {@link sortLifeEvents} order (untimed after timed on the same day). */
export function lifeEventPickerOptions(events: readonly LifeEvent[]): readonly LifeEventPickerOption[] {
  return sortLifeEvents(events).map((event) => ({
    id: event.id,
    isoDate: event.date,
    dateLabel: event.time === undefined ? event.date : `${event.date} ${event.time}`,
    label: event.label,
  }));
}
