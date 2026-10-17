/**
 * Message catalogue for `LanguageToggle.tsx` (#158). `LOCALE_LABELS` in `locale.ts` stays
 * untranslated — those are endonyms (English, Nederlands), not chrome text.
 */
/**
 * @module LanguageToggle.messages
 * @purpose English/Dutch i18n string for the language-toggle button's accessible label, which starts with the visible code (WCAG 2.5.3, #644).
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by LanguageToggle.tsx via `useMessages(languageToggleMessages)`; `nl` is typed as `typeof en`.
 * @exports languageToggleMessages
 */
const en = {
  languageLabel: (label: string, code: string) => `${code} — Language: ${label} — activate to change`,
};

const nl: typeof en = {
  languageLabel: (label: string, code: string) => `${code} — Taal: ${label} — klik om te wijzigen`,
};

export const languageToggleMessages = { en, nl };
