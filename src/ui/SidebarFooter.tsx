/**
 * The sidebar's footer block (anchored at the bottom of the rail, below the utilities): the version
 * and About & Licence links. It replaces the `<footer>` that used to sit under every screen's content.
 *
 * The update prompt is not shown here: the bottom banner (`PwaStatus.tsx`) is the single place it
 * appears (#1331).
 */
/**
 * @module SidebarFooter
 * @purpose Sidebar footer: the version (changelog link), a bullet and the About & Licence link.
 * @conventions Text from `SidebarFooter.messages.ts` via `useMessages()`. The update prompt lives in `PwaStatus.tsx`, not here (#1331).
 * @exports SidebarFooter
 */
import { APP_VERSION } from '../version.js';
import { useMessages } from './messages.js';
import { sidebarFooterMessages } from './SidebarFooter.messages.js';

export function SidebarFooter(): React.JSX.Element {
  const t = useMessages(sidebarFooterMessages);

  return (
    <div className="sidebar-footer">
      <p className="sidebar-footer-meta">
        <a href="#/changelog">{t.versionLink(APP_VERSION)}</a>
        <span aria-hidden="true">{t.separator}</span>
        <a href="#/about">{t.aboutLink}</a>
      </p>
    </div>
  );
}
