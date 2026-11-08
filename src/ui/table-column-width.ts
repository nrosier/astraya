/**
 * @module ui/table-column-width
 * @purpose Pure width arithmetic for the resizable data-table columns (#1301): clamping, keyboard steps and the drag delta.
 * @conventions Plain numbers in CSS pixels, no DOM. The step values are a documented design choice (the issue leaves them to the spec): 16px per arrow press, 64px with Shift. Widths live in component state only and reset on each visit (owner decision on #1301); nothing is stored.
 * @exports MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH, COLUMN_STEP, COLUMN_STEP_LARGE, clampColumnWidth, keyboardColumnWidth, dragColumnWidth
 */

/** The narrowest a resized column may get: room for the sort arrow and a few characters. */
export const MIN_COLUMN_WIDTH = 48;
/** The widest a resized column may get; a table wider than its frame scrolls sideways as it already does. */
export const MAX_COLUMN_WIDTH = 1200;
/** One arrow-key press. */
export const COLUMN_STEP = 16;
/** One arrow-key press with Shift held. */
export const COLUMN_STEP_LARGE = 64;

/** Keeps a width inside the allowed range, rounded to whole pixels. */
export function clampColumnWidth(width: number): number {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
}

/**
 * The width a key press gives, or `undefined` for a key that does not resize. Arrow keys step, Shift makes the step
 * larger, Home goes to the minimum and End to the maximum (the window-splitter keys).
 */
export function keyboardColumnWidth(current: number, key: string, shift: boolean): number | undefined {
  const step = shift ? COLUMN_STEP_LARGE : COLUMN_STEP;
  switch (key) {
    case 'ArrowRight':
      return clampColumnWidth(current + step);
    case 'ArrowLeft':
      return clampColumnWidth(current - step);
    case 'Home':
      return MIN_COLUMN_WIDTH;
    case 'End':
      return MAX_COLUMN_WIDTH;
    default:
      return undefined;
  }
}

/** The width after dragging the handle from `startX` to `currentX`, starting at `startWidth`. */
export function dragColumnWidth(startWidth: number, startX: number, currentX: number): number {
  return clampColumnWidth(startWidth + currentX - startX);
}
