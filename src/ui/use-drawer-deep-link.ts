/**
 * @module ui/use-drawer-deep-link
 * @purpose Deep link for a drawer (#1667): reports whether the live hash requests a drawer key on its host route, and clears the `drawer` parameter when the drawer closes.
 * @conventions Reads `window.location.hash` through `parseRoute`, on mount and on `hashchange`, so no host prop goes stale; `clear` rewrites the hash with `history.replaceState` (keeping `history.state` and every other query value, adding no history entry). Only the host route for each key counts: overlays and extended-settings on `chart`, life-events on `person`, map-settings on `astrocartography`. `revealHiddenTrigger` clicks the tab row toggle when a trigger is hidden in the Chart actions sheet (40rem and below).
 * @exports useDrawerDeepLink, revealHiddenTrigger
 */
import { useEffect, useState } from 'react';
import { parseRoute, type DrawerKey, type Route } from './route.js';

/** The route kind each drawer key is hosted on (#1667 owner decision). */
const HOST_KIND: Readonly<Record<DrawerKey, Route['kind']>> = {
  overlays: 'chart',
  'extended-settings': 'chart',
  'life-events': 'person',
  'map-settings': 'astrocartography',
};

/** The hash with its `drawer` query parameter removed; the path and every other query value are kept. */
function hashWithoutDrawer(hash: string): string {
  const [path = '', queryString = ''] = hash.split('?');
  const query = new URLSearchParams(queryString);
  query.delete('drawer');
  const remaining = query.toString();
  return remaining === '' ? path : `${path}?${remaining}`;
}

function isRequested(hash: string, key: DrawerKey): boolean {
  const route = parseRoute(hash);
  return route.kind === HOST_KIND[key] && 'drawer' in route && route.drawer === key;
}

/**
 * Whether the drawer `key` is requested by the URL, and a `clear` that removes the `drawer` parameter when the drawer
 * closes. `requested` follows `hashchange`; after `clear` it is false until the URL asks again.
 */
export function useDrawerDeepLink(key: DrawerKey): { readonly requested: boolean; readonly clear: () => void } {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = (): void => {
      setHash(window.location.hash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  const clear = (): void => {
    const current = window.location.hash;
    try {
      window.history.replaceState(window.history.state, '', hashWithoutDrawer(current));
    } catch {
      // A browser that refuses the rewrite (rate limit, sandbox) leaves the URL as it was.
    }
    setHash(window.location.hash);
  };

  return { requested: isRequested(hash, key), clear };
}

/**
 * Makes a trigger that is hidden in the Chart actions sheet (40rem and below) usable for a deep link: when it has no
 * client rects, the enclosing tab row's toggle is clicked so the drawer has a box to open in. Same pattern as
 * ExtendedSettingsPanel's `openOnSpecial`.
 */
export function revealHiddenTrigger(trigger: HTMLElement | null): void {
  if (trigger !== null && trigger.getClientRects().length === 0) {
    trigger.closest<HTMLElement>('.tab-row')?.querySelector<HTMLElement>('[data-tab-row-toggle]')?.click();
  }
}
