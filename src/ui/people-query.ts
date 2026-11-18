/**
 * @module ui/people-query
 * @purpose Pure filters for the one people list (#1731): a quick name-and-place filter, and the grouping of a chart-query run into matches and a could-not-be-evaluated group over the same list.
 * @conventions Nobody is dropped: a person the run could not evaluate is kept in the not-evaluable group with each reason they have, in the people-list order. The quick filter is case- and accent-insensitive, and blank text keeps everyone. Reuses `resultsSummary` for the grouping rules rather than repeating them.
 * @exports quickFilterPeople, applyChartQuery, QueryNotEvaluable, QueryResult
 */
import type { NotEvaluableReason } from '../domain/chart-search.js';
import type { Person } from '../domain/person.js';
import type { PersonRunBlockedReason, PersonRunResult } from './chart-search-run.js';
import { resultsSummary, type ResultsGroups } from './chart-search-summary.js';

/** Case- and accent-insensitive form: NFD with combining marks removed, then lower case. */
function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Keeps the people whose name or place contains the text. Blank text keeps everyone, in the
 * order given.
 */
export function quickFilterPeople(people: readonly Person[], text: string): readonly Person[] {
  if (text.trim() === '') return people;
  const needle = foldText(text);
  return people.filter(
    (person) => foldText(person.displayName).includes(needle) || foldText(person.placeLabel).includes(needle),
  );
}

/** A person the query could not evaluate, with each reason they have (a whole-person block has one). */
export interface QueryNotEvaluable {
  readonly person: Person;
  readonly reasons: readonly (NotEvaluableReason | PersonRunBlockedReason)[];
}

/** The people a chart-query run leaves in the list: matches first, then the not-evaluable group. */
export interface QueryResult {
  readonly matches: readonly Person[];
  readonly notEvaluable: readonly QueryNotEvaluable[];
}

function reasonsOf(entry: PersonRunResult): readonly (NotEvaluableReason | PersonRunBlockedReason)[] {
  return entry.kind === 'not-evaluable' ? [entry.reason] : entry.result.notEvaluableReasons;
}

/**
 * Groups a run's results over the people list. Matches keep the list order; so does the
 * not-evaluable group. A person who does not match is in neither group.
 */
export function applyChartQuery(people: readonly Person[], results: readonly PersonRunResult[]): QueryResult {
  const groups: ResultsGroups = resultsSummary(results);
  const matchIds = new Set(groups.matches.map((entry) => entry.personId));
  const blocked = new Map(groups.notEvaluable.map((entry) => [entry.personId, reasonsOf(entry)] as const));

  const matches: Person[] = [];
  const notEvaluable: QueryNotEvaluable[] = [];
  for (const person of people) {
    if (matchIds.has(person.id)) matches.push(person);
    else {
      const reasons = blocked.get(person.id);
      if (reasons !== undefined) notEvaluable.push({ person, reasons });
    }
  }
  return { matches, notEvaluable };
}
