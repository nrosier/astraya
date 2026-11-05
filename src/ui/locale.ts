/**
 * The app's UI locale (#158) — originally added as a `ReportView`-only picker, then promoted
 * to sit next to `ThemeToggle` as an app-wide setting. It now drives every UI message
 * catalogue (`useMessages`, in `messages.ts`) as well as the interpretation report's language.
 *
 * Since #1066 the value is an account preference: it lives in the op log of the open store and follows a signed-in
 * reader across devices. `account-preferences.ts` owns reading and saving it; this module is the locale-shaped view
 * of that store, kept so the many readers of `useLocale` need no change. The pre-#1066 `astraya:reportLocale` key is
 * read only once, as the one-time migration source.
 *
 * A plain module-level store rather than React context: `LanguageToggle` (mounted once,
 * globally) and `ReportView` (mounted only while that tab is open) both need to read and
 * react to the same value with no provider wiring `App.tsx` would otherwise need.
 */
/**
 * @module ui/locale
 * @purpose App-wide UI locale (#158) that drives every message catalogue read via useMessages (messages.ts) as well as the interpretation report's language, and keeps the page's `<html lang>` in step with it (#1079).
 * @conventions A thin view over `account-preferences.ts` (#1066): reads come from its in-memory snapshot, a change is saved as an account preference (local first, then the op log); `<html lang>` follows every change, including one arriving from another device; never throws when storage is unusable (#493).
 * @exports LOCALE_LABELS, isLocale, getLocale, setLocale, useLocale
 */
import { useSyncExternalStore } from 'react';
import { CORPUS_LOCALES, type Locale } from '../interpretation/schema.js';
import { getAccountPreferences, setAccountPreferences, subscribeAccountPreferences } from './account-preferences.js';

export const LOCALE_LABELS: Readonly<Record<Locale, string>> = { en: 'English', nl: 'Nederlands' };

export function isLocale(value: string): value is Locale {
  return (CORPUS_LOCALES as readonly string[]).includes(value);
}

/**
 * Declares the page's language (#1079, WCAG 3.1.1): screen readers pick their pronunciation from `<html lang>`, and
 * `index.html` ships `en`. Skipped where there is no document (unit tests under Node).
 */
function applyDocumentLang(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
}

export function getLocale(): Locale {
  return getAccountPreferences().locale;
}

applyDocumentLang(getLocale());
subscribeAccountPreferences(() => {
  applyDocumentLang(getLocale());
});

export function setLocale(next: Locale): void {
  // A failed save rolls the language back and is reported by `account-preferences.ts`; nothing more to do here.
  setAccountPreferences({ locale: next }).catch(() => undefined);
}

export function useLocale(): [Locale, (next: Locale) => void] {
  const locale = useSyncExternalStore(subscribeAccountPreferences, getLocale, getLocale);
  return [locale, setLocale];
}
