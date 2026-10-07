/**
 * The admin tab strip (#414): one place to reach every admin screen — users, AI usage, corpus
 * overrides and corpus candidates — rendered above whichever of them is open. Styled and marked
 * up like `PersonNav` (plain links in a labelled `<nav>`, not a WAI-ARIA tablist) so the two
 * read as the same kind of menu.
 *
 * Navigation only: every admin route is still guarded by `requireAdmin` on the server, so
 * showing or hiding this is a convenience, never the security boundary.
 */
/**
 * @module AdminNav
 * @purpose Renders the admin tab strip linking to the users, AI usage, corpus overrides, and corpus candidates admin screens.
 * @conventions Navigation UI only — the server's `requireAdmin` is the real security boundary, not this component; text comes from co-located `AdminNav.messages.ts` via `useMessages()`.
 * @exports AdminNav
 */
import { activeAdminTabKey, ADMIN_TABS } from './admin-nav.js';
import { adminNavMessages } from './AdminNav.messages.js';
import { useMessages } from './messages.js';
import type { Route } from './route.js';

export function AdminNav({ route }: { route: Route }): React.JSX.Element {
  const t = useMessages(adminNavMessages);
  const active = activeAdminTabKey(route);
  return (
    <div className="person-nav">
      <nav className="person-tabs" aria-label={t.adminSectionsAriaLabel}>
        {ADMIN_TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <a
              key={tab.key}
              href={tab.href}
              className={isActive ? 'person-tab active' : 'person-tab'}
              aria-current={isActive ? 'page' : undefined}
            >
              {t.tabLabels[tab.key]}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
