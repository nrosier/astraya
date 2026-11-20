/**
 * The sidebar rail's collapse/expand toggle (#1747, moved to the header by #1851), rendered in the
 * header's brand row. Icon only: the resting PanelLeft swaps to PanelLeftClose (expanded) or
 * PanelLeftOpen (collapsed) on hover and keyboard focus (CSS). A styled tooltip names the action
 * in both states; the accessible name is the longer "sidebar" form. The preference is the device
 * setting in `workspace-rail-setting.ts`.
 */
/**
 * @module ui/RailCollapseButton
 * @purpose Header toggle (icon only) that toggles the sidebar rail between expanded and icon-only (collapsed), backed by the device preference in workspace-rail-setting.
 * @conventions Uses the shared Button primitive (plain variant, `type="button"`) with aria-expanded and a state-dependent long aria-label, and no `title` attribute (owner decision on #1851, 2026-11-20). It renders a rest icon and an active icon (swapped by CSS on hover and focus-visible) and a short `role="tooltip"` sibling in both states, sharing the `.rail-nav-item` wrapper with `RailNavItem`; Escape dismisses it (WCAG 1.4.13). Icons are inline SVG from nav-icons. Strings from RailCollapseButton.messages via useMessages().
 * @exports RailCollapseButton
 */
import { useState } from 'react';
import { Button } from './primitives/Button.js';
import { useMessages } from './messages.js';
import { PanelLeft, PanelLeftClose, PanelLeftOpen } from './nav-icons.js';
import { railCollapseButtonMessages } from './RailCollapseButton.messages.js';
import { useRailCollapsed } from './workspace-rail-setting.js';

export function RailCollapseButton(): React.JSX.Element {
  const t = useMessages(railCollapseButtonMessages);
  const [collapsed, setCollapsed] = useRailCollapsed();
  const [dismissed, setDismissed] = useState(false);

  return (
    <span
      className="rail-nav-item rail-collapse-item"
      data-tooltip-dismissed={dismissed ? 'true' : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setDismissed(true);
      }}
      onMouseLeave={() => {
        setDismissed(false);
      }}
      onBlur={() => {
        setDismissed(false);
      }}
    >
      <Button
        variant="plain"
        className="rail-collapse-button"
        aria-expanded={!collapsed}
        aria-label={collapsed ? t.expandAria : t.collapseAria}
        onClick={() => {
          setCollapsed(!collapsed);
        }}
      >
        <span className="rail-toggle-icon-rest">
          <PanelLeft />
        </span>
        <span className="rail-toggle-icon-active">{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</span>
      </Button>
      <span className="rail-nav-tooltip" role="tooltip">
        {collapsed ? t.expandTip : t.collapseTip}
      </span>
    </span>
  );
}
