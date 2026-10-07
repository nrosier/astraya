/**
 * The tools menu (#421): the screens that are not about one person's chart — they need no stored
 * person, or take one only as an optional starting point. They used to be a row of links under the
 * People list, reachable only from there; they now sit in one menu in the header, on every screen.
 *
 * The group is called **Tools** (Dutch *Hulpmiddelen*). What the five share is that each is a
 * calculator for a question rather than a view of a chart: when do the planets meet, when is the
 * next eclipse, what does the sky say about this question, when is a good moment to begin, which
 * birth time fits these events.
 *
 * Pure, like `person-nav.ts` and `admin-nav.ts`: which tools exist and which one a route is on can
 * be tested without a DOM. Labels are translated, so they live in `AppNav.messages.ts` by `key`.
 */
/**
 * @module ui/tools-nav
 * @purpose Pure logic for the header's Tools menu (#421): the five not-person-scoped calculator screens (cycles/eclipses/horary/electional/rectification) and which one a route is on.
 * @conventions Pure, like person-nav.ts and admin-nav.ts, so menu/active-tool logic is tested without a DOM; labels are translated and live in AppNav.messages.ts, looked up by key.
 * @exports ToolKey, Tool, TOOLS, activeToolKey
 */
import type { Route } from './route.js';

export type ToolKey = 'cycles' | 'eclipses' | 'horary' | 'electional' | 'rectification';

export interface Tool {
  readonly key: ToolKey;
  readonly href: string;
}

/** In menu order: the two almanac-style questions first, then the three that take a chart or a moment. */
export const TOOLS: readonly Tool[] = [
  { key: 'cycles', href: '#/cycles' },
  { key: 'eclipses', href: '#/eclipses' },
  { key: 'horary', href: '#/horary' },
  { key: 'electional', href: '#/electional' },
  { key: 'rectification', href: '#/rectification' },
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
