/**
 * @module ui/BackLink
 * @purpose The one Back link of the app (#652, #1225): an arrow and the name of the page the reader came from, shown only when there is such a page inside the app.
 * @conventions Rendered once by the app shell above the section heading, never by a screen, so its place is the same everywhere; it is its own labelled navigation landmark, so it is not page content outside a landmark (axe `region`). The label is the previous page's own name (`← Consultation`), from `nav-history`; with no previous page, or one that set no title, it says "Back" when the page is known and renders nothing when it is not. The real `href` is the previous page's, so it works in a new tab, without scripts and for assistive technology, and a plain click goes through `history.back()`. A modified click (new tab, new window) keeps the browser's own behaviour.
 * @exports BackLink
 */
import { useSyncExternalStore } from 'react';
import { useMessages } from './messages.js';
import { previousPage, subscribeNavigation } from './nav-history.js';
import { sharedMessages } from './shared.messages.js';

export function BackLink(): React.JSX.Element | null {
  const shared = useMessages(sharedMessages);
  const previous = useSyncExternalStore(subscribeNavigation, previousPage);
  if (previous === undefined) return null;
  return (
    <nav className="back-bar" aria-label={shared.backNavLabel}>
      <p className="back">
        <a
          href={previous.href}
          onClick={(event) => {
            const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
            if (modified) return;
            event.preventDefault();
            window.history.back();
          }}
        >
          &larr; {previous.name ?? shared.back}
        </a>
      </p>
    </nav>
  );
}
