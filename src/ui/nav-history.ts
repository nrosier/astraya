/**
 * @module ui/nav-history
 * @purpose Knows whether the browser's Back button would stay inside the app (#652), so a Back link can use history when it can and a fixed fallback when it cannot.
 * @conventions Every history entry is stamped with its position in this tab's app session (`history.state.astrayaNav`): an entry with no stamp is one a link just pushed, so it gets the previous position plus one; an entry that has one (Back, Forward, reload, an in-place `replaceState` that kept its state) keeps it. Position 0 is where this tab entered the app (a fresh tab, a shared link), so there is nothing to go back to. Code that replaces the URL in place must pass `history.state` through, or the entry would look like a new page.
 * @exports trackNavigation, canGoBack, subscribeNavigation, replaceRoute
 */
const KEY = 'astrayaNav';

let position = 0;
const listeners = new Set<() => void>();

function stamped(): number | undefined {
  const state: unknown = window.history.state;
  if (typeof state !== 'object' || state === null) return undefined;
  const value = (state as Record<string, unknown>)[KEY];
  return typeof value === 'number' ? value : undefined;
}

function stamp(value: number): void {
  const state: unknown = window.history.state;
  const rest = typeof state === 'object' && state !== null ? state : {};
  window.history.replaceState({ ...rest, [KEY]: value }, '', window.location.href);
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Starts following navigation; returns the function that stops it. Called once by the app shell. */
export function trackNavigation(): () => void {
  if (stamped() === undefined) stamp(0);
  position = stamped() ?? 0;
  const onChange = (): void => {
    const known = stamped();
    if (known === undefined) {
      position += 1;
      stamp(position);
    } else {
      position = known;
    }
    notify();
  };
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

/** True when the entry before this one was visited inside the app in this tab. */
export function canGoBack(): boolean {
  return position > 0;
}

export function subscribeNavigation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Changes the URL without adding a history entry (a view switch is not a page) and tells the router.
 * Keeps the entry's stamp, so Back still counts it as the page it was.
 */
export function replaceRoute(href: string): void {
  window.history.replaceState(window.history.state, '', href);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
