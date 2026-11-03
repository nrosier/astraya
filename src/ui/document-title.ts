/**
 * The browser tab title (#1078, WCAG 2.4.2): every screen's title is its `<h1>` (feature and subject), then the app
 * name, so tabs, history entries and a screen reader's page announcement tell screens apart. Set in one place,
 * `PageHeader`, plus the few screens that render their own `<h1>`.
 */
/**
 * @module ui/document-title
 * @purpose Builds a screen's document title from its heading and keeps `document.title` in step while the screen is shown.
 * @conventions The heading is already localised by the screen, so the title follows the interface language; the app name is the same in every language. The previous title is restored on unmount, so a screen without a heading falls back to `index.html`'s.
 * @exports APP_NAME, documentTitle, useDocumentTitle, DocumentTitle
 */
import { useEffect } from 'react';

export const APP_NAME = 'Astraya';

/** "Natal · Ada – Astraya": the heading, then the app name. */
export function documentTitle(heading: string): string {
  return `${heading} – ${APP_NAME}`;
}

/** Sets the tab title from a screen's heading while the screen is mounted. */
export function useDocumentTitle(heading: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = documentTitle(heading);
    return () => {
      document.title = previous;
    };
  }, [heading]);
}

/**
 * The same, as an element placed beside a screen's own `<h1>`. An element, not a hook in the parent: React runs a
 * parent's effects after its children's, so a hook in a wrapper would overwrite every page's title.
 */
export function DocumentTitle({ heading }: { readonly heading: string }): null {
  useDocumentTitle(heading);
  return null;
}
