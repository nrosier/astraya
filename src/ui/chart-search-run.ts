/**
 * @module ui/chart-search-run
 * @purpose Pure run core for searching stored charts by placement (#1405): builds each live person's search subject with their own calculation settings at an as-of date, evaluates the search, and returns one result per person in people-list order.
 * @conventions No React, store or sweph-wasm access: the caller passes the live people, the default calculation profile and the app's `EphemerisProvider` (the one `EphemerisProviderContext` provides). A person's settings are their own register (read by `readCalculationSettings` in `buildPerson`), else the passed defaults, then `toChartCalculationOptions`; `birthTimeKnown` is `timeAccuracy !== 'unknown'`; only `searchScopes(search)` are computed. Nobody is dropped: a person with an unreadable settings register or an incomplete birth moment comes back as `not-evaluable` with a stated reason, and is never cast from defaults. Subjects are cached by person id, birth moment, settings, as-of date and scope set (the moment is in the key so an edited birth record is never served stale), so a second run that changes only the conditions makes no provider call; the as-of Julian day is cached by date. After a successful run the cache keeps only the entries that run used. A genuine engine error rejects the run (the caller shows the `error` state); an invalid search is a caller bug and throws `RangeError`.
 * @exports ChartSearchRunState, PersonRunBlockedReason, PersonRunResult, ChartSearchRunDefaults, ChartSearchRunInput, SubjectCache, createSubjectCache, parseAsOfDate, runChartSearch
 */
import type { RulershipChoice } from '../astrology/rulership.js';
import { toChartCalculationOptions, type ExtendedSettings } from '../chart/extended-settings.js';
import {
  evaluateSearch,
  searchScopes,
  validateSearch,
  type ChartSearch,
  type PersonSearchResult,
  type SearchSubject,
} from '../domain/chart-search.js';
import { asOfJulianDay, buildSearchSubject, type SearchTimingSettings } from '../domain/chart-search-timing.js';
import type { Person } from '../domain/person.js';
import type { EphemerisProvider, JulianDayUT } from '../ephemeris/types.js';
import { ordered } from './people-list.js';

/** Why a person could not be searched at all, before any condition was read. */
export type PersonRunBlockedReason =
  /** The person has a calculation-settings or rulership register this build cannot read. */
  | 'settings-unreadable'
  /** The stored birth date/time or coordinates are missing or unreadable, so no chart can be cast. */
  | 'birth-data-incomplete';

/** One person's line in the results, in people-list order. */
export type PersonRunResult =
  | {
      readonly kind: 'evaluated';
      readonly personId: string;
      readonly displayName: string;
      readonly result: PersonSearchResult;
    }
  | {
      /** Not evaluable for the whole search: shown with its reason, never left out. */
      readonly kind: 'not-evaluable';
      readonly personId: string;
      readonly displayName: string;
      readonly reason: PersonRunBlockedReason;
    };

/** What a search screen shows: nothing run yet, a run in flight, its results, or why it failed. */
export type ChartSearchRunState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'done'; readonly results: readonly PersonRunResult[] }
  | { readonly status: 'error'; readonly message: string };

/** What a person without their own registers is calculated with (the default profile, else the app defaults). */
export interface ChartSearchRunDefaults {
  readonly settings: ExtendedSettings;
  readonly rulership: RulershipChoice;
}

export interface ChartSearchRunInput {
  readonly search: ChartSearch;
  /** The live people (`State.people`); deleted people are not in it. */
  readonly people: ReadonlyMap<string, Person>;
  /** The as-of calendar date, `yyyy-mm-dd` (as `todayInputValue` returns). */
  readonly asOf: string;
  readonly defaults: ChartSearchRunDefaults;
}

/** Computed subjects and as-of Julian days kept between runs. Create one per search screen. */
export interface SubjectCache {
  readonly subjects: Map<string, SearchSubject>;
  readonly asOfDays: Map<string, JulianDayUT>;
}

export function createSubjectCache(): SubjectCache {
  return { subjects: new Map(), asOfDays: new Map() };
}

/** Parses a `yyyy-mm-dd` as-of date, or throws `RangeError`. */
export function parseAsOfDate(asOf: string): { readonly year: number; readonly month: number; readonly day: number } {
  const match = /^(-?\d{1,6})-(\d{2})-(\d{2})$/.exec(asOf);
  if (match === null) throw new RangeError(`invalid as-of date: ${asOf}`);
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new RangeError(`invalid as-of date: ${asOf}`);
  return { year, month, day };
}

async function asOfDayFor(asOf: string, provider: EphemerisProvider, cache: SubjectCache): Promise<JulianDayUT> {
  const cached = cache.asOfDays.get(asOf);
  if (cached !== undefined) return cached;
  const { year, month, day } = parseAsOfDate(asOf);
  const jd = await asOfJulianDay(provider, year, month, day);
  cache.asOfDays.set(asOf, jd);
  return jd;
}

/** The person's own settings and rulers as compute options, or `undefined` when their registers are unreadable. */
function settingsFor(person: Person, defaults: ChartSearchRunDefaults): SearchTimingSettings | undefined {
  if (person.calculationSettingsUnreadable === true) return undefined;
  return {
    ...toChartCalculationOptions(person.calculationSettings ?? defaults.settings),
    rulership: person.rulership ?? defaults.rulership,
  };
}

/**
 * Runs `search` over every live person. Resolves to one result per person in people-list order; rejects on a
 * genuine engine error, and throws `RangeError` for a search `validateSearch` rejects or a malformed as-of date.
 */
export async function runChartSearch(
  input: ChartSearchRunInput,
  provider: EphemerisProvider,
  cache: SubjectCache,
): Promise<readonly PersonRunResult[]> {
  const { search, asOf, defaults } = input;
  const invalid = validateSearch(search);
  if (invalid !== undefined) throw new RangeError(`invalid chart search: ${invalid}`);
  const scopes = searchScopes(search);
  const used = new Set<string>();
  const results: PersonRunResult[] = [];

  for (const person of ordered(input.people)) {
    const { id: personId, displayName, moment } = person;
    const settings = settingsFor(person, defaults);
    if (settings === undefined) {
      results.push({ kind: 'not-evaluable', personId, displayName, reason: 'settings-unreadable' });
      continue;
    }
    if (moment === undefined) {
      results.push({ kind: 'not-evaluable', personId, displayName, reason: 'birth-data-incomplete' });
      continue;
    }
    const birthTimeKnown = person.timeAccuracy !== 'unknown';
    const key = JSON.stringify([personId, moment, birthTimeKnown, settings, asOf, scopes]);
    used.add(key);
    let subject = cache.subjects.get(key);
    if (subject === undefined) {
      const asOfJd = await asOfDayFor(asOf, provider, cache);
      subject = await buildSearchSubject({ natalMoment: moment, birthTimeKnown, settings, asOfJd, scopes }, provider);
      cache.subjects.set(key, subject);
    }
    results.push({ kind: 'evaluated', personId, displayName, result: evaluateSearch(search, subject) });
  }

  // Bounded: only what this run read survives, so changing the date or scopes does not grow the cache without end.
  for (const key of [...cache.subjects.keys()]) if (!used.has(key)) cache.subjects.delete(key);
  for (const date of [...cache.asOfDays.keys()]) if (date !== asOf) cache.asOfDays.delete(date);
  return results;
}
