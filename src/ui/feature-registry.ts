/**
 * The single source of truth for every user-facing feature's navigation metadata (#506/#509):
 * which group it belongs to, its order within that group, how to build its href, whether it
 * needs a completed birth moment, and what kind of settings surface it uses. Derived from, not
 * duplicating, the existing pure navigation modules (`person-nav.ts`, `tools-nav.ts`,
 * `admin-nav.ts`) — each already held most of this metadata for its own menu; this module is
 * what lets `WorkspaceShell`/`PageHeader`/the exhaustiveness test treat every feature uniformly
 * instead of three independently-shaped lists.
 *
 * `docs/UI-UX_IMPLEMENTATION_PLAN.md` §5.1 asks for this exact shape (`FeatureDefinition`) plus
 * an exhaustiveness test; `test/ui-feature-registry.test.ts` is that test.
 */
/**
 * @module ui/feature-registry
 * @purpose Single typed registry of every user-facing feature's scope/group/order/href/prerequisites/settings-mode/export-capabilities (#506/#509), derived from person-nav.ts/tools-nav.ts/admin-nav.ts rather than duplicating them.
 * @conventions Pure data, no JSX, no locale — label text stays in each feature's own existing *.messages.ts catalogue, looked up by `labelKey` at render time, same convention person-nav.ts/tools-nav.ts already use. `routeKind` ties a definition back to route.ts's `Route['kind']` so the exhaustiveness test can catch a route with no feature metadata.
 * @exports FeatureKey, FeatureScope, FeatureGroup, SettingsMode, ExportCapability, FeatureContext, FeatureDefinition, FEATURES, featureFor, hrefFor
 */
import { PERSON_TABS, type PersonTabKey } from './person-nav.js';
import { TOOLS, type ToolKey } from './tools-nav.js';
import { ADMIN_TABS, type AdminTabKey } from './admin-nav.js';
import type { Route } from './route.js';

export type FeatureScope = 'person' | 'global' | 'document' | 'preferences' | 'admin';

/**
 * Groups mirror `docs/UI-UX_GUIDELINES.md` §2's canonical information architecture: person
 * features fall into the four person-workspace groups, global features into the three Explore
 * groups, and everything else keeps its own single-member group.
 */
export type FeatureGroup =
  | 'person-overview'
  | 'person-charts'
  | 'person-interpretation'
  | 'person-timing'
  | 'person-relationships'
  | 'person-location'
  | 'explore-sky-cycles'
  | 'explore-questions-planning'
  | 'explore-birth-data'
  | 'documents'
  | 'preferences'
  | 'admin';

export type SettingsMode = 'none' | 'inline' | 'staged-dialog' | 'workspace';

/** Declarative, not the live runtime list `export-registry.tsx` holds — see that module for the actual per-mount items. This says what *kind* of export a feature's screen is expected to offer, so a feature claiming none can be told apart from one that just hasn't registered anything yet. */
export type ExportCapability = 'chart-image' | 'csv' | 'map' | 'pdf-document' | 'none';

export type FeatureKey = PersonTabKey | ToolKey | AdminTabKey | 'export-builder';

export interface FeatureContext {
  readonly personId?: string | undefined;
}

export interface FeatureDefinition {
  readonly key: FeatureKey;
  readonly scope: FeatureScope;
  readonly group: FeatureGroup;
  /** Order within `group`, ascending. */
  readonly order: number;
  readonly routeKind: Route['kind'];
  readonly buildHref: (context: FeatureContext) => string;
  readonly requiresBirthMoment: boolean;
  readonly settingsMode: SettingsMode;
  readonly exportCapabilities: readonly ExportCapability[];
  /** Looked up in the feature's own existing messages catalogue (PersonNav.messages.ts, AppNav.messages.ts, AdminNav.messages.ts) — this registry carries no locale text itself. */
  readonly labelKey: string;
}

const PERSON_GROUP_FOR_TAB: Readonly<Record<PersonTabKey, FeatureGroup>> = {
  overview: 'person-overview',
  'birth-record': 'person-overview',
  chart: 'person-charts',
  report: 'person-interpretation',
  profections: 'person-timing',
  progressions: 'person-timing',
  'solar-arc': 'person-timing',
  'primary-directions': 'person-timing',
  transit: 'person-timing',
  synastry: 'person-relationships',
  composite: 'person-relationships',
  'periodic-transit': 'person-timing',
  astrocartography: 'person-location',
};

const PERSON_ROUTE_KIND_FOR_TAB: Readonly<Record<PersonTabKey, Route['kind']>> = {
  overview: 'person-overview',
  'birth-record': 'person',
  chart: 'chart',
  report: 'report',
  profections: 'profections',
  progressions: 'progressions',
  'solar-arc': 'solar-arc',
  'primary-directions': 'primary-directions',
  transit: 'transit',
  synastry: 'synastry',
  composite: 'composite',
  'periodic-transit': 'periodic-transit',
  astrocartography: 'astrocartography',
};

