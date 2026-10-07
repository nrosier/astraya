/**
 * How a saved interpretation's time is shown in the history (#423): the reader's own local time,
 * written out — `Tuesday March 10 2026 @ 17:30` — never the raw UTC instant it is stored as.
 *
 * Built from `Intl.DateTimeFormat` *parts* with explicit options rather than a locale's own
 * date style, so the shape is the same on every device: weekday, month and day in the order the
 * language writes them, the year, then `@` and a 24-hour time. The 24-hour clock uses `h23`, so
 * midnight is `00:30`, not `24:30`. `timeZone` defaults to the browser's; tests pass one.
 */
/**
 * @module ui/saved-time
 * @purpose Formats a saved interpretation's stored UTC instant (#423) as the reader's own local, written-out time — e.g. "Tuesday March 10 2026 @ 17:30".
 * @conventions Built from Intl.DateTimeFormat parts with explicit options (not a locale's date style) so the shape is identical across devices; uses h23 hour cycle so midnight reads 00:30, never 24:30.
 * @exports formatSavedTime
 */
import type { Locale } from '../interpretation/schema.js';

const INTL_LOCALE: Readonly<Record<Locale, string>> = { en: 'en-US', nl: 'nl-NL' };

export function formatSavedTime(isoInstant: string, locale: Locale, timeZone?: string): string {
  const instant = new Date(isoInstant);
  if (Number.isNaN(instant.getTime())) return isoInstant;
  const parts = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  const date =
    locale === 'nl'
      ? `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}`
      : `${part('weekday')} ${part('month')} ${part('day')} ${part('year')}`;
  return `${date} @ ${part('hour')}:${part('minute')}`;
}
