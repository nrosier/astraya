/**
 * Parsing a typed latitude or longitude (shared by the horary and electional forms): a plain
 * decimal in degrees, typed with either `.` or `,` — a Dutch keyboard's — and within its range.
 */
/**
 * @module ui/place-fields
 * @purpose Shared decimal latitude/longitude parsing for the horary and electional forms.
 * @conventions Accepts both `.` and `,` as the decimal separator (a Dutch keyboard's), and range-validates (±90 for latitude, ±180 for longitude).
 * @exports parseLatitude, parseLongitude
 */

const DECIMAL_PATTERN = /^-?\d+(?:[.,]\d+)?$/;

function parseDecimal(text: string): number | undefined {
  const trimmed = text.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) return undefined;
  return Number(trimmed.replace(',', '.'));
}

/** Degrees north, or `undefined` if not a plain number from -90 to 90. */
export function parseLatitude(text: string): number | undefined {
  const value = parseDecimal(text);
  return value === undefined || value < -90 || value > 90 ? undefined : value;
}

/** Degrees east, or `undefined` if not a plain number from -180 to 180. */
export function parseLongitude(text: string): number | undefined {
  const value = parseDecimal(text);
  return value === undefined || value < -180 || value > 180 ? undefined : value;
}
