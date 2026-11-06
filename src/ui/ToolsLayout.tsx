/**
 * The shared frame of every Tools page (#1139): a "Tools" page header, the tools as a tab bar in the shared Tabs
 * primitive (the same strip the Preferences and report screens use), and the open tool's screen in the tab panel,
 * where it keeps its own name as a section heading. Owner decision on #1139 (2026-11-04), which reverses the
 * ordinary-link row of #1050 for this section only.
 */
/**
 * @module ToolsLayout
 * @purpose Frames the Tools screens (Planetary cycles, Ephemeris research, Eclipses, Horary, Electional, Rectification) with a "Tools" h1 and a Tabs bar, replacing the SectionNav link row for this section (#1139); the frame itself is `SectionLayout` (#1175).
 * @conventions Mounted by App.tsx around the open Tools screen; a thin wrapper that gives `SectionLayout` the tools, their hrefs and their translated labels. Tab and panel ids keep the `tools` prefix.
 * @exports ToolsLayout
 */
import { appNavMessages } from './AppNav.messages.js';
import { useMessages } from './messages.js';
import { SectionLayout } from './SectionLayout.js';
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
  return (
    <SectionLayout
      idBase="tools"
      heading={t.toolsLabel}
      items={TOOLS.map((tool) => ({ key: tool.key, label: t.toolLabels[tool.key], href: tool.href }))}
      active={active}
      wide={WIDE_TOOLS.includes(active)}
    >
      {children}
    </SectionLayout>
  );
}
