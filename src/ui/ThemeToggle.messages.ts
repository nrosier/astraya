/**
 * Message catalogue for `theme.ts`/`ThemeToggle.tsx` (#158). `themeLabel()` in `theme.ts`
 * is a pure function with no locale access of its own, so it takes a `t` of this shape —
 * the same pattern `status.ts`'s `describeStatus()` uses.
 */
/**
 * @module ThemeToggle.messages
 * @purpose English/Dutch message catalogue (and the `themeLabel()` text shape) for the light/dark/system theme toggle.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `ThemeToggle.tsx`; `theme.ts`'s pure `themeLabel()` takes a `t` of this same shape.
 * @exports themeToggleMessages
 */
const en = {
  system: 'Theme: System',
  light: 'Theme: Light',
  dark: 'Theme: Dark',
  activateToChange: (label: string) => `${label} — activate to change`,
};

const nl: typeof en = {
  system: 'Thema: Systeem',
  light: 'Thema: Licht',
  dark: 'Thema: Donker',
  activateToChange: (label: string) => `${label} — klik om te wijzigen`,
};

export const themeToggleMessages = { en, nl };
