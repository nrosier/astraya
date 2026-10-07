/**
 * The DOM/storage half of the explicit light/dark override (#70) — see `theme.ts` for
 * why this is split out untested. Shared by `main.tsx` (applies the stored choice as
 * early as possible, before the first paint, to avoid a flash of the wrong theme) and
 * `ThemeToggle.tsx` (reads it into state, writes it back on every click).
 */
/**
 * @module ui/theme-dom
 * @purpose DOM/storage half of the explicit light/dark theme override (#70): reads/writes the stored choice and applies it to the document.
 * @conventions Deliberately untested/DOM-dependent, split from theme.ts's pure selection logic; shared by main.tsx (applies the stored choice pre-first-paint to avoid a flash of the wrong theme) and ThemeToggle.tsx.
 * @exports readStoredTheme, writeStoredTheme, applyTheme
 */
import { isTheme, type Theme } from './theme.js';

const STORAGE_KEY = 'astraya.theme';

export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : 'system';
  } catch {
    // Storage disabled (private mode, blocked site data): fall back to following
    // the OS setting, same as a first-ever visit.
    return 'system';
  }
}

export function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Nothing to recover from: the toggle still works for this page load, it just
    // won't be remembered next time.
  }
}

export function applyTheme(theme: Theme): void {
  if (theme === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}
