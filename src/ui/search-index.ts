/**
 * The command palette's search index (#1654): one entry per place a feature can be opened, built
 * from the feature registry so the palette and the menus cannot drift apart.
 *
 * Every feature in `FEATURES` gets one entry, titled with the label its menu item shows. The
 * sub-tabs the registry does not list are added too: each chart type × chart view (the natal wheel
 * is the Charts entry itself, so it is not repeated), the non-wheel `?view=` variants of Horary and
 * Composite, and the three Preferences sections. Every href goes through `routeHref`, the same hash
 * the link would write, and `parseRoute` reads it back.
 *
 * Pure, so the index is tested without a DOM. Person entries are left out when the context has no
 * personId; the caller passes the last opened person (owner answer 2). No drawer entries are built,
 * because no drawer has a route yet (owner answer 1).
 */
/**
 * @module ui/search-index
 * @purpose Builds the command palette's searchable entries (#1654) from FEATURES, chart type × view, Horary/Composite view variants and Preferences sections, with titles from the menus' own catalogues and hrefs from routeHref.
 * @conventions Pure, no DOM, so it is tested without one. Titles reuse the menu labels so a palette row reads like its menu item. Keywords and descriptions live in search-index.messages.ts. Person entries need the context's personId and are dropped without one. An entry that needs a birth moment is disabled when the context says the person's birth moment is incomplete. No drawer entries.
 * @exports SearchContext, SearchEntry, buildSearchIndex
 */
import type { Locale } from '../interpretation/schema.js';
import { CHART_TYPES, CHART_VIEWS, type ChartViewKind } from './chart-sections.js';
import { chartViewMessages } from './ChartView.messages.js';
import { chartTypesMessages } from './ChartTypes.messages.js';
import { adminNavMessages } from './AdminNav.messages.js';
import { appNavMessages } from './AppNav.messages.js';
import { preferencesViewMessages } from './PreferencesView.messages.js';
import { PREFERENCES_SECTIONS, routeHref } from './route.js';
import { FEATURES, type FeatureDefinition } from './feature-registry.js';
import { PERSON_TAB_FAMILIES } from './person-nav.js';
import { TOOLS } from './tools-nav.js';
import { searchIndexMessages } from './search-index.messages.js';

export interface SearchContext {
  readonly personId?: string | undefined;
  /** Leads each person entry's breadcrumb (owner answer 2: the last opened person). */
  readonly personName?: string | undefined;
  /** `false` disables entries that need a complete birth moment; anything else leaves them enabled. */
  readonly hasBirthMoment?: boolean | undefined;
}

export interface SearchEntry {
  /** Stable across locales and people, so a recent or pin can be matched back to its entry. */
  readonly id: string;
  readonly title: string;
  /** The places the entry sits in, joined with the breadcrumb separator. Empty for a top-level page. */
  readonly breadcrumb: string;
  readonly href: string;
  readonly keywords: readonly string[];
  readonly description: string;
  readonly disabled?: true;
}

/** A label from a catalogue table; a missing key is a catalogue bug, not a blank title. */
function labelOf(table: Readonly<Record<string, string>>, key: string): string {
  const value = table[key];
  if (value === undefined) throw new Error(`no search label for "${key}"`);
  return value;
}

function featureNeedsBirthMoment(key: string): boolean {
  return FEATURES.find((feature) => feature.key === key)?.requiresBirthMoment ?? false;
}

/** An entry is disabled only when it needs a birth moment and the person's birth moment is known to be incomplete. */
function isDisabled(requiresBirthMoment: boolean, context: SearchContext): boolean {
  return requiresBirthMoment && context.hasBirthMoment === false;
}

function viewLabel(view: ChartViewKind, labels: typeof chartViewMessages.en): string {
  switch (view) {
    case 'wheel':
      return labels.wheelViewLabel;
    case 'aspects':
      return labels.aspectsViewLabel;
    case 'matrix':
      return labels.matrixViewLabel;
    case 'elements':
      return labels.elementsViewLabel;
    case 'placements':
      return labels.placementsViewLabel;
    case 'patterns':
      return labels.patternsViewLabel;
  }
}

function joinParts(parts: readonly string[], separator: string): string {
  return parts.filter((part) => part !== '').join(separator);
}

/** The menu title of a feature, and the places its menu item sits in (after the person's name, for person features). */
function featureTitleAndPlaces(feature: FeatureDefinition, locale: Locale): { title: string; places: string[] } {
  const app = appNavMessages[locale];
  if (feature.key === 'documents') return { title: app.documents, places: [] };
  if (feature.key === 'export-builder') return { title: app.exportPdfBuilder, places: [app.documents] };
  if (feature.scope === 'person') {
    const family = PERSON_TAB_FAMILIES.find((candidate) => candidate.members.some((member) => member === feature.key));
    return {
      title: labelOf(app.tabLabels, feature.labelKey),
      places: family === undefined ? [] : [app.familyLabels[family.key]],
    };
  }
  if (feature.scope === 'admin') {
    return { title: labelOf(adminNavMessages[locale].tabLabels, feature.labelKey), places: [] };
  }
  const tool = TOOLS.find((candidate) => candidate.key === feature.key);
  return {
    title: labelOf(app.toolLabels, feature.labelKey),
    places: tool === undefined ? [] : [app.toolsLabel, app.toolGroupLabels[tool.group]],
  };
}

