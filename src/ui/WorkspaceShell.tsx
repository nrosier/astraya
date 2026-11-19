/**
 * The application shell (#506/#509): places the header beside the current screen's content as a
 * collapsible left rail on wide viewports, per `docs/ui/UI-UX_GUIDELINES.md`'s "Target application
 * shell" — brand, the searchable person switcher, person workspace groups, and Tools/Export sit
 * in one scrollable column with the utilities (sync, account, Preferences, language, symbols, theme) in a container anchored at its foot (#882), rather than a bar
 * across the top of the page.
 *
 * This component owns only the shell's layout and the rail's collapsed/expanded state (a device
 * preference, `workspace-rail-setting.ts`); `App.tsx` still builds the header's actual content
 * and `AppNav.tsx` still owns every dropdown's open/close behavior, unchanged. Below 64rem the
 * rail reverts to `AppNav.tsx`'s existing horizontal bar with its own folding panel — deliberately
 * untouched, since that already satisfies the guideline's "drawer on smaller screens" and
 * rewriting a second, independently-tested off-canvas pattern for narrow screens would duplicate
 * rather than improve it.
 */
/**
 * @module ui/WorkspaceShell
 * @purpose Lays out the header as a collapsible left rail beside the current screen's content at >=64rem; narrower viewports keep AppNav.tsx's existing horizontal-bar-with-folding-panel behavior untouched. Also hosts the workspace utility row (the search trigger, #1769) above the page content.
 * @conventions Pure layout wrapper — never renders navigation content itself; reads the `workspace-rail-setting.ts` collapsed/expanded device preference only to set the shell's class. The collapse control is `RailCollapseButton.tsx`, rendered by App.tsx inside the header.
 * @exports WorkspaceShell
 */
import { useRailCollapsed } from './workspace-rail-setting.js';
import { useWorkspaceUtilityRef } from './workspace-utility-slot.js';

export function WorkspaceShell({
  header,
  children,
}: {
  readonly header: React.ReactNode;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [collapsed] = useRailCollapsed();

  return (
    <div className={collapsed ? 'workspace-shell workspace-shell-collapsed' : 'workspace-shell'}>
      {header}
      <div className="workspace-main">
        <div className="workspace-utility" ref={useWorkspaceUtilityRef()} />
        {children}
      </div>
    </div>
  );
}
