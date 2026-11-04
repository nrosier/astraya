/**
 * The shared frame of every Tools page (#1139): a "Tools" page header, the tools as a tab bar in the shared Tabs
 * primitive (the same strip the Preferences and report screens use), and the open tool's screen in the tab panel,
 * where it keeps its own name as a section heading. Owner decision on #1139 (2026-11-04), which reverses the
 * ordinary-link row of #1050 for this section only.
 */
/**
 * @module ToolsLayout
 * @purpose Frames the Tools screens (Planetary cycles, Ephemeris research, Eclipses, Horary, Electional, Rectification) with a "Tools" h1 and a Tabs bar, replacing the SectionNav link row for this section (#1139).
 * @conventions Mounted by App.tsx around the open Tools screen. Each tab still navigates to its tool's unchanged route href (a hash change), so deep links work. The Tabs primitive has no narrow case, so at 40rem and below a labelled Select replaces the strip, inside a navigation landmark (axe `region`); the two are switched by CSS (`.tools-tabs`, `.tools-select`). The header section (a labelled region) takes the same width as the open screen. Labels come from AppNav.messages.ts.
 * @exports ToolsLayout
 */
import { appNavMessages } from './AppNav.messages.js';
import { useMessages } from './messages.js';
import { Select } from './primitives/Select.js';
import { Tabs, tabPanelProps } from './primitives/Tabs.js';
import { TOOLS, type ToolKey } from './tools-nav.js';

/** The tools whose screens use the wide data shell, so the header lines up with them. */
const WIDE_TOOLS: readonly ToolKey[] = ['horary', 'electional'];

export function ToolsLayout({
  active,
  children,
}: {
  readonly active: ToolKey;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const t = useMessages(appNavMessages);
  const label = t.subtabsAriaLabel(t.toolsLabel);
  // The panel holds whole screens with their own main landmark, so it only carries the id the tabs control: a tabpanel role around a main fails axe region.
  const { id } = tabPanelProps('tools', active);
  const items = TOOLS.map((tool) => ({ key: tool.key, label: t.toolLabels[tool.key] }));
  const open = (key: string): void => {
    const target = TOOLS.find((tool) => tool.key === key);
    if (target !== undefined) window.location.hash = target.href;
  };
  return (
    <>
      <section
        className={WIDE_TOOLS.includes(active) ? 'tools-header shell shell--wide' : 'tools-header shell'}
        aria-labelledby="tools-heading"
      >
        <h1 id="tools-heading">{t.toolsLabel}</h1>
        <div className="tools-tabs">
          <Tabs idBase="tools" label={label} items={items} active={active} onSelect={open} />
        </div>
        <nav className="tools-select" aria-label={label}>
          <div className="chart-view-select">
            <Select
              label={label}
              value={active}
              options={items.map((item) => ({ value: item.key, label: item.label }))}
              onChange={open}
            />
          </div>
        </nav>
      </section>
      <div id={id} className="tools-panel">
        {children}
      </div>
    </>
  );
}