function featureEntries(context: SearchContext, locale: Locale): SearchEntry[] {
  const messages = searchIndexMessages[locale];
  const separator = messages.breadcrumbSeparator;
  const entries: SearchEntry[] = [];
  for (const feature of FEATURES) {
    if (feature.scope === 'person' && context.personId === undefined) continue;
    const { title, places } = featureTitleAndPlaces(feature, locale);
    entries.push({
      id: `feature:${feature.key}`,
      title,
      breadcrumb:
        feature.scope === 'person'
          ? joinParts([context.personName ?? '', ...places], separator)
          : joinParts(places, separator),
      href: feature.buildHref({ personId: context.personId }),
      keywords: messages.featureKeywords[feature.key],
      description: messages.featureDescriptions[feature.key],
      ...(isDisabled(feature.requiresBirthMoment, context) ? { disabled: true as const } : {}),
    });
  }
  return entries;
}

function chartEntries(context: SearchContext, locale: Locale): SearchEntry[] {
  const { personId } = context;
  if (personId === undefined) return [];
  const app = appNavMessages[locale];
  const messages = searchIndexMessages[locale];
  const views = chartViewMessages[locale];
  const types = chartTypesMessages[locale].typeLabels;
  const requiresBirthMoment = featureNeedsBirthMoment('chart');
  const entries: SearchEntry[] = [];
  for (const chartType of CHART_TYPES) {
    for (const view of CHART_VIEWS) {
      if (chartType === 'natal' && view === 'wheel') continue;
      entries.push({
        id: `chart:${chartType}:${view}`,
        title: `${types[chartType]}${messages.titleSeparator}${viewLabel(view, views)}`,
        breadcrumb: joinParts([context.personName ?? '', app.tabLabels.chart], messages.breadcrumbSeparator),
        href: routeHref({ kind: 'chart', personId, chartType, view }),
        keywords: [...messages.chartTypeKeywords[chartType], ...messages.chartViewKeywords[view]],
        description: messages.chartTypeDescriptions[chartType],
        ...(isDisabled(requiresBirthMoment, context) ? { disabled: true as const } : {}),
      });
    }
  }
  return entries;
}

/** The Horary and Composite `?view=` variants. Each one's Wheel is its own feature entry, so it is not repeated. */
function viewVariantEntries(context: SearchContext, locale: Locale): SearchEntry[] {
  const app = appNavMessages[locale];
  const messages = searchIndexMessages[locale];
  const views = chartViewMessages[locale];
  const separator = messages.breadcrumbSeparator;
  const entries: SearchEntry[] = [];
  for (const view of CHART_VIEWS) {
    if (view === 'wheel') continue;
    entries.push({
      id: `horary:${view}`,
      title: `${app.toolLabels.horary}${messages.titleSeparator}${viewLabel(view, views)}`,
      breadcrumb: joinParts([app.toolsLabel, app.toolGroupLabels['questions-planning']], separator),
      href: routeHref({ kind: 'horary', view }),
      keywords: [...messages.featureKeywords.horary, ...messages.chartViewKeywords[view]],
      description: messages.featureDescriptions.horary,
    });
  }
  const { personId } = context;
  if (personId === undefined) return entries;
  const requiresBirthMoment = featureNeedsBirthMoment('composite');
  for (const view of CHART_VIEWS) {
    if (view === 'wheel') continue;
    entries.push({
      id: `composite:${view}`,
      title: `${app.tabLabels.composite}${messages.titleSeparator}${viewLabel(view, views)}`,
      breadcrumb: joinParts([context.personName ?? '', app.familyLabels['relationship-charts']], separator),
      href: routeHref({ kind: 'composite', personId, view }),
      keywords: [...messages.featureKeywords.composite, ...messages.chartViewKeywords[view]],
      description: messages.featureDescriptions.composite,
      ...(isDisabled(requiresBirthMoment, context) ? { disabled: true as const } : {}),
    });
  }
  return entries;
}

function preferenceEntries(locale: Locale): SearchEntry[] {
  const messages = searchIndexMessages[locale];
  const labels = preferencesViewMessages[locale].tabLabels;
  return PREFERENCES_SECTIONS.map((section) => ({
    id: `preferences:${section}`,
    title: labels[section],
    breadcrumb: messages.preferencesLabel,
    href: routeHref({ kind: 'preferences', section }),
    keywords: messages.preferencesSectionKeywords[section],
    description: messages.preferencesSectionDescriptions[section],
  }));
}

/**
 * Every place the palette can open, in one list: the registry's features first (in registry order),
 * then the chart type × view entries, the Horary and Composite view variants, and the Preferences sections.
 */
export function buildSearchIndex(context: SearchContext, locale: Locale): readonly SearchEntry[] {
  return [
    ...featureEntries(context, locale),
    ...chartEntries(context, locale),
    ...viewVariantEntries(context, locale),
    ...preferenceEntries(locale),
  ];
}
