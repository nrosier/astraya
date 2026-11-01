/**
 * Whether the viewport is at the shared phone breakpoint (#826: 40rem = 640px, inclusive), read as a React value so a
 * component can place its controls differently at that width, the same boundary the stylesheet's `(max-width: 40rem)`
 * rules use.
 */
/**
 * @module ui/use-narrow-viewport
 * @purpose Reports whether the viewport is 40rem (640px) or narrower, live, so chart page actions can move between the PageHeader and the tab row's Chart actions sheet (#976, #817).
 * @conventions Uses `matchMedia` through `useSyncExternalStore`; without `matchMedia` (jsdom, some test hosts) it reports wide. The query string is the one the stylesheet uses, so the two stay in step.
 * @exports useNarrowViewport
 */
import { useSyncExternalStore } from 'react';

const NARROW_QUERY = '(max-width: 40rem)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

function isNarrow(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(NARROW_QUERY).matches;
}

export function useNarrowViewport(): boolean {
  return useSyncExternalStore(subscribe, isNarrow, () => false);
}
