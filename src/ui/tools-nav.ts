/**
 * The tools menu (#421, #506/#509): the screens that are not about one person's chart — they need
 * no stored person, or take one only as an optional starting point. They used to be a row of links
 * under the People list, reachable only from there; they now sit in one menu in the header, on
 * every screen.
 *
 * The group is called **Tools** (Dutch *Hulpmiddelen*). Grouped by the task the user recognizes,
 * per `docs/UI-UX_GUIDELINES.md`'s navigation table, rather than left as one flat list of five:
 * **Sky & cycles** (planetary cycles, eclipses — almanac-style questions about the sky itself),
 * **Questions & planning** (horary, electional — a chart cast for a question or a search for the
 * best moment), **Birth data** (rectification — testing candidate birth times). Rendered as
 * noninteractive headings inside the one Tools dropdown, not a second level of flyouts — the
 * guidelines are explicit that a menu stays one dropdown level deep.
 *
 * Pure, like `person-nav.ts` and `admin-nav.ts`: which tools exist, which group each is in, and
 * which one a route is on can all be tested without a DOM. Labels are translated, so they live in
 * `AppNav.messages.ts` by `key`.
 */
/**
 * @module ui/tools-nav
 * @purpose Pure logic for the header's Tools menu (#421, #506/#509): the five not-person-scoped calculator screens (cycles/eclipses/horary/electional/rectification), grouped as Sky & cycles/Questions & planning/Birth data, and which one a route is on.
 * @conventions Pure, like person-nav.ts and admin-nav.ts, so menu/active-tool logic is tested without a DOM; labels are translated and live in AppNav.messages.ts, looked up by key. TOOL_GROUPS is in display order; TOOLS stays grouped (every member of one group appears consecutively) so AppNav.tsx can render one heading per group without re-sorting.
 * @exports ToolKey, ToolGroupKey, Tool, TOOL_GROUPS, TOOLS, activeToolKey
 */
import type { Route } from './route.js';

export type ToolKey = 'cycles' | 'eclipses' | 'horary' | 'electional' | 'rectification';
export type ToolGroupKey = 'sky-cycles' | 'questions-planning' | 'birth-data';

export interface Tool {
  readonly key: ToolKey;
  readonly href: string;
  readonly group: ToolGroupKey;
}

/** Display order of the three groups. */
export const TOOL_GROUPS: readonly ToolGroupKey[] = ['sky-cycles', 'questions-planning', 'birth-data'];

/** In menu order, grouped: every member of one group appears consecutively, in `TOOL_GROUPS` order. */
export const TOOLS: readonly Tool[] = [
  { key: 'cycles', href: '#/cycles', group: 'sky-cycles' },
  { key: 'eclipses', href: '#/eclipses', group: 'sky-cycles' },
  { key: 'horary', href: '#/horary', group: 'questions-planning' },
  { key: 'electional', href: '#/electional', group: 'questions-planning' },
  { key: 'rectification', href: '#/rectification', group: 'birth-data' },
];

/** The tool a route is on, or `null` for any other route. */
export function activeToolKey(route: Route): ToolKey | null {
  switch (route.kind) {
    case 'cycles':
    case 'eclipses':
    case 'horary':
    case 'electional':
    case 'rectification':
      return route.kind;
    default:
      return null;
  }
}
