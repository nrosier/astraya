/**
 * Theme selection logic for the explicit light/dark override (#70). `'system'` means
 * "no override" — the page follows `prefers-color-scheme`, via the plain `:root` /
 * `@media (prefers-color-scheme: light)` rules already in `app.css`. `'light'`/`'dark'`
 * pin the palette regardless of the OS setting, via the `:root[data-theme]` rules those
 * same tokens are redefined in.
 *
 * Kept pure and DOM-free so it's Vitest-testable (the project's tests run under Node,
 * with no `document`/`localStorage`) — the actual reading/writing/applying lives in
 * `ThemeToggle.tsx`, the same "thin `.tsx`, tested `.ts`" split `SortableTable.tsx`/
 * `table-sort.ts` already use.
 */
/**
 * @module ui/theme
 * @purpose Pure theme-selection logic for the explicit light/dark override (#70): the Theme type, its cycle order, and label lookup.
 * @conventions Pure and DOM-free so it is Vitest-testable (tests run under Node, no document/localStorage); the actual reading/writing/applying lives in theme-dom.ts and ThemeToggle.tsx, following the "thin .tsx, tested .ts" split table-sort.ts/SortableTable.tsx uses; labels come from ThemeToggle.messages.ts's en/nl catalogue.
 * @exports Theme, THEME_CYCLE, isTheme, nextTheme, themeLabel
 */
import type { themeToggleMessages } from './ThemeToggle.messages.js';

export type Theme = 'system' | 'light' | 'dark';

export const THEME_CYCLE: readonly Theme[] = ['system', 'light', 'dark'];

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEME_CYCLE as readonly string[]).includes(value);
}

export function nextTheme(current: Theme): Theme {
  const index = THEME_CYCLE.indexOf(current);
  return THEME_CYCLE[(index + 1) % THEME_CYCLE.length] ?? 'system';
}

export function themeLabel(theme: Theme, t: typeof themeToggleMessages.en): string {
  return t[theme];
}
