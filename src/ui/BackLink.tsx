/**
 * @module ui/BackLink
 * @purpose The Back link every screen carries (#652): it goes to the page the reader came from, or to the screen's fixed fallback when there is nowhere inside the app to go back to.
 * @conventions Labelled "Back" unless the screen names where it leads (the person form says "People", which people and tests already look for); the real `href` is the fallback, so it works in a new tab, without scripts and for assistive technology, and a plain click goes through `history.back()` when `nav-history` says the previous entry is in the app. A modified click (new tab, new window) keeps the browser's own behaviour. The fallback is where the screen belongs: a person's overview for a person screen, the people list for the rest.
 * @exports BackLink
 */
import { useSyncExternalStore } from 'react';
import { useMessages } from './messages.js';
import { canGoBack, subscribeNavigation } from './nav-history.js';
import { sharedMessages } from './shared.messages.js';

export function BackLink({
  fallback,
  label,
}: {
  readonly fallback: string;
  /** What the link says instead of "Back", for a screen that names its destination. */
  readonly label?: string | undefined;
}): React.JSX.Element {
  const shared = useMessages(sharedMessages);
  const insideApp = useSyncExternalStore(subscribeNavigation, canGoBack);
  return (
    <p className="back">
      <a
        href={fallback}
        onClick={(event) => {
          const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
          if (!insideApp || modified) return;
          event.preventDefault();
          window.history.back();
        }}
      >
        &larr; {label ?? shared.back}
      </a>
    </p>
  );
}
