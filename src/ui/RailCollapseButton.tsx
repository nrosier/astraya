/**
 * The sidebar rail's collapse/expand control (#1747), rendered as the last child of the header
 * in the footer position. Expanded it shows the PanelLeftClose icon with a "Collapse" label;
 * collapsed it shows the PanelLeftOpen icon alone, named by its aria-label. The preference is
 * the device setting in `workspace-rail-setting.ts`.
 */
/**
 * @module ui/RailCollapseButton
 * @purpose Footer button that toggles the sidebar rail between expanded and icon-only (collapsed), backed by the device preference in workspace-rail-setting.
 * @conventions Uses the shared Button primitive (plain variant, `type="button"`) with aria-expanded and a state-dependent aria-label. Icons are inline SVG from nav-icons. Strings from RailCollapseButton.messages via useMessages().
 * @exports RailCollapseButton
 */
import { Button } from './primitives/Button.js';
import { useMessages } from './messages.js';
import { PanelLeftClose, PanelLeftOpen } from './nav-icons.js';
import { railCollapseButtonMessages } from './RailCollapseButton.messages.js';
import { useRailCollapsed } from './workspace-rail-setting.js';

export function RailCollapseButton(): React.JSX.Element {
  const t = useMessages(railCollapseButtonMessages);
  const [collapsed, setCollapsed] = useRailCollapsed();

  return (
    <Button
      variant="plain"
      className="rail-collapse-button"
      aria-expanded={!collapsed}
      aria-label={collapsed ? t.expandAria : t.collapseAria}
      onClick={() => {
        setCollapsed(!collapsed);
      }}
    >
      {collapsed ? (
        <PanelLeftOpen />
      ) : (
        <>
          <PanelLeftClose />
          <span className="rail-collapse-button-label">{t.collapseLabel}</span>
        </>
      )}
    </Button>
  );
}
