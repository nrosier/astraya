/**
 * Hash routes.
 *
 * Pure and separate from the components on purpose. A route that fails to match renders a
 * blank screen or, worse, silently falls through to the home page — a failure a user reports
 * as "the link you sent me doesn't work" and which no type checker catches. Parsing it here
 * means it can be tested without a DOM.
 *
 * Hash routing rather than history routing because the built app is static files: every URL
 * has to resolve without a server rewrite rule, including when the app is opened from disk.
 *
 * The canonical scheme (docs/UI-UX_IMPLEMENTATION_PLAN.md §3) is the only one: `parseRoute` reads these
 * and `routeHref` writes them, so the old shapes (`#/person/:id`, `#/chart/:id?type=…`, `#/cycles`, …) are
 * simply unknown and fall back to Home. Nothing builds a hash by hand; every link goes through `routeHref`.
 *
 *   #/people                                              People
 *   #/people/:id/overview                                 Overview
 *   #/people/:id/consultation                             Consultation dashboard
 *   #/people/:id/birth-record                             Edit birth record
 *   #/people/:id/charts/:chartType/:chartView             Chart (natal|draconic|harmonic|solar-return|lunar-return × wheel|aspects|matrix|elements|placements|patterns)
 *   #/people/:id/interpretation                           Interpretation (the written report)
 *   #/people/:id/timing/:technique                        timeline|profections|progressions|solar-arc|primary-directions|transits|forecast
 *   #/people/:id/relationships/:technique                 synastry|composite (composite: ?view=)
 *   #/people/:id/location/astrocartography                Astrocartography
 *   #/explore/:tool                                       cycles|eclipses|horary|electional|rectification (horary: ?view=)
 *   #/documents                                           Documents (PDF builder, saved charts)
 *   #/preferences[/:section]                              Preferences (general|astrology|appearance|data)
 *   #/admin, #/admin/usage, #/admin/corpus-overrides, #/admin/corpus-candidates, #/shared, #/about, #/changelog,
 *   #/set-password, #/setup                               unchanged
 */
/**
 * @module ui/route
 * @purpose Pure hash-route parsing and construction for every screen in the app, on the one canonical scheme, plus one-time-token query extraction (set-password, setup).
 * @conventions Pure and separate from components so it is tested without a DOM; hash routing since the built app is static files with no server rewrite rule; ids are validated with domain/id.js's isPersonId rather than accepted as any string; an unknown, obsolete or malformed hash falls back to Home with no redirect or alias; `parseRoute(routeHref(r))` round-trips for every route.
 * @exports Route, PreferencesSection, PREFERENCES_SECTIONS, parseRoute, routeHref, chartHref, personHref, setPasswordToken, setupToken
 */
import { isPersonId } from '../domain/id.js';
import { chartViewFromHash, isChartType, isChartView, type ChartType, type ChartViewKind } from './chart-sections.js';

export const PREFERENCES_SECTIONS = ['general', 'astrology', 'appearance', 'data'] as const;
export type PreferencesSection = (typeof PREFERENCES_SECTIONS)[number];

function isPreferencesSection(value: string | undefined): value is PreferencesSection {
  return (PREFERENCES_SECTIONS as readonly (string | undefined)[]).includes(value);
}

