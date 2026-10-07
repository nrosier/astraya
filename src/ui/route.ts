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
 */
/**
 * @module ui/route
 * @purpose Pure hash-route parsing and construction for every screen in the app, including legacy route aliases (harmonic/draconic) and one-time-token query extraction (set-password, setup).
 * @conventions Pure and separate from components so it is tested without a DOM; uses hash routing rather than history routing since the built app is static files with no server rewrite rule; validates ids via domain/id.js's isPersonId rather than accepting any string.
 * @exports Route, parseRoute, setPasswordToken, setupToken
 */
import { isPersonId } from '../domain/id.js';
import { chartSectionFromHash, chartTypeFromHash, type ChartSection, type ChartType } from './chart-sections.js';

export type Route =
  | { readonly kind: 'home' }
  | { readonly kind: 'about' }
  | { readonly kind: 'changelog' }
  | { readonly kind: 'people' }
  | { readonly kind: 'person'; readonly personId: string }
  // The Charts page: one route for every chart cast for one person. `chartType` is the kind of chart
  // (`?type=draconic`; absent means natal) and `section` its open section (`?section=shape`; absent
  // means the wheel). The old `#/draconic/<id>` and `#/harmonic/<id>` links land here too.
  | {
      readonly kind: 'chart';
      readonly personId: string;
      readonly chartType?: ChartType;
      readonly section?: ChartSection;
    }
  // The written report (#271) — previously reached as `#/chart/:id?tab=report`, a query
  // modifier on the chart route rather than a route of its own like every sibling here.
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
  | { readonly kind: 'transit'; readonly personId: string }
  // The second person is picked from within the screen, not the URL (#172) — every other
  // multi-word route here names exactly one person, and a synastry pairing changes far more
  // often within one visit (trying several comparisons) than it's worth sharing as a link.
  | { readonly kind: 'synastry'; readonly personId: string }
  // Same reasoning as synastry (#169): the second person is picked in-screen, not the URL.
  | { readonly kind: 'composite'; readonly personId: string }
  // Daily/weekly/monthly/yearly transit forecast (#207). No second parameter to pick — the
  // screen's own "as of" date input plays the role a harmonic number or comparison person
  // plays elsewhere, and that's already excluded from the URL for the same reasons those are.
  | { readonly kind: 'periodic-transit'; readonly personId: string }
  // Astrocartography/Local Space map (#171). No second parameter: line types, body picker,
  // Local Space toggle and relocation place are all picked in-screen, same reasoning as
  // periodic-transit's "as of" date above.
  | { readonly kind: 'astrocartography'; readonly personId: string }
  | { readonly kind: 'shared' }
  // The PDF export builder (#441): the primary person is picked on the page itself, not the URL,
  // the same reasoning synastry's second person already uses.
  | { readonly kind: 'export-builder' }
  | { readonly kind: 'cycles' }
  | { readonly kind: 'eclipses' }
  | { readonly kind: 'horary' }
  | { readonly kind: 'electional' }
  | { readonly kind: 'rectification' }
  | { readonly kind: 'admin' }
  | { readonly kind: 'admin-usage' }
  | { readonly kind: 'corpus-overrides' }
  | { readonly kind: 'corpus-candidates' }
  | { readonly kind: 'set-password' }
  | { readonly kind: 'setup' };

