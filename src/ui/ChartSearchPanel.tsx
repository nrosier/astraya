/**
 * @module ChartSearchPanel
 * @purpose The "Search charts" card above the People list (#1405): build up to 10 placement conditions, run them over every stored person on request, and list matches and the people who could not be evaluated; saved searches live in the same card.
 * @conventions EXPLICIT RUN ONLY: editing never computes; Run is disabled and reads "Searching…" while running and the last result stays on screen meanwhile. The draft model (`chart-search-draft`) owns every rule; this file only renders it. The as-of date shows only when a condition uses a timing scope, defaults to today and is never saved. Matches come first, then a separate not-evaluable group with reasons from the fixed copy list. All messages go through `StatusMessage`. A read-only store disables every control with a stated reason. Removing a condition returns focus to the Remove control now at that position (or Add when none is left to land on). Layout: one condition field per line at 40rem and below.
 * @exports ChartSearchPanel
 */
import { useEffect, useRef, useState } from 'react';
import { MAX_SEARCH_CONDITIONS, type ChartSearch } from '../domain/chart-search.js';
import { ChartSearchConditionRow, blankCondition } from './ChartSearchConditionRow.js';
import { chartSearchPanelMessages } from './ChartSearchPanel.messages.js';
import { ChartSearchResults, resultsSummary } from './ChartSearchResults.js';
import {
  addDraftCondition,
  editDraftCondition,
  newDraft,
  parseAsOf,
  removeDraftCondition,
  setAsOf,
  setOperator,
  type ChartSearchDraft,
} from './chart-search-draft.js';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { ChoiceGroup } from './primitives/ChoiceGroup.js';
import { DateField } from './primitives/DateField.js';
import { EmptyState } from './primitives/EmptyState.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { SavedChartSearches } from './SavedChartSearches.js';
import { useStore } from './store-context.js';
import { useChartSearchRun } from './use-chart-search-run.js';

function initialDraft(): ChartSearchDraft {
  const draft = addDraftCondition(newDraft(), blankCondition());
  return draft.ok ? draft.value : newDraft();
}

export function ChartSearchPanel(): React.JSX.Element {
  const t = useMessages(chartSearchPanelMessages);
  const store = useStore();
  const writable = store.writable;
  const [draft, setDraft] = useState<ChartSearchDraft>(initialDraft);
  const { state, results, run } = useChartSearchRun();
  const list = useRef<HTMLOListElement>(null);
  const addButton = useRef<HTMLDivElement>(null);
  // The position whose Remove control takes focus after a removal; read in an effect once the row has re-rendered.
  const [focusAfterRemove, setFocusAfterRemove] = useState<number>();

  useEffect(() => {
    if (focusAfterRemove === undefined) return;
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('button[data-remove]') ?? [];
    const target = buttons[Math.min(focusAfterRemove, buttons.length - 1)];
    if (target !== undefined) target.focus();
    else addButton.current?.querySelector('button')?.focus();
    setFocusAfterRemove(undefined);
  }, [focusAfterRemove]);

  const running = state.status === 'running';
  const count = draft.conditions.length;
  const atCap = count >= MAX_SEARCH_CONDITIONS;
  const timing = draft.conditions.some((condition) => (condition.scope ?? 'natal') !== 'natal');
  const asOfInvalid = timing && !parseAsOf(draft.asOf).ok;

  const search: ChartSearch = { operator: draft.operator, conditions: draft.conditions };
  const startRun = (): void => {
    run(search, draft.asOf);
  };

  const add = (): void => {
    const next = addDraftCondition(draft, blankCondition());
    if (next.ok) setDraft(next.value);
  };
  const remove = (index: number): void => {
    const next = removeDraftCondition(draft, index);
    if (!next.ok) return;
    setDraft(next.value);
    setFocusAfterRemove(index);
  };

  const groups = results === undefined ? undefined : resultsSummary(results);
  const anyRun = results !== undefined;

  return (
    <section className="tool-card chart-search" aria-labelledby="chart-search-heading">
      <h2 id="chart-search-heading">{t.heading}</h2>
      <p className="hint">{t.intro}</p>
      {!writable && <StatusMessage kind="offline">{t.readOnly}</StatusMessage>}

      <ChoiceGroup
        label={t.matchLabel}
        showLabel
        value={draft.operator === 'and' ? 'all' : 'any'}
        options={[
          { value: 'all', label: t.operator.all },
          { value: 'any', label: t.operator.any },
        ]}
        disabled={!writable}
        onChange={(value) => {
          setDraft(setOperator(draft, value === 'all' ? 'and' : 'or'));
        }}
      />

      <ol className="conds" ref={list}>
        {draft.conditions.map((condition, index) => (
          // Rows have no identity of their own; position is the identity, as in the draft model.
          <ChartSearchConditionRow
            key={index}
            position={index + 1}
            condition={condition}
            disabled={!writable}
            canRemove={count > 1}
            onChange={(next) => {
              const edited = editDraftCondition(draft, index, next);
              if (edited.ok) setDraft(edited.value);
            }}
            onRemove={() => {
              remove(index);
            }}
          />
        ))}
      </ol>

      {timing && (
        <div className="asof">
          <DateField
            label={t.asOfLabel}
            value={draft.asOf}
            help={t.asOfHelp}
            error={asOfInvalid ? t.asOfInvalid : undefined}
            disabled={!writable}
            onChange={(value) => {
              setDraft(setAsOf(draft, value));
            }}
          />
        </div>
      )}

      <div className="add-row" ref={addButton}>
        <Button variant="quiet" disabled={!writable || atCap} onClick={add}>
          {t.addCondition}
        </Button>
        {atCap ? (
          <StatusMessage kind="partial" className="cap-note">
            {t.capReached}
          </StatusMessage>
        ) : (
          <span className="hint">{t.conditionCount(String(count))}</span>
        )}
      </div>

      {state.status === 'error' && (
        <StatusMessage kind="error" detail={state.message === '' ? t.searchFailedDetail : state.message}>
          {t.searchFailed}{' '}
          <Button variant="quiet" size="compact" onClick={startRun}>
            {t.retry}
          </Button>
        </StatusMessage>
      )}

      <div className="tool-actions">
        <Button
          variant="primary"
          disabled={!writable || running || count === 0 || asOfInvalid}
          busy={running}
          busyLabel={t.searching}
          onClick={startRun}
        >
          {t.run}
        </Button>
      </div>

      {!anyRun && state.status !== 'error' && <EmptyState message={t.firstUse} />}
      {groups !== undefined && (
        <>
          {groups.matches.length === 0 ? (
            <StatusMessage kind="zero">{t.zeroResults}</StatusMessage>
          ) : (
            <StatusMessage kind="success">
              {t.foundSummary(String(groups.matches.length), String(results?.length ?? 0))}
            </StatusMessage>
          )}
          <ChartSearchResults groups={groups} unnamed={t.unnamed} />
        </>
      )}

      <SavedChartSearches draft={draft} onOpen={setDraft} />
    </section>
  );
}
