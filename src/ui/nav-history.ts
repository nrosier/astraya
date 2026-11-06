/**
 * @module ui/nav-history
 * @purpose Knows whether the browser's Back button would stay inside the app (#652), and which page it would return to (#1225), so one shared Back link can name that page and appear only when there is one.
 * @conventions Every history entry is stamped with its position in this tab's app session (`history.state.astrayaNav`): an entry with no stamp is one a link just pushed, so it gets the previous position plus one; an entry that has one (Back, Forward, reload, an in-place `replaceState` that kept its state) keeps it. Position 0 is where this tab entered the app (a fresh tab, a shared link), so there is nothing to go back to. Code that replaces the URL in place must pass `history.state` through, or the entry would look like a new page. The page behind each position (its hash and its name) is recorded as the reader leaves it, the name being the tab title the page set, so it follows the interface language; the record is kept in `sessionStorage` so a reload keeps it, and a position whose page is unknown has no previous page to show.
 * @exports trackNavigation, canGoBack, previousPage, subscribeNavigation, replaceRoute, pageNameFromTitle, PreviousPage
 */
const KEY = 'astrayaNav';

const TRAIL_KEY = 'astrayaNavTrail';
const TITLE_SUFFIX = ' – Astraya';

/** The page a Back step returns to: where it goes, and what the reader knows it as. */
export interface PreviousPage {
  readonly href: string;
  /** The page's own name, or `undefined` when it set no title. */
  readonly name: string | undefined;
}

let position = 0;
/** What lies behind each position: the page the reader left to arrive there. */
let behind: Record<number, PreviousPage> = {};
/** The hash the app was showing before the change being handled. */
let currentHref = '';
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

/** A page's name from the tab title it set: the heading without the app name; empty when it set none. */
export function pageNameFromTitle(title: string): string | undefined {
  const name = (title.endsWith(TITLE_SUFFIX) ? title.slice(0, -TITLE_SUFFIX.length) : title).trim();
  return name === '' || name === 'Astraya' ? undefined : name;
}

function loadTrail(): Record<number, PreviousPage> {
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(TRAIL_KEY) ?? '{}');
    if (typeof raw !== 'object' || raw === null) return {};
    const trail: Record<number, PreviousPage> = {};
    for (const [key, value] of Object.entries(raw)) {
      const at = Number(key);
      const entry = value as { href?: unknown; name?: unknown };
      if (Number.isInteger(at) && typeof entry.href === 'string') {
        trail[at] = { href: entry.href, name: typeof entry.name === 'string' ? entry.name : undefined };
      }
    }
    return trail;
  } catch {
    return {};
  }
}

function saveTrail(): void {
  try {
    window.sessionStorage.setItem(TRAIL_KEY, JSON.stringify(behind));
  } catch {
    // A blocked store means the names are not remembered across a reload; the link then stays hidden.
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Starts following navigation; returns the function that stops it. Called once by the app shell. */
export function trackNavigation(): () => void {
  if (stamped() === undefined) stamp(0);
  position = stamped() ?? 0;
  behind = loadTrail();
  currentHref = window.location.hash;
  const onChange = (): void => {
    const known = stamped();
    if (known === undefined) {
      // A new page. This runs before the router re-renders, so the title is still the page being left.
      const left: PreviousPage = { href: currentHref, name: pageNameFromTitle(document.title) };
      position += 1;
      stamp(position);
      behind = Object.fromEntries(Object.entries(behind).filter(([at]) => Number(at) < position));
      behind[position] = left;
      saveTrail();
    } else {
      position = known;
    }
    currentHref = window.location.hash;
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

/** The page a Back step returns to, or `undefined` when this tab entered the app here or the page is not known. */
export function previousPage(): PreviousPage | undefined {
  return position > 0 ? behind[position] : undefined;
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
