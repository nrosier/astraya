/**
 * @module ui/chart-search-summary
 * @purpose Splits a chart-search run into matches and the could-not-be-evaluated group (#1405, #1731), as pure logic shared by the results view and the people-list query.
 * @conventions Pure: type-only imports, no storage, no React, no DOM, so it loads without side effects. People who simply do not match are in neither group. Behaviour is identical to the rules the results view has always shown.
 * @exports ResultsGroups, resultsSummary
 */
import type { PersonRunResult } from './chart-search-run.js';

export interface ResultsGroups {
  readonly matches: readonly Extract<PersonRunResult, { kind: 'evaluated' }>[];
  readonly notEvaluable: readonly PersonRunResult[];
}

/** Splits results into matches and the not-evaluable group; people who do not match fall in neither. */
export function resultsSummary(results: readonly PersonRunResult[]): ResultsGroups {
  const matches: Extract<PersonRunResult, { kind: 'evaluated' }>[] = [];
  const notEvaluable: PersonRunResult[] = [];
  for (const entry of results) {
    if (entry.kind === 'not-evaluable' || entry.result.outcome === 'not-evaluable') notEvaluable.push(entry);
    else if (entry.result.outcome === 'matched') matches.push(entry);
  }
  return { matches, notEvaluable };
}
