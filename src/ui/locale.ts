/**
 * The app's UI locale (#158) — originally added as a `ReportView`-only picker, then promoted
 * to sit next to `ThemeToggle` as an app-wide setting. It now drives every UI message
 * catalogue (`useMessages`, in `messages.ts`) as well as the interpretation report's language.
 * The storage key still says `reportLocale`: renaming it would reset every existing user's
 * choice for no benefit, since the value it holds hasn't changed — only its scope has.
 *
 * A plain module-level store rather than React context: `LanguageToggle` (mounted once,
 * globally) and `ReportView` (mounted only while that tab is open) both need to read and
 * react to the same value with no provider wiring `App.tsx` would otherwise need. Same
 * `useSyncExternalStore` shape `SyncBadge.tsx` uses for sync status, including its
 * `OFF_STATUS`-style stable snapshot: returning a fresh value from `getSnapshot` would
 * make React re-render forever.
 */
/**
 * @module ui/locale
 * @purpose App-wide UI locale (#158) store that drives every message catalogue read via useMessages (messages.ts) as well as the interpretation report's language.
 * @conventions Plain module-level useSyncExternalStore (not React context) so multiple independently-mounted components (LanguageToggle, ReportView) share state without provider wiring; persists under the legacy `astraya:reportLocale` localStorage key, which is kept for backward compatibility; storage read/write is best-effort (#493), matching the failure-safe pattern theme-dom.ts/symbol-setting.ts already use.
 * @exports LOCALE_LABELS, isLocale, getLocale, setLocale, useLocale
 */
import { useSyncExternalStore } from 'react';
import { CORPUS_LOCALES, type Locale } from '../interpretation/schema.js';

const LOCALE_KEY = 'astraya:reportLocale';

export const LOCALE_LABELS: Readonly<Record<Locale, string>> = { en: 'English', nl: 'Nederlands' };

export function isLocale(value: string): value is Locale {
  return (CORPUS_LOCALES as readonly string[]).includes(value);
}

// Storage read/write is best-effort (#493): denied storage (a hardened browser throwing
// `SecurityError`, or a Node-ish runtime with no `localStorage`) must fall back to English at
// read time rather than throwing at module-import time — the same failure-safe pattern
// theme-dom.ts/symbol-setting.ts already use — and must never prevent the in-memory choice from
// taking effect or its listeners from being notified at write time, even when it can't be saved.
function readStored(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    return stored !== null && isLocale(stored) ? stored : 'en';
  } catch {
    return 'en';
  }
}

let current: Locale = readStored();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(LOCALE_KEY, next);
  } catch {
    // Not remembered, but this page uses it until it is reloaded — same as every other
    // listener below, which must still run even though the write itself failed.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

export function useLocale(): [Locale, (next: Locale) => void] {
  const locale = useSyncExternalStore(subscribe, getLocale);
  return [locale, setLocale];
}