export type Route =
  | { readonly kind: 'home' }
  | { readonly kind: 'about' }
  | { readonly kind: 'changelog' }
  | { readonly kind: 'people' }
  | { readonly kind: 'person'; readonly personId: string }
  // A complete person's landing screen (#506/#509).
  | { readonly kind: 'person-overview'; readonly personId: string }
  // The consultation dashboard (#563): current transits, active timing techniques and chart
  // highlights for one person, for "now" only — second in the person workspace, right after
  // Overview.
  | { readonly kind: 'consultation'; readonly personId: string }
  // The Charts page: one route for every chart cast for one person. `chartType` is the kind of chart
  // (absent means natal) and `view` its open Wheel/Aspects/Aspect matrix/Elements/Placements/Patterns view
  // (#511; absent means the wheel). Both are path segments of the canonical hash. Optional `compareType`
  // enables side-by-side comparison of two chart types (#439), passed as `?compare=` query param.
  | {
      readonly kind: 'chart';
      readonly personId: string;
      readonly chartType?: ChartType;
      readonly view?: ChartViewKind;
      readonly compareType?: ChartType;
    }
  // The written report (#271): Interpretation in the navigation.
  | { readonly kind: 'report'; readonly personId: string }
  | { readonly kind: 'profections'; readonly personId: string }
  // Secondary/tertiary/minor progression (#398) — the technique and, for secondary, the MC
  // method are picked in-screen, same reasoning as harmonic's divisional-chart picker: they
  // change far more often within one visit than worth sharing as a link.
  | { readonly kind: 'progressions'; readonly personId: string }
  // Solar arc directions (#398) — its own route rather than a 'progressions' sub-mode: the
  // data shape (DirectedContact's exactJd) and table columns are different enough to warrant
  // a separate screen, same reasoning that already split transit/periodic-transit apart.
  | { readonly kind: 'solar-arc'; readonly personId: string }
  // Primary directions (#407) — its own route for the same reason solar arc has one: a
  // lifetime list of significator/promissor arcs is a different table from any progression.
  | { readonly kind: 'primary-directions'; readonly personId: string }
  | { readonly kind: 'timing-timeline'; readonly personId: string }
  | { readonly kind: 'transit'; readonly personId: string }
  // The second person is picked from within the screen, not the URL (#172) — every other
  // multi-word route here names exactly one person, and a synastry pairing changes far more
  // often within one visit (trying several comparisons) than it's worth sharing as a link.
  | { readonly kind: 'synastry'; readonly personId: string }
  // Same reasoning as synastry (#169): the second person is picked in-screen, not the URL.
  // `view` is the same Wheel/Aspects/Placements/Patterns & condition axis as the chart route's (#511).
  | { readonly kind: 'composite'; readonly personId: string; readonly view?: ChartViewKind }
  // Daily/weekly/monthly/yearly transit forecast (#207). No second parameter to pick — the
  // screen's own "as of" date input plays the role a harmonic number or comparison person
  // plays elsewhere, and that's already excluded from the URL for the same reasons those are.
  | { readonly kind: 'periodic-transit'; readonly personId: string }
  // Astrocartography/Local Space map (#171). No second parameter: line types, body picker,
  // Local Space toggle and relocation place are all picked in-screen, same reasoning as
  // periodic-transit's "as of" date above.
  | { readonly kind: 'astrocartography'; readonly personId: string }
  | { readonly kind: 'shared' }
  // The Documents workspace (#563): PDF export builder and saved charts. App-scoped, no person context.
  | { readonly kind: 'documents' }
  // The PDF export builder (#441): the primary person is picked on the page itself, not the URL,
  // the same reasoning synastry's second person already uses.
  | { readonly kind: 'export-builder' }
  // The Preferences workspace (#506/#510): durable account/device settings in one stable place,
  // per docs/UI-UX_GUIDELINES.md's setting-scope model. `section` links straight to one of its headings.
  | { readonly kind: 'preferences'; readonly section?: PreferencesSection }
  | { readonly kind: 'cycles' }
  | { readonly kind: 'event-search' }
  | { readonly kind: 'eclipses' }
  // `view` is the same Wheel/Aspects/Placements/Patterns & condition axis as the chart route's (#511).
  | { readonly kind: 'horary'; readonly view?: ChartViewKind }
  | { readonly kind: 'electional' }
  | { readonly kind: 'rectification' }
  | { readonly kind: 'admin' }
  | { readonly kind: 'admin-usage' }
  | { readonly kind: 'corpus-overrides' }
  | { readonly kind: 'corpus-candidates' }
  | { readonly kind: 'set-password' }
  | { readonly kind: 'setup' };

const TIMING_TECHNIQUES = {
  timeline: 'timing-timeline',
  profections: 'profections',
  progressions: 'progressions',
  'solar-arc': 'solar-arc',
  'primary-directions': 'primary-directions',
  transits: 'transit',
  forecast: 'periodic-transit',
} as const;
const TIMING_SEGMENT_FOR_KIND = {
  'timing-timeline': 'timeline',
  profections: 'profections',
  progressions: 'progressions',
  'solar-arc': 'solar-arc',
  'primary-directions': 'primary-directions',
  transit: 'transits',
  'periodic-transit': 'forecast',
} as const;
const TOOL_KINDS = ['cycles', 'event-search', 'eclipses', 'horary', 'electional', 'rectification'] as const;
type ToolKind = (typeof TOOL_KINDS)[number];

