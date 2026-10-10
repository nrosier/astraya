/**
 * Pure logic for the persistent per-person tab bar (#234). Kept separate from `PersonNav.tsx`
 * so the active-tab/gating logic can be tested without a DOM, the same convention `route.ts`
 * follows for route parsing.
 */
/**
 * @module ui/person-nav
 * @purpose Pure logic for the persistent per-person tab bar (#234/#398): the fixed tab list, which tabs group into families (Transits & Forecast, Progressions & Directions, Relationship Charts), and which tab/family is active for a given route.
 * @conventions Kept separate from PersonNav.tsx so active-tab/gating logic is testable without a DOM, following route.ts's own convention; tab labels are translated and live in PersonNav.messages.ts since this module has no access to the current locale.
 * @exports PersonTabKey, PersonTab, PERSON_TABS, PersonTabFamilyKey, PersonTabFamily, PERSON_TAB_FAMILIES, familyForTab, activeTabKey, isTabEnabled
 */
import type { Route } from './route.js';

export type PersonTabKey =
  | 'overview'
  | 'birth-record'
  | 'chart'
  | 'report'
  | 'profections'
  | 'progressions'
  | 'solar-arc'
  | 'primary-directions'
  | 'transit'
  | 'synastry'
  | 'composite'
  | 'periodic-transit'
  | 'astrocartography';

export interface PersonTab {
  readonly key: PersonTabKey;
  readonly buildHref: (personId: string) => string;
}

// Same order and hrefs as the middot chain this replaces (previously in PersonForm.tsx).
// Labels are translated, so they live in `PersonNav.messages.ts`, looked up by `key`,
// rather than here — this module has no access to the current locale.
export const PERSON_TABS: readonly PersonTab[] = [
  // The canonical Overview destination (#506/#509): a complete person's landing tab. Still
  // reachable before every other tab, same as birth-record, since both are the two places a
  // person can land regardless of completeness (activeTabKey/isTabEnabled below).
  { key: 'overview', buildHref: (id) => `#/people/${id}/overview` },
  { key: 'birth-record', buildHref: (id) => `#/person/${id}` },
  { key: 'chart', buildHref: (id) => `#/chart/${id}` },
  { key: 'report', buildHref: (id) => `#/report/${id}` },
  { key: 'profections', buildHref: (id) => `#/profections/${id}` },
  { key: 'progressions', buildHref: (id) => `#/progressions/${id}` },
  { key: 'solar-arc', buildHref: (id) => `#/solar-arc/${id}` },
  { key: 'primary-directions', buildHref: (id) => `#/primary-directions/${id}` },
  { key: 'transit', buildHref: (id) => `#/transit/${id}` },
  { key: 'synastry', buildHref: (id) => `#/synastry/${id}` },
  { key: 'composite', buildHref: (id) => `#/composite/${id}` },
  { key: 'periodic-transit', buildHref: (id) => `#/periodic-transit/${id}` },
  { key: 'astrocartography', buildHref: (id) => `#/astrocartography/${id}` },
];

/**
 * Groups the tabs beyond the three fixed ones (`birth-record`/`chart`/`report`) and the
 * standalone `astrocartography` into astrologically-sensible families with subtabs (#398), so the
 * top-level bar doesn't keep growing linearly as more techniques get wired in. Grouping and
 * reasoning: a real astrologer's own navigation habits, not engineering convenience —
 * "Transits & Forecast" is "what is the real sky doing against this chart"; "Progressions &
 * Directions" is "advance the chart by its own symbolic rule"; "Relationship Charts" is "how do
 * two people's charts interact". The charts cast for one person alone (natal, draconic, harmonic, returns) are one
 * page, the Charts page, with the type picked there, so they need no family here.
 * `astrocartography` is deliberately NOT in any family — it's spatial, not a different lens on
 * the same chart data, with its own distinct vocabulary and practitioner audience.
 */
export type PersonTabFamilyKey = 'transits-forecast' | 'progressions-directions' | 'relationship-charts';

export interface PersonTabFamily {
  readonly key: PersonTabFamilyKey;
  readonly members: readonly PersonTabKey[];
}

// Order within a family is the order subtabs render in. A planetary-return picker still slots
// into the Transits & Forecast family once built, as a section inside the existing
// periodic-transit screen rather than a new member here.
export const PERSON_TAB_FAMILIES: readonly PersonTabFamily[] = [
  { key: 'transits-forecast', members: ['transit', 'periodic-transit'] },
  { key: 'progressions-directions', members: ['profections', 'progressions', 'solar-arc', 'primary-directions'] },
  { key: 'relationship-charts', members: ['synastry', 'composite'] },
];

/** Which family (if any) a tab belongs to — `undefined` for the three fixed tabs and `astrocartography`. */
export function familyForTab(key: PersonTabKey): PersonTabFamilyKey | undefined {
  return PERSON_TAB_FAMILIES.find((family) => family.members.includes(key))?.key;
}

/** Which tab a parsed route corresponds to, or `null` for a route with no tab (e.g. `home`, `about`). */
export function activeTabKey(route: Route): PersonTabKey | null {
  switch (route.kind) {
    case 'person-overview':
      return 'overview';
    case 'person':
      return 'birth-record';
    case 'chart':
    case 'report':
    case 'profections':
    case 'progressions':
    case 'solar-arc':
    case 'primary-directions':
    case 'transit':
    case 'synastry':
    case 'composite':
    case 'periodic-transit':
    case 'astrocartography':
      return route.kind;
    default:
      return null;
  }
}

/** Every tab but Overview and Birth record requires a completed, stored birth moment (same gate `PersonForm` used). */
export function isTabEnabled(key: PersonTabKey, hasBirthMoment: boolean): boolean {
  return key === 'overview' || key === 'birth-record' || hasBirthMoment;
}
