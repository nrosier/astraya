/**
 * @module ChartSearchResults
 * @purpose The chart query's result pieces on the one People list (#1405, #1731): the status line that says how many people the applied query leaves and which conditions it used, with Clear, and the "could not be evaluated" group with a stated reason for each person.
 * @conventions Nobody is dropped: a person whose chart cannot be evaluated is listed in the group with reasons from the fixed copy list, never raw codes. The matches themselves are rendered by People as its ordinary rows, so only the parts that need the chart-search copy live here; this module stays in the lazy chart-search chunk. Each row links to the person with `personHref`. Every message goes through `StatusMessage`.
 * @exports describeCondition, ChartQueryStatus, NotEvaluableList
 */
import { bodyById } from '../astrology/bodies.js';
import type { ChartSearch, NotEvaluableReason, SearchCondition } from '../domain/chart-search.js';
import { chartSearchPanelMessages } from './ChartSearchPanel.messages.js';
import { aspectDisplayName, bodyDisplayName, signDisplayName } from './astro-names.messages.js';
import { SIGNS } from '../astrology/signs.js';
import type { PersonRunBlockedReason } from './chart-search-run.js';
import type { QueryNotEvaluable } from './people-query.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { StatusMessage } from './primitives/StatusMessage.js';
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

const REASONS: Readonly<
  Record<NotEvaluableReason, 'birthTimeUnknown' | 'housesUndefined' | 'bodyMissing' | 'timingUnavailable'>
> = {
  'birth-time-unknown': 'birthTimeUnknown',
  'houses-undefined': 'housesUndefined',
  'body-missing': 'bodyMissing',
  'timing-unavailable': 'timingUnavailable',
};

function reasonText(reason: NotEvaluableReason | PersonRunBlockedReason, t: Messages): string {
  if (reason === 'settings-unreadable') return t.blocked.settingsUnreadable;
  if (reason === 'birth-data-incomplete') return t.blocked.birthDataIncomplete;
  return t.reason[REASONS[reason]];
}

/**
 * "Showing 2 of 14 people matching …" for the applied query (#1731), with Clear. The conditions are joined with
 * " · " for Match all and " or " for Match any. A query that leaves nobody uses the zero-result copy instead.
 */
export function ChartQueryStatus({
  search,
  shown,
  total,
  onClear,
}: {
  readonly search: ChartSearch;
  readonly shown: number;
  readonly total: number;
  readonly onClear: () => void;
}): React.JSX.Element {
  const t = useMessages(chartSearchPanelMessages);
  const [locale] = useLocale();
  const conditions = search.conditions
    .map((condition) => describeCondition(condition, t, locale))
    .join(search.operator === 'and' ? t.allJoiner : t.anyJoiner);
  return (
    <StatusMessage kind={shown === 0 ? 'zero' : 'success'} className="people-query-status">
      {shown === 0 ? t.zeroResults : t.showingMatching(String(shown), String(total), conditions)}{' '}
      <Button size="compact" shape="capsule" onClick={onClear}>
        {t.clear}
      </Button>
    </StatusMessage>
  );
}

/** The people the applied query could not evaluate, under the matches (#1731 owner answer), each with its reason. */
export function NotEvaluableList({
  items,
  unnamed,
}: {
  readonly items: readonly QueryNotEvaluable[];
  readonly unnamed: string;
}): React.JSX.Element | null {
  const t = useMessages(chartSearchPanelMessages);
  if (items.length === 0) return null;
  return (
    <section className="people-not-evaluable" aria-labelledby="people-not-evaluable-heading">
      <h3 id="people-not-evaluable-heading">
        {t.notEvaluableHeading} ({items.length})
      </h3>
      <p className="hint">{t.notEvaluableNote}</p>
      <ul className="people">
        {items.map(({ person, reasons }) => (
          <li key={person.id}>
            <a className="person" href={personHref(person.id)}>
              <span className={person.displayName === '' ? 'name unnamed' : 'name'}>
                {person.displayName === '' ? unnamed : person.displayName}
              </span>
              <span className="summary incomplete">{reasons.map((reason) => reasonText(reason, t)).join(' ')}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