function isToolKind(value: string | undefined): value is ToolKind {
  return (TOOL_KINDS as readonly (string | undefined)[]).includes(value);
}

/** The route for what follows `#/people/:id/` — undefined for anything that is not canonical. */
function personSubRoute(personId: string, rest: readonly string[], hash: string): Route | undefined {
  const [area, second, third, ...extra] = rest;
  if (extra.length > 0) return undefined;
  if (rest.length === 1) {
    if (area === 'overview') return { kind: 'person-overview', personId };
    if (area === 'consultation') return { kind: 'consultation', personId };
    if (area === 'birth-record') return { kind: 'person', personId };
    if (area === 'interpretation') return { kind: 'report', personId };
    return undefined;
  }
  if (area === 'charts' && isChartType(second) && isChartView(third)) {
    const compareParam = new URLSearchParams(hash.split('?')[1] ?? '').get('compare');
    const compare = isChartType(compareParam) ? compareParam : undefined;
    return {
      kind: 'chart',
      personId,
      chartType: second,
      view: third,
      ...(compare === undefined ? {} : { compareType: compare }),
    };
  }
  if (rest.length !== 2) return undefined;
  if (area === 'timing' && second !== undefined && second in TIMING_TECHNIQUES) {
    return { kind: TIMING_TECHNIQUES[second as keyof typeof TIMING_TECHNIQUES], personId };
  }
  if (area === 'relationships' && second === 'synastry') return { kind: 'synastry', personId };
  if (area === 'relationships' && second === 'composite') {
    const view = chartViewFromHash(hash);
    return { kind: 'composite', personId, ...(view === undefined ? {} : { view }) };
  }
  if (area === 'location' && second === 'astrocartography') return { kind: 'astrocartography', personId };
  return undefined;
}

export function parseRoute(hash: string): Route {
  // Matching is on the path part alone; a query string (e.g. #/set-password?token=...) is read
  // separately by the screen that needs it. Trailing slashes are tolerated because people
  // hand-edit these URLs and a bare '#' is what a browser leaves behind after an anchor click.
  const path = (hash.split('?')[0] ?? '').replace(/\/+$/, '');

  switch (path) {
    case '#/about':
      return { kind: 'about' };
    case '#/changelog':
      return { kind: 'changelog' };
    case '#/people':
      return { kind: 'people' };
    // #65: a chart shared by link — everything it needs is in the query, not the store.
    case '#/shared':
      return { kind: 'shared' };
    // #441: the PDF export builder — needs the store (to list people) but not person-scoped.
    case '#/documents/pdf':
      return { kind: 'export-builder' };
    // #563: the Documents workspace — PDF builder and saved charts, app-scoped.
    case '#/documents':
      return { kind: 'documents' };
    // #506/#510: the Preferences workspace — needs the store (full-data export lists people)
    // but not person-scoped.
    case '#/preferences':
      return { kind: 'preferences' };
    case '#/admin':
      return { kind: 'admin' };
    case '#/admin/usage':
      return { kind: 'admin-usage' };
    case '#/admin/corpus-overrides':
      return { kind: 'corpus-overrides' };
    case '#/admin/corpus-candidates':
      return { kind: 'corpus-candidates' };
    // The one-time token lives in the query (#135) — read directly off `location.hash`
    // by the screen itself, rather than here.
    case '#/set-password':
      return { kind: 'set-password' };
    // The one-time admin-bootstrap token (`server/auth/bootstrap.ts`) lives in the query,
    // same convention as #/set-password — read directly off `location.hash` by the screen
    // itself, not here.
    case '#/setup':
      return { kind: 'setup' };
    default:
      break;
  }

  const segments = path.split('/');
  // ['#', 'explore', tool]
  if (segments[1] === 'explore' && segments.length === 3) {
    const tool = segments[2];
    if (!isToolKind(tool)) return { kind: 'home' };
    if (tool === 'horary') {
      const view = chartViewFromHash(hash);
      return { kind: 'horary', ...(view === undefined ? {} : { view }) };
    }
    return { kind: tool };
  }
  if (segments[1] === 'preferences' && segments.length === 3) {
    const section = segments[2];
    return isPreferencesSection(section) ? { kind: 'preferences', section } : { kind: 'home' };
  }
  // Validated as one of our ids, not merely as "some characters after the slash". An
  // unparseable id would open the form on a person the store has no records for, which
  // renders as "deleted, restorable from the list" — a lie about a URL that was simply
  // mistyped. Home is the honest answer.
  if (segments[1] === 'people' && segments.length >= 4) {
    const personId = segments[2];
    if (isPersonId(personId)) return personSubRoute(personId, segments.slice(3), hash) ?? { kind: 'home' };
  }

  return { kind: 'home' };
}