const PERSON_EXPORTS_FOR_TAB: Readonly<Record<PersonTabKey, readonly ExportCapability[]>> = {
  overview: ['none'],
  'birth-record': ['none'],
  chart: ['chart-image', 'csv'],
  report: ['pdf-document'],
  profections: ['csv'],
  progressions: ['csv'],
  'solar-arc': ['csv'],
  'primary-directions': ['chart-image', 'csv'],
  transit: ['chart-image', 'csv'],
  synastry: ['chart-image', 'csv'],
  composite: ['chart-image', 'csv'],
  'periodic-transit': ['csv'],
  astrocartography: ['map'],
};

/** Order within each person group follows PERSON_TABS' own order, grouped. */
function personFeatures(): readonly FeatureDefinition[] {
  const orderWithinGroup = new Map<FeatureGroup, number>();
  return PERSON_TABS.map((tab) => {
    const group = PERSON_GROUP_FOR_TAB[tab.key];
    const order = orderWithinGroup.get(group) ?? 0;
    orderWithinGroup.set(group, order + 1);
    return {
      key: tab.key,
      scope: 'person',
      group,
      order,
      routeKind: PERSON_ROUTE_KIND_FOR_TAB[tab.key],
      buildHref: (context: FeatureContext) => {
        if (context.personId === undefined) throw new Error(`feature "${tab.key}" needs a personId`);
        return tab.buildHref(context.personId);
      },
      requiresBirthMoment: tab.key !== 'overview' && tab.key !== 'birth-record',
      settingsMode: 'none',
      exportCapabilities: PERSON_EXPORTS_FOR_TAB[tab.key],
      labelKey: tab.key,
    };
  });
}

const EXPLORE_GROUP_FOR_TOOL: Readonly<Record<ToolKey, FeatureGroup>> = {
  cycles: 'explore-sky-cycles',
  eclipses: 'explore-sky-cycles',
  horary: 'explore-questions-planning',
  electional: 'explore-questions-planning',
  rectification: 'explore-birth-data',
};

function exploreFeatures(): readonly FeatureDefinition[] {
  const orderWithinGroup = new Map<FeatureGroup, number>();
  return TOOLS.map((tool) => {
    const group = EXPLORE_GROUP_FOR_TOOL[tool.key];
    const order = orderWithinGroup.get(group) ?? 0;
    orderWithinGroup.set(group, order + 1);
    return {
      key: tool.key,
      scope: 'global',
      group,
      order,
      routeKind: tool.key,
      buildHref: () => tool.href,
      requiresBirthMoment: false,
      settingsMode: 'inline',
      exportCapabilities: tool.key === 'cycles' || tool.key === 'eclipses' ? ['chart-image'] : ['none'],
      labelKey: tool.key,
    } satisfies FeatureDefinition;
  });
}

function adminFeatures(): readonly FeatureDefinition[] {
  return ADMIN_TABS.map((tab, index) => ({
    key: tab.key,
    scope: 'admin',
    group: 'admin',
    order: index,
    routeKind:
      tab.key === 'users'
        ? 'admin'
        : tab.key === 'usage'
          ? 'admin-usage'
          : tab.key === 'corpus-overrides'
            ? 'corpus-overrides'
            : 'corpus-candidates',
    buildHref: () => tab.href,
    requiresBirthMoment: false,
    settingsMode: 'none',
    exportCapabilities: ['csv'],
    labelKey: tab.key,
  }));
}

const MISCELLANEOUS_FEATURES: readonly FeatureDefinition[] = [
  {
    key: 'export-builder',
    scope: 'document',
    group: 'documents',
    order: 0,
    routeKind: 'export-builder',
    buildHref: () => '#/export',
    requiresBirthMoment: false,
    settingsMode: 'inline',
    exportCapabilities: ['pdf-document'],
    labelKey: 'export-builder',
  },
];

/** Every user-facing feature, in one typed list. */
export const FEATURES: readonly FeatureDefinition[] = [
  ...MISCELLANEOUS_FEATURES,
  ...personFeatures(),
  ...exploreFeatures(),
  ...adminFeatures(),
];

/** The feature a route resolves to, or `undefined` for a route with no feature metadata (e.g. `home`, `about`, `set-password`). */
export function featureFor(route: Route): FeatureDefinition | undefined {
  return FEATURES.find((feature) => feature.routeKind === route.kind);
}

/** Shorthand for `feature.buildHref(context)` by key, for callers that only have the key on hand. */
export function hrefFor(key: FeatureKey, context: FeatureContext = {}): string {
  const feature = FEATURES.find((candidate) => candidate.key === key);
  if (feature === undefined) throw new Error(`no feature registered for key "${key}"`);
  return feature.buildHref(context);
}