const PERSON_PATH = /^#\/person\/(.+)$/;
const CHART_PATH = /^#\/chart\/(.+)$/;
const REPORT_PATH = /^#\/report\/(.+)$/;
const PROFECTIONS_PATH = /^#\/profections\/(.+)$/;
const PROGRESSIONS_PATH = /^#\/progressions\/(.+)$/;
const SOLAR_ARC_PATH = /^#\/solar-arc\/(.+)$/;
const TRANSIT_PATH = /^#\/transit\/(.+)$/;
const SYNASTRY_PATH = /^#\/synastry\/(.+)$/;
const COMPOSITE_PATH = /^#\/composite\/(.+)$/;
// Before the Charts page, harmonic and draconic charts had routes of their own; links to them still work.
const HARMONIC_PATH = /^#\/harmonic\/(.+)$/;
const DRACONIC_PATH = /^#\/draconic\/(.+)$/;
const PERIODIC_TRANSIT_PATH = /^#\/periodic-transit\/(.+)$/;
const ASTROCARTOGRAPHY_PATH = /^#\/astrocartography\/(.+)$/;

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
    case '#/export':
      return { kind: 'export-builder' };
    // #410: planetary cycles — ephemeris only, no person, no stored data.
    case '#/cycles':
      return { kind: 'cycles' };
    // #404: eclipses — needs the ephemeris and, optionally, a stored person to compare against.
    case '#/eclipses':
      return { kind: 'eclipses' };
    // #406: a chart cast for the moment a question was asked — ephemeris only, no person.
    case '#/horary':
      return { kind: 'horary' };
    // #409: a search for the best times to begin something — ephemeris only, no person.
    case '#/electional':
      return { kind: 'electional' };
    // #408: test candidate birth times against dated life events — needs the ephemeris and, optionally, a stored person to pre-fill from.
    case '#/rectification':
      return { kind: 'rectification' };
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

  // Validated as one of our ids, not merely as "some characters after the slash". An
  // unparseable id would open the form on a person the store has no records for, which
  // renders as "deleted, restorable from the list" — a lie about a URL that was simply
  // mistyped. Home is the honest answer.
  const person = PERSON_PATH.exec(path);
  if (person !== null && isPersonId(person[1])) return { kind: 'person', personId: person[1] };

  const chart = CHART_PATH.exec(path);
  if (chart !== null && isPersonId(chart[1])) {
    const chartType = chartTypeFromHash(hash);
    const section = chartSectionFromHash(hash);
    return {
      kind: 'chart',
      personId: chart[1],
      ...(chartType === undefined ? {} : { chartType }),
      ...(section === undefined ? {} : { section }),
    };
  }

  const report = REPORT_PATH.exec(path);
  if (report !== null && isPersonId(report[1])) return { kind: 'report', personId: report[1] };

  const profections = PROFECTIONS_PATH.exec(path);
  if (profections !== null && isPersonId(profections[1])) return { kind: 'profections', personId: profections[1] };

  const progressions = PROGRESSIONS_PATH.exec(path);
  if (progressions !== null && isPersonId(progressions[1])) return { kind: 'progressions', personId: progressions[1] };

  const solarArc = SOLAR_ARC_PATH.exec(path);
  if (solarArc !== null && isPersonId(solarArc[1])) return { kind: 'solar-arc', personId: solarArc[1] };

  const transit = TRANSIT_PATH.exec(path);
  if (transit !== null && isPersonId(transit[1])) return { kind: 'transit', personId: transit[1] };

  const synastry = SYNASTRY_PATH.exec(path);
  if (synastry !== null && isPersonId(synastry[1])) return { kind: 'synastry', personId: synastry[1] };

  const composite = COMPOSITE_PATH.exec(path);
  if (composite !== null && isPersonId(composite[1])) return { kind: 'composite', personId: composite[1] };

  const harmonic = HARMONIC_PATH.exec(path);
  if (harmonic !== null && isPersonId(harmonic[1])) {
    return { kind: 'chart', personId: harmonic[1], chartType: 'harmonic' };
  }

  const draconic = DRACONIC_PATH.exec(path);
  if (draconic !== null && isPersonId(draconic[1])) {
    return { kind: 'chart', personId: draconic[1], chartType: 'draconic' };
  }

  const periodicTransit = PERIODIC_TRANSIT_PATH.exec(path);
  if (periodicTransit !== null && isPersonId(periodicTransit[1])) {
    return { kind: 'periodic-transit', personId: periodicTransit[1] };
  }

  const astrocartography = ASTROCARTOGRAPHY_PATH.exec(path);
  if (astrocartography !== null && isPersonId(astrocartography[1])) {
    return { kind: 'astrocartography', personId: astrocartography[1] };
  }

  return { kind: 'home' };
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
