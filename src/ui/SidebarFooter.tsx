/**
 * The sidebar's footer block (anchored at the bottom of the rail, below the utilities): the
 * update notice, then the version and About & Licence links. It replaces the `<footer>` that
 * used to sit under every screen's content.
 *
 * The update notice is hidden unless a waiting service worker was detected (`pwa/register.ts`);
 * "Reload" applies it, only on the visitor's click, so a session is never swapped silently.
 */
/**
 * @module SidebarFooter
 * @purpose Sidebar footer: conditional "New version available" banner with a Reload button, then the version (changelog link), a bullet and the About & Licence link.
 * @conventions The update banner is always rendered but `hidden` until an update is detected; the state comes from `pwa/register` unless a caller passes the prop. Text from `SidebarFooter.messages.ts` via `useMessages()`.
 * @exports SidebarFooter
 */
import { useSyncExternalStore } from 'react';
import { applyUpdate, getUpdateState, subscribeToUpdates } from '../pwa/register.js';
import { APP_VERSION } from '../version.js';
import { useMessages } from './messages.js';
import { sidebarFooterMessages } from './SidebarFooter.messages.js';

function isUpdateAvailable(): boolean {
  return getUpdateState().kind === 'available';
}

export function SidebarFooter({
  updateAvailable,
}: {
  /** Overrides the detected state (tests); omitted in the app, where the service worker decides. */
  readonly updateAvailable?: boolean;
}): React.JSX.Element {
  const t = useMessages(sidebarFooterMessages);
  const detected = useSyncExternalStore(subscribeToUpdates, isUpdateAvailable);
  const showUpdate = updateAvailable ?? detected;

  return (
    <div className="sidebar-footer">
      <div className="sidebar-footer-update" hidden={!showUpdate} role="status">
        <span>{t.updateAvailable}</span>
        <button type="button" onClick={applyUpdate}>
          {t.reload}
        </button>
      </div>
      <p className="sidebar-footer-meta">
        <a href="#/changelog">{t.versionLink(APP_VERSION)}</a>
        <span aria-hidden="true">{t.separator}</span>
        <a href="#/about">{t.aboutLink}</a>
      </p>
    </div>
  );
}
