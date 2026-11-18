/**
 * Tests for the pure people filters (#1731): the quick name-and-place filter and the grouping of
 * a chart-query run over the one people list.
 *
 * The rule under test is that nobody is dropped silently: a person the run could not evaluate
 * stays in the list, in their own group, with each reason they have.
 */
import { describe, expect, it } from 'vitest';
import { applyChartQuery, quickFilterPeople } from '../src/ui/people-query.js';
import type { PersonRunResult } from '../src/ui/chart-search-run.js';
import type { PersonSearchResult } from '../src/domain/chart-search.js';
import type { Person } from '../src/domain/person.js';

function person(id: string, displayName: string, placeLabel = ''): Person {
  return { id, displayName, placeLabel, timeAccuracy: 'recorded', notes: '', missing: [] };
}

const evaluated = (personId: string, outcome: PersonSearchResult['outcome']): PersonRunResult => ({
  kind: 'evaluated',
  personId,
  displayName: personId,
  result: { outcome, matchedConditions: [], results: [], notEvaluableReasons: [] },
});

const notEvaluableResult = (personId: string): PersonRunResult => ({
  kind: 'evaluated',
  personId,
  displayName: personId,
  result: {
    outcome: 'not-evaluable',
    matchedConditions: [],
    results: [],
    notEvaluableReasons: ['birth-time-unknown'],
  },
});

const blocked = (personId: string): PersonRunResult => ({
  kind: 'not-evaluable',
  personId,
  displayName: personId,
  reason: 'birth-data-incomplete',
});

describe('quick filter', () => {
  const people = [
    person('p-1', 'Albert Einstein', 'Ulm, Germany'),
    person('p-2', 'Marie Curie', 'Warsaw, Poland'),
    person('p-3', 'Ada Lovelace', 'London, England'),
  ];

  it('matches on the name', () => {
    expect(quickFilterPeople(people, 'curie').map((p) => p.id)).toEqual(['p-2']);
  });

  it('matches on the place', () => {
    expect(quickFilterPeople(people, 'london').map((p) => p.id)).toEqual(['p-3']);
  });

  it('is case-insensitive', () => {
    expect(quickFilterPeople(people, 'EINSTEIN').map((p) => p.id)).toEqual(['p-1']);
  });

  it('ignores accents on both sides', () => {
    const zurich = [person('p-z', 'Hans', 'Zürich, Switzerland')];
    expect(quickFilterPeople(zurich, 'zurich')).toEqual(zurich);
    expect(quickFilterPeople(people, 'Múnich')).toEqual([]);
  });

  it('keeps everyone, in order, for blank text', () => {
    expect(quickFilterPeople(people, '')).toEqual(people);
    expect(quickFilterPeople(people, '   ')).toEqual(people);
  });

  it('keeps nobody when nothing matches', () => {
    expect(quickFilterPeople(people, 'nowhere')).toEqual([]);
  });
});

describe('chart query grouping', () => {
  const people = [
    person('p-a', 'Ada'),
    person('p-b', 'Barbara'),
    person('p-c', 'Charles'),
    person('p-d', 'Dora'),
    person('p-e', 'Edsger'),
  ];

  it('lists matches in list order', () => {
    const results = [evaluated('p-e', 'matched'), evaluated('p-a', 'matched')];
    const grouped = applyChartQuery(people, results);
    expect(grouped.matches.map((p) => p.id)).toEqual(['p-a', 'p-e']);
  });

  it('lists a not-evaluable person in their own group with the reasons', () => {
    const grouped = applyChartQuery(people, [notEvaluableResult('p-b'), evaluated('p-a', 'matched')]);
    expect(grouped.matches.map((p) => p.id)).toEqual(['p-a']);
    expect(grouped.notEvaluable).toEqual([{ person: people[1], reasons: ['birth-time-unknown'] }]);
  });

  it('keeps a blocked person with their blocked reason', () => {
    const grouped = applyChartQuery(people, [blocked('p-d')]);
    expect(grouped.matches).toEqual([]);
    expect(grouped.notEvaluable).toEqual([{ person: people[3], reasons: ['birth-data-incomplete'] }]);
  });

  it('keeps a person who does not match in neither group', () => {
    const grouped = applyChartQuery(people, [evaluated('p-c', 'not-matched'), evaluated('p-a', 'matched')]);
    expect(grouped.matches.map((p) => p.id)).toEqual(['p-a']);
    expect(grouped.notEvaluable).toEqual([]);
  });

  it('orders the not-evaluable group by list order', () => {
    const grouped = applyChartQuery(people, [blocked('p-e'), notEvaluableResult('p-b')]);
    expect(grouped.notEvaluable.map((entry) => entry.person.id)).toEqual(['p-b', 'p-e']);
  });
});
