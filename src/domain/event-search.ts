/**
 * Batch ephemeris/research tool (#562): scan a date range for sky events — planetary stations,
 * sign ingresses, and lunations (New/Full Moon) — and get back one navigable, chronologically
 * sorted list, exportable as a reproducible CSV (the exact search parameters used are written
 * into the file itself, per the issue's own acceptance criterion, so a result set can be
 * regenerated later without having to remember what was searched).
 *
 * Deliberately scoped to moment-only "sky events" — events that don't depend on any natal
 * chart. Exact-transit-to-natal-aspect scanning (`astrology/transit-events.ts`'s own
 * `findExactTransitAspects`) is NOT included here: that already has its own dedicated feature
 * (the periodic-transit forecast screen), needs a natal chart as an extra input this module's
 * callers may not have, and would make "the exact search parameters" (this module's whole
 * reproducibility point) include an entire chart rather than a date range and a few flags.
 */
/**
 * @module domain/event-search
 * @purpose Batch-searches a date range for station/sign-ingress/lunation sky events and formats the results (plus the exact search parameters) as a reproducible CSV.
 * @conventions Composes three existing finders (astrology/stations.ts, astrology/sign-ingress.ts, astrology/lunations.ts) into one chronologically sorted result list; deliberately excludes natal-chart-dependent exact-transit-aspect scanning (see the module's own header for why); CSV rows carry the exact search parameters as leading `#`-prefixed comment lines, not just the results.
 * @exports EventSearchKind, EventSearchFilter, EventSearchResult, searchEvents, eventSearchToCsv, eventSearchCsvFilename
 */
import { BODIES, bodyById } from '../astrology/bodies.js';
import { findLunations } from '../astrology/lunations.js';
import { findSignIngresses } from '../astrology/sign-ingress.js';
import { findStations } from '../astrology/stations.js';
import { SIGNS } from '../astrology/signs.js';
import { civilFromJulianDay } from '../time/julian.js';
import type { BodyId, EphemerisProvider, JulianDayUT, Zodiac } from '../ephemeris/types.js';

/** Every body `stations.ts` itself documents as able to station (the eight 'planet'-category bodies, Mercury through Pluto) — stations.ts has no exported default of its own, so this is the one place a caller omitting `stationBodies` falls back to. */
const DEFAULT_STATION_BODIES: readonly BodyId[] = BODIES.filter((body) => body.category === 'planet').map(
  (body) => body.id,
);

export type EventSearchKind = 'station' | 'ingress' | 'lunation';

export interface EventSearchFilter {
  readonly kinds: readonly EventSearchKind[];
  /** Bodies to search for stations on; defaults to findStations' own eight planet-category bodies when omitted. */
  readonly stationBodies?: readonly BodyId[];
  /** Bodies to search for sign ingresses on — unlike stations, there is no sensible universal default (every body ingresses; searching all of them by default would bury the common case, the Sun's own ingresses, in noise), so this is required whenever `'ingress'` is in `kinds`. */
  readonly ingressBodies?: readonly BodyId[];
  readonly zodiac?: Zodiac;
  readonly stepDays?: number;
}

export interface EventSearchResult {
  readonly kind: EventSearchKind;
  readonly jd: JulianDayUT;
  readonly bodyKey?: string;
  readonly label: string;
}

function stationLabel(bodyKey: string, direction: 'retrograde' | 'direct'): string {
  return `${bodyKey} turns ${direction}`;
}

function ingressLabel(bodyKey: string, sign: number, retrograde: boolean): string {
  const signName = SIGNS[sign]?.name ?? String(sign);
  return retrograde ? `${bodyKey} re-enters ${signName} (retrograde)` : `${bodyKey} enters ${signName}`;
}

function lunationLabel(kind: 'new' | 'full'): string {
  return kind === 'new' ? 'New Moon' : 'Full Moon';
}

/** Runs every search `filter.kinds` names, over `[fromJd, toJd]`, and returns one chronologically sorted result list. */
export async function searchEvents(
  fromJd: JulianDayUT,
  toJd: JulianDayUT,
  provider: EphemerisProvider,
  filter: EventSearchFilter,
): Promise<readonly EventSearchResult[]> {
  const results: EventSearchResult[] = [];

  if (filter.kinds.includes('station')) {
    const stations = await findStations(provider, filter.stationBodies ?? DEFAULT_STATION_BODIES, fromJd, toJd, {
      ...(filter.zodiac === undefined ? {} : { zodiac: filter.zodiac }),
      ...(filter.stepDays === undefined ? {} : { sampleStepDays: filter.stepDays }),
    });
    for (const station of stations) {
      const bodyKey = bodyById(station.body)?.key ?? String(station.body);
      results.push({ kind: 'station', jd: station.jd, bodyKey, label: stationLabel(bodyKey, station.direction) });
    }
  }

  if (filter.kinds.includes('ingress')) {
    for (const body of filter.ingressBodies ?? []) {
      const ingresses = await findSignIngresses(body, fromJd, toJd, provider, filter.zodiac, filter.stepDays);
      const bodyKey = bodyById(body)?.key ?? String(body);
      for (const ingress of ingresses) {
        results.push({
          kind: 'ingress',
          jd: ingress.jd,
          bodyKey,
          label: ingressLabel(bodyKey, ingress.sign, ingress.retrograde),
        });
      }
    }
  }

  if (filter.kinds.includes('lunation')) {
    const lunations = await findLunations(fromJd, toJd, provider, filter.zodiac, filter.stepDays);
    for (const lunation of lunations) {
      results.push({ kind: 'lunation', jd: lunation.jd, label: lunationLabel(lunation.kind) });
    }
  }

  return results.slice().sort((a, b) => a.jd - b.jd);
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function isoFromJd(jd: JulianDayUT): string {
  const civil = civilFromJulianDay(jd);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(civil.year).padStart(4, '0')}-${pad(civil.month)}-${pad(civil.day)}T${pad(civil.hour)}:${pad(civil.minute)}:${pad(civil.second)}Z`;
}

/**
 * The results as a CSV, with the exact search parameters that produced them as leading
 * `#`-prefixed comment lines (ignored by any CSV reader, visible to a human) — regenerating
 * the same search later only needs this one file.
 */
export function eventSearchToCsv(
  fromJd: JulianDayUT,
  toJd: JulianDayUT,
  filter: EventSearchFilter,
  results: readonly EventSearchResult[],
): string {
  const parameterLines = [
    `# Astraya event search`,
    `# from: ${isoFromJd(fromJd)}`,
    `# to: ${isoFromJd(toJd)}`,
    `# kinds: ${filter.kinds.join(', ')}`,
    `# stationBodies: ${(filter.stationBodies ?? []).map((id) => bodyById(id)?.key ?? String(id)).join(', ') || '(default)'}`,
    `# ingressBodies: ${(filter.ingressBodies ?? []).map((id) => bodyById(id)?.key ?? String(id)).join(', ') || '(none)'}`,
    `# zodiac: ${filter.zodiac === undefined ? 'tropical' : JSON.stringify(filter.zodiac)}`,
    `# stepDays: ${String(filter.stepDays ?? '(default)')}`,
  ];
  const header = ['date', 'kind', 'body', 'event'];
  const rows = results.map((result) =>
    [isoFromJd(result.jd), result.kind, result.bodyKey ?? '', result.label].map(csvField).join(','),
  );
  return [...parameterLines, header.join(','), ...rows].join('\n');
}

export function eventSearchCsvFilename(now: Date): string {
  return `astraya-event-search-${now.toISOString().slice(0, 10)}.csv`;
}
