/**
 * @module ChartSearchResults
 * @purpose Results of a chart search on People (#1405): the matching people with the conditions that matched, then a separate "could not be evaluated" group with a stated reason for each person.
 * @conventions Nobody is dropped: a person whose chart cannot be evaluated (blocked before any condition, or every condition unreadable for them) is listed in the second group with reasons from the fixed copy list, never raw codes. People who simply do not match are not listed; the summary line counts them in the total. Each row links to the person with `personHref`. The run announcement itself is a `StatusMessage` owned by the card.
 * @exports ChartSearchResults, describeCondition, resultsSummary
 */
import { bodyById } from '../astrology/bodies.js';
import type { NotEvaluableReason, SearchCondition } from '../domain/chart-search.js';
import { chartSearchPanelMessages } from './ChartSearchPanel.messages.js';
import { aspectDisplayName, bodyDisplayName, signDisplayName } from './astro-names.messages.js';
import { SIGNS } from '../astrology/signs.js';
import type { PersonRunResult } from './chart-search-run.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { personHref } from './route.js';
import type { Locale } from '../interpretation/schema.js';

type Messages = (typeof chartSearchPanelMessages)['en'];

/** One condition as a short sentence in the reader's language. */
export function describeCondition(condition: SearchCondition, t: Messages, locale: Locale): string {
  const scope = t.scope[condition.scope ?? 'natal'];
  const body = bodyDisplayName(bodyById(condition.body)?.key ?? '', locale);
  if (condition.kind === 'sign') {
    const sign = SIGNS[condition.sign]?.name ?? '';
    return t.describe.sign(scope, body, signDisplayName(sign, locale));
  }
  if (condition.kind === 'house') return t.describe.house(scope, body, String(condition.house));
  const target =
    condition.target.kind === 'angle'
      ? bodyDisplayName(condition.target.angle, locale)
      : bodyDisplayName(bodyById(condition.target.body)?.key ?? '', locale);
  return t.describe.aspect(scope, body, aspectDisplayName(condition.aspectKey, locale), target);
}

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

const REASONS: Readonly<
  Record<NotEvaluableReason, 'birthTimeUnknown' | 'housesUndefined' | 'bodyMissing' | 'timingUnavailable'>
> = {
  'birth-time-unknown': 'birthTimeUnknown',
  'houses-undefined': 'housesUndefined',
  'body-missing': 'bodyMissing',
  'timing-unavailable': 'timingUnavailable',
};

export function ChartSearchResults({
  groups,
  unnamed,
}: {
  readonly groups: ResultsGroups;
  readonly unnamed: string;
}): React.JSX.Element {
  const t = useMessages(chartSearchPanelMessages);
  const [locale] = useLocale();
  const name = (displayName: string): string => (displayName === '' ? unnamed : displayName);
  const reasonsOf = (entry: PersonRunResult): string => {
    if (entry.kind === 'not-evaluable') {
      return entry.reason === 'settings-unreadable' ? t.blocked.settingsUnreadable : t.blocked.birthDataIncomplete;
    }
    return entry.result.notEvaluableReasons.map((reason) => t.reason[REASONS[reason]]).join(' ');
  };

  return (
    <div className="results">
      {groups.matches.length > 0 && (
        <>
          <h3>{t.matchesHeading(String(groups.matches.length))}</h3>
          <ul className="people">
            {groups.matches.map((entry) => (
              <li key={entry.personId}>
                <a className="person" href={personHref(entry.personId)}>
                  <span className="name">{name(entry.displayName)}</span>
                  <span className="summary">
                    {entry.result.matchedConditions
                      .map((condition) => describeCondition(condition, t, locale))
                      .join('; ')}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {groups.notEvaluable.length > 0 && (
        <>
          <h3 className="ne">
            {t.notEvaluableHeading} ({groups.notEvaluable.length})
          </h3>
          <p className="hint">{t.notEvaluableNote}</p>
          <ul className="people">
            {groups.notEvaluable.map((entry) => (
              <li key={entry.personId}>
                <a className="person" href={personHref(entry.personId)}>
                  <span className="name">{name(entry.displayName)}</span>
                  <span className="summary incomplete">{reasonsOf(entry)}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
