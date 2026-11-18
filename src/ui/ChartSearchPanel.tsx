/**
 * @module ChartSearchPanel
 * @purpose The Chart query panel on People (#1405, #1731): build up to 10 placement conditions, run them over every stored person on request, reset them, and save them. The run filters the People list itself, so this panel shows no results of its own; it re-exports the result pieces and the saved-search list, so People loads all of them through one lazy chunk.
 * @conventions EXPLICIT RUN ONLY: editing never computes; Run is disabled and reads "Searching…" while running and the last result stays on screen meanwhile. The draft model (`chart-search-draft`) owns every rule; this file only renders it. The as-of date shows only when a condition uses a timing scope, defaults to today and is never saved. Reset puts the starting conditions back and clears the applied query (the page owns both). All messages go through `StatusMessage`. A read-only store disables every control with a stated reason. Removing a condition returns focus to the Remove control now at that position (or Add when none is left to land on). Layout: one condition field per line at 40rem and below.
 * @exports ChartSearchPanel, ChartSearchPanelProps, ChartQueryStatus, NotEvaluableList, SavedChartSearchList
 */
import { useEffect, useRef, useState } from 'react';
import { MAX_SEARCH_CONDITIONS, type ChartSearch } from '../domain/chart-search.js';
import { ChartSearchConditionRow } from './ChartSearchConditionRow.js';
import { chartSearchPanelMessages } from './ChartSearchPanel.messages.js';
import type { ChartSearchRunState } from './chart-search-run.js';
import {
  addDraftCondition,
  blankCondition,
  editDraftCondition,
  initialDraft,
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
import { StatusMessage } from './primitives/StatusMessage.js';
import { SaveChartSearchForm } from './SavedChartSearches.js';
import { useStore } from './store-context.js';

// One lazy chunk for everything the chart query draws on People (#1731).
export { ChartQueryStatus, NotEvaluableList } from './ChartSearchResults.js';
export { SavedChartSearchList } from './SavedChartSearches.js';

export interface ChartSearchPanelProps {
  /** `undefined` until the first edit; the card then starts from `initialDraft()`. */
  readonly draft: ChartSearchDraft | undefined;
  readonly onDraftChange: (draft: ChartSearchDraft) => void;
  readonly runState: ChartSearchRunState;
  readonly onRun: (search: ChartSearch, asOf: string) => void;
  /** Back to the starting conditions, and the applied query cleared (#1731). */
  readonly onReset: () => void;
  /** The id of the Chart query toggle that names this panel. */
  readonly labelledBy: string;
}

export function ChartSearchPanel({
  draft: storedDraft,
  onDraftChange,
  runState: state,
  onRun,
  onReset,
  labelledBy,
}: ChartSearchPanelProps): React.JSX.Element {
  const t = useMessages(chartSearchPanelMessages);
  // Fixed at mount, as before the lift: an untouched card keeps the as-of date it opened with.
  const [starting] = useState(initialDraft);
  const draft = storedDraft ?? starting;
  const store = useStore();
  const writable = store.writable;
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
    onRun(search, draft.asOf);
  };

  const add = (): void => {
    const next = addDraftCondition(draft, blankCondition());
    if (next.ok) onDraftChange(next.value);
  };
  const remove = (index: number): void => {
    const next = removeDraftCondition(draft, index);
    if (!next.ok) return;
    onDraftChange(next.value);
    setFocusAfterRemove(index);
  };

  return (
    <section className="tool-card chart-search" aria-labelledby={labelledBy}>
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
          onDraftChange(setOperator(draft, value === 'all' ? 'and' : 'or'));
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
              if (edited.ok) onDraftChange(edited.value);
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
              onDraftChange(setAsOf(draft, value));
            }}
          />
        </div>
      )}

      <div className="add-row" ref={addButton}>
        <Button variant="quiet" className="primitive-button-form-action" disabled={!writable || atCap} onClick={add}>
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
          className="primitive-button-form-action"
          disabled={!writable || running || count === 0 || asOfInvalid}
          busy={running}
          busyLabel={t.searching}
          onClick={startRun}
        >
          {t.run}
        </Button>
        <Button
          variant="quiet"
          shape="capsule"
          className="primitive-button-form-action"
          disabled={running}
          onClick={onReset}
        >
          {t.reset}
        </Button>
      </div>

      <SaveChartSearchForm draft={draft} />
    </section>
  );
}