/** The canonical hash for a route: the one place any link in the app is written. */
export function routeHref(route: Route): string {
  const person = (id: string, ...tail: string[]): string => `#/people/${id}/${tail.join('/')}`;
  switch (route.kind) {
    case 'home':
      return '#/people';
    case 'about':
      return '#/about';
    case 'changelog':
      return '#/changelog';
    case 'people':
      return '#/people';
    case 'shared':
      return '#/shared';
    case 'documents':
      return '#/documents';
    case 'export-builder':
      return '#/documents/pdf';
    case 'preferences':
      return route.section === undefined ? '#/preferences' : `#/preferences/${route.section}`;
    case 'admin':
      return '#/admin';
    case 'admin-usage':
      return '#/admin/usage';
    case 'corpus-overrides':
      return '#/admin/corpus-overrides';
    case 'corpus-candidates':
      return '#/admin/corpus-candidates';
    case 'set-password':
      return '#/set-password';
    case 'setup':
      return '#/setup';
    case 'person-overview':
      return person(route.personId, 'overview');
    case 'consultation':
      return person(route.personId, 'consultation');
    case 'person':
      return person(route.personId, 'birth-record');
    case 'report':
      return person(route.personId, 'interpretation');
    case 'chart': {
      const base = person(route.personId, 'charts', route.chartType ?? 'natal', route.view ?? 'wheel');
      return route.compareType === undefined ? base : `${base}?compare=${route.compareType}`;
    }
    case 'profections':
    case 'timing-timeline':
    case 'progressions':
    case 'solar-arc':
    case 'primary-directions':
    case 'transit':
    case 'periodic-transit':
      return person(route.personId, 'timing', TIMING_SEGMENT_FOR_KIND[route.kind]);
    case 'synastry':
      return person(route.personId, 'relationships', 'synastry');
    case 'composite': {
      const base = person(route.personId, 'relationships', 'composite');
      return route.view === undefined || route.view === 'wheel' ? base : `${base}?view=${route.view}`;
    }
    case 'astrocartography':
      return person(route.personId, 'location', 'astrocartography');
    case 'cycles':
    case 'event-search':
    case 'eclipses':
    case 'electional':
    case 'rectification':
      return `#/explore/${route.kind}`;
    case 'horary':
      return route.view === undefined || route.view === 'wheel'
        ? '#/explore/horary'
        : `#/explore/horary?view=${route.view}`;
  }
}

/** The hash of a person's chart of `type` (natal when omitted), opened at `view` (the wheel when omitted), optionally in comparison mode with `compareType` (#439). */
export function chartHref(personId: string, view?: ChartViewKind, type?: ChartType, compareType?: ChartType): string {
  return routeHref({
    kind: 'chart',
    personId,
    ...(type === undefined ? {} : { chartType: type }),
    ...(view === undefined ? {} : { view }),
    ...(compareType === undefined ? {} : { compareType }),
  });
}

/** The hash of a person's birth record (Edit birth record). */
export function personHref(personId: string): string {
  return routeHref({ kind: 'person', personId });
}

/** The one-time token embedded in a `#/set-password?token=...` link (#135). `null` if missing. */
export function setPasswordToken(hash: string): string | null {
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return null;
  return new URLSearchParams(hash.slice(queryIndex + 1)).get('token');
}

/** The one-time token embedded in a `#/setup?token=...` link (`server/auth/bootstrap.ts`). `null` if missing. */
export function setupToken(hash: string): string | null {
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return null;
  return new URLSearchParams(hash.slice(queryIndex + 1)).get('token');
}
