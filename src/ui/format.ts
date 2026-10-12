/**
 * Locale-aware display formatting (#158) — the counterpart to `messages.ts` for values that
 * aren't fixed strings: dates, times, coordinates. Luxon (already a dependency for calculation,
 * always used in UTC/fixed offsets there) is what gives these a `.locale`, rather than hand-
 * rolling a second formatter per display site.
 *
 * Framework-free like `src/domain`/`src/chart` — `Locale` is a plain string union, and every
 * function here takes it as an explicit argument rather than reading `locale.ts`'s store, so
 * `chart-tables.ts` and `multi-wheel.ts` can call in too without taking on a UI/React dependency
 * or a `localStorage` read of their own.
 */
/**
 * @module ui/format
 * @purpose Locale-aware display formatting (#158) for values that aren't fixed strings — dates and geographic coordinates — complementing messages.ts's fixed-string i18n.
 * @conventions Framework-free like src/domain and src/chart: every function takes Locale explicitly rather than reading locale.ts's store, so non-UI modules (chart-tables.ts, multi-wheel.ts) can call in without a React/localStorage dependency.
 * @exports todayInputValue, formatCoordinate, formatFixed, formatDecimal, formatInteger, formatTimestamp, formatCents, utcDay
 */
import type { Locale } from '../interpretation/schema.js';

/**
 * Today's date as an `<input type="date">` value, in the visitor's local calendar. Locale-
 * invariant by the HTML spec (always `yyyy-mm-dd`, regardless of UI language), so this is a
 * pure dedup — it was triplicated across `TransitView.tsx`, `PeriodicTransitView.tsx` and
 * `ProfectionsView.tsx` — not a translation.
 */
export function todayInputValue(): string {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const enCardinals = { north: 'N', south: 'S', east: 'E', west: 'W' };
const nlCardinals: typeof enCardinals = { north: 'N', south: 'Z', east: 'O', west: 'W' };
const CARDINALS: Readonly<Record<Locale, typeof enCardinals>> = { en: enCardinals, nl: nlCardinals };

/**
 * A latitude or longitude as printed decimal degrees plus a hemisphere letter — e.g. `51.50°N`,
 * `51,50°N` in Dutch. The letter set differs per locale (Dutch "Zuid"/"Oost" give Z/O where
 * English gives S/E); the decimal separator follows `Intl.NumberFormat`, which already renders
 * `nl` with a comma.
 */
export function formatCoordinate(value: number, axis: 'lat' | 'lon', locale: Locale): string {
  const cardinals = CARDINALS[locale];
  const letter =
    axis === 'lat' ? (value < 0 ? cardinals.south : cardinals.north) : value < 0 ? cardinals.west : cardinals.east;
  const magnitude = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Math.abs(value),
  );
  return `${magnitude}°${letter}`;
}

/**
 * A number shown with a fixed count of decimals, always with a point, whatever the language (#513): the orbs, ages
 * and speeds in the tables read the same in English and Dutch and in the CSV, PDF and wheel they are copied into.
 * The one place a displayed figure is rounded, so "-0.00" never appears.
 */
export function formatFixed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text;
}

/**
 * A number in the reader's own notation, up to `maxDigits` decimals (comma in Dutch): for prose and settings
 * summaries, as opposed to the point-always figures in tables above.
 */
export function formatDecimal(value: number, maxDigits: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'nl' ? 'nl-NL' : 'en-GB', { maximumFractionDigits: maxDigits }).format(value);
}

/** A whole number grouped the way the reader's language groups it (1,234 / 1.234), for counts in tables and sentences. */
export function formatInteger(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'nl' ? 'nl-NL' : 'en-GB', { maximumFractionDigits: 0 }).format(value);
}

/** An instant as `YYYY-MM-DD HH:mm` in the reader's own time zone: fixed shape, not the browser's locale style. */
export function formatTimestamp(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${String(date.getFullYear()).padStart(4, '0')}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** An amount of US cents as dollars. The app prices only in USD, so the currency is named once, here. */
export function formatCents(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'nl' ? 'nl-NL' : 'en-US', { style: 'currency', currency: 'USD' }).format(
    cents / 100,
  );
}

/** The UTC calendar day of an instant (now by default) as `YYYY-MM-DD`: the day a PDF or an "as of" date is stamped with. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
