/**
 * The Life events management drawer (#1439): the full list of a person's events, opened from the birth record's
 * summary card. A right-side drawer on desktop and a bottom sheet on phones, built on the staged dialog.
 */
/**
 * @module LifeEventsDrawer
 * @purpose Staged editor for a person's life events: search, category filter, date sort, inline edit of one row, a pinned quick-add row, CSV import and export, clear-all with confirmation, and Save and close.
 * @conventions Edits a draft that exists while the drawer is open; Save and close writes the whole list once through `lifeEventsMutation` on the person operation log (never the op-log spine itself), and Escape, the close button and the backdrop discard the draft; Clear all asks first, names the count, says it cannot be undone, and then writes the empty list at once; CSV import is atomic (one bad row imports nothing), is staged into the draft and skips events already present; the cap of `LIFE_EVENTS_MAX` is shown and enforced for add, quick-add and import; only one row is edited at a time and the other Edit buttons say why they are off; the quick-add row saves on Enter and puts focus on its own date field, the next blank row; layout lives in `app.css` under `.life-events-drawer` (bottom sheet at 40rem and narrower).
 * @exports LifeEventsDrawer
 */
import { useId, useRef, useState } from 'react';
import {
  LIFE_EVENT_CATEGORIES,
  LIFE_EVENT_LABEL_MAX_CHARACTERS,
  LIFE_EVENTS_MAX,
  isLifeEventCategory,
  lifeEventsMutation,
  type LifeEvent,
} from '../domain/life-events.js';
import { parseLifeEventsCsv, serialiseLifeEvents, type LifeEventCsvError } from '../domain/life-events-csv.js';
import { errorDetail } from './api-error.js';
import { downloadText } from './download.js';
import {
  LIFE_EVENT_NO_CATEGORY,
  lifeEventsChanged,
  rowsFromEvents,
  rowsToEvents,
  validateLifeEventRows,
  viewLifeEvents,
  type LifeEventRow,
  type LifeEventView,
} from './life-events-draft.js';
import { lifeEventCategoryMessages } from './LifeEventCategories.messages.js';
import { lifeEventsDrawerMessages } from './LifeEventsDrawer.messages.js';
import { useMessages } from './messages.js';
import { personFormMessages } from './PersonForm.messages.js';
import { Button } from './primitives/Button.js';
import { DateField } from './primitives/DateField.js';
import { FileInput } from './primitives/FileInput.js';
import { Select } from './primitives/Select.js';
import { StagedDialog } from './primitives/StagedDialog.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { TextField } from './primitives/TextField.js';
import { TimeField } from './primitives/TimeField.js';
import { useStore } from './store-context.js';

export interface LifeEventsDrawerProps {
  readonly open: boolean;
  readonly personId: string;
  /** The person's name for the heading; empty when the record has none yet. */
  readonly personName: string;
  /** The stored events the draft starts from each time the drawer opens. */
  readonly events: readonly LifeEvent[];
  readonly onClose: () => void;
  /** Focus returns here when the drawer closes. */
  readonly returnFocusTo: React.RefObject<HTMLElement | null>;
}

interface Editing {
  readonly row: LifeEventRow;
  /** A row added with "Add new event" that is not in the draft yet. */
  readonly isNew: boolean;
}

type Notice = { readonly kind: 'success' | 'error'; readonly text: string } | undefined;

const BLANK_VIEW: LifeEventView = { search: '', category: '', direction: 'asc' };

export function LifeEventsDrawer({
  open,
  personId,
  personName,
  events,
  onClose,
  returnFocusTo,
}: LifeEventsDrawerProps): React.JSX.Element {
  const t = useMessages(lifeEventsDrawerMessages);
  const names = useMessages(lifeEventCategoryMessages);
  const tPerson = useMessages(personFormMessages);
  const store = useStore();
  const statusId = useId();
  const clearButton = useRef<HTMLButtonElement>(null);
  const quickForm = useRef<HTMLFormElement>(null);

  const [draft, setDraft] = useState<readonly LifeEvent[]>(events);
  const [wasOpen, setWasOpen] = useState(false);
  const [view, setView] = useState<LifeEventView>(BLANK_VIEW);
  const [editing, setEditing] = useState<Editing | undefined>(undefined);
  const [quick, setQuick] = useState({ date: '', label: '' });
  const [quickTried, setQuickTried] = useState(false);
  const [editTried, setEditTried] = useState(false);
  const [notice, setNotice] = useState<Notice>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  // Each opening starts from what is stored (adjusting state while rendering, not in an effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(events);
      setView(BLANK_VIEW);
      setEditing(undefined);
      setQuick({ date: '', label: '' });
      setQuickTried(false);
      setEditTried(false);
      setNotice(undefined);
      setConfirming(false);
    }
  }

  const name = personName.trim() === '' ? t.unnamed : personName.trim();
  const atCap = draft.length >= LIFE_EVENTS_MAX;
  const shown = viewLifeEvents(draft, view);
  const filtered = view.search.trim() !== '' || view.category !== '';
  const changed = lifeEventsChanged(rowsFromEvents(draft), events);
  const editErrors =
    editing === undefined ? undefined : validateLifeEventRows([editing.row], tPerson).get(editing.row.id);
  const quickErrors = validateLifeEventRows(
    [{ id: 'quick', date: quick.date, time: '', label: quick.label }],
    tPerson,
  ).get('quick');

  const replaceDraft = (rows: readonly LifeEventRow[]): void => {
    setDraft(rowsToEvents(rows));
  };

  const commitQuick = (): void => {
    if (atCap) return;
    if (quickErrors !== undefined) {
      setQuickTried(true);
      return;
    }
    replaceDraft([
      ...rowsFromEvents(draft),
      { id: crypto.randomUUID(), date: quick.date, time: '', label: quick.label },
    ]);
    setQuick({ date: '', label: '' });
    setQuickTried(false);
    setNotice(undefined);
    quickForm.current?.querySelector<HTMLInputElement>('input[type="date"]')?.focus();
  };

  const commitEdit = (): void => {
    if (editing === undefined) return;
    if (editErrors !== undefined) {
      setEditTried(true);
      return;
    }
    const rows = rowsFromEvents(draft);
    replaceDraft(
      editing.isNew ? [...rows, editing.row] : rows.map((row) => (row.id === editing.row.id ? editing.row : row)),
    );
    setEditing(undefined);
    setEditTried(false);
  };

  const startEdit = (event: LifeEvent): void => {
    setEditing({
      row: rowsFromEvents([event])[0] ?? { id: event.id, date: event.date, time: '', label: event.label },
      isNew: false,
    });
    setEditTried(false);
  };

  const startNew = (): void => {
    if (atCap || editing !== undefined) return;
    setEditing({ row: { id: crypto.randomUUID(), date: '', time: '', label: '' }, isNew: true });
    setEditTried(false);
  };

  const importFile = (file: File | undefined): void => {
    if (file === undefined) return;
    void file.text().then(
      (text) => {
        const result = parseLifeEventsCsv(text);
        if (!result.ok) {
          setNotice({ kind: 'error', text: `${t.importFailed} ${csvErrorText(result.error)}` });
          return;
        }
        const rows = rowsFromEvents(draft);
        const known = new Set(rows.map((row) => `${row.date}|${row.time}|${row.category ?? ''}|${row.label}`));
        const fresh = result.entries.filter(
          (entry) => !known.has(`${entry.date}|${entry.time ?? ''}|${entry.category ?? ''}|${entry.label}`),
        );
        const room = LIFE_EVENTS_MAX - rows.length;
        if (fresh.length > room) {
          setNotice({ kind: 'error', text: `${t.importFailed} ${t.importOverCap(fresh.length, room)}` });
          return;
        }
        replaceDraft([
          ...rows,
          ...fresh.map((entry) => ({
            id: crypto.randomUUID(),
            date: entry.date,
            time: entry.time ?? '',
            label: entry.label,
            ...(entry.category === undefined ? {} : { category: entry.category }),
          })),
        ]);
        setNotice({ kind: 'success', text: t.importDone(fresh.length) });
      },
      () => {
        setNotice({ kind: 'error', text: t.importFailed });
      },
    );
  };

  const csvErrorText = (error: LifeEventCsvError): string => {
    switch (error.code) {
      case 'empty':
        return t.csvEmpty;
      case 'header':
        return t.csvHeader;
      case 'columns':
        return t.csvColumns(error.line);
      case 'quote':
        return t.csvQuote;
      case 'date':
        return t.csvDate(error.line);
      case 'time':
        return t.csvTime(error.line);
      case 'category':
        return t.csvCategory(error.line, LIFE_EVENT_CATEGORIES.map((category) => names[category]).join(', '));
      case 'description':
        return t.csvDescription(error.line, LIFE_EVENT_LABEL_MAX_CHARACTERS);
      case 'tooMany':
        return t.csvTooMany(LIFE_EVENTS_MAX);
    }
  };

  const write = async (next: readonly LifeEvent[]): Promise<boolean> => {
    setSaving(true);
    setNotice(undefined);
    try {
      await store.mutate([lifeEventsMutation(personId, next)]);
      return true;
    } catch (cause) {
      setNotice({ kind: 'error', text: `${t.saveFailed} ${errorDetail(cause)}` });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAndClose = (): void => {
    if (!changed) {
      onClose();
      return;
    }
    void write(draft).then((ok) => {
      if (ok) onClose();
    });
  };

  const clearAll = (): void => {
    void write([]).then((ok) => {
      setConfirming(false);
      if (ok) {
        setDraft([]);
        setEditing(undefined);
      }
    });
  };

  const categoryOptions = [
    { value: '', label: t.allCategories },
    { value: LIFE_EVENT_NO_CATEGORY, label: t.noCategory },
    ...LIFE_EVENT_CATEGORIES.map((category) => ({ value: category, label: names[category] })),
  ];
  const editBlocks = editing !== undefined;

  return (
    <>
      <StagedDialog
        open={open}
        heading={t.heading(name)}
        closeLabel={t.closeLabel}
        onDiscard={onClose}
        returnFocusTo={returnFocusTo}
        placement="right"
        dialogClassName="settings-card life-events-drawer"
        subheader={<p className="life-events-drawer-count">{t.configured(draft.length, LIFE_EVENTS_MAX)}</p>}
        footer={
          <>
            <div className="settings-card-footer-group">
              <FileInput buttonLabel={t.importButton} accept=".csv,text/csv" onChange={importFile} />
              <Button
                onClick={() => {
                  downloadText('life-events.csv', serialiseLifeEvents(draft), 'text/csv;charset=utf-8');
                }}
                disabled={draft.length === 0}
              >
                {t.exportButton}
              </Button>
              <Button
                ref={clearButton}
                variant="danger"
                disabled={draft.length === 0 || saving}
                onClick={() => {
                  setConfirming(true);
                }}
              >
                {t.clearAll}
              </Button>
            </div>
            <div className="settings-card-footer-group">
              <Button
                variant="primary"
                busy={saving}
                busyLabel={t.saving}
                disabled={editBlocks}
                aria-describedby={editBlocks ? statusId : undefined}
                onClick={saveAndClose}
              >
                {t.saveClose}
              </Button>
            </div>
          </>
        }
      >
        <div className="life-events-toolbar">
          <TextField
            label={t.searchLabel}
            hideLabel
            placeholder={t.searchLabel}
            value={view.search}
            onChange={(search) => {
              setView({ ...view, search });
            }}
          />
          <Select
            label={t.categoryLabel}
            hideLabel
            value={view.category}
            options={categoryOptions}
            onChange={(category) => {
              setView({
                ...view,
                category: category === LIFE_EVENT_NO_CATEGORY || isLifeEventCategory(category) ? category : '',
              });
            }}
          />
          <Button
            onClick={() => {
              setView({ ...view, direction: view.direction === 'asc' ? 'desc' : 'asc' });
            }}
          >
            {view.direction === 'asc' ? t.sortAscending : t.sortDescending}
          </Button>
          <Button
            variant="primary"
            disabled={atCap || editBlocks}
            aria-describedby={atCap || editBlocks ? statusId : undefined}
            onClick={startNew}
          >
            {t.addNew}
          </Button>
        </div>
        <div id={statusId} className="hint life-events-hint">
          {atCap ? t.atCap(LIFE_EVENTS_MAX) : editBlocks ? t.finishEditHint : null}
        </div>
        {notice !== undefined && <StatusMessage kind={notice.kind}>{notice.text}</StatusMessage>}

        <div className="life-events-table-scroll" role="region" aria-label={t.tableLabel} tabIndex={0}>
          <div className="life-events-table" role="table" aria-label={t.tableLabel}>
            <div role="rowgroup">
              <div role="row" className="life-events-head">
                <div role="columnheader">{t.colDate}</div>
                <div role="columnheader">{t.colTime}</div>
                <div role="columnheader">{t.colCategory}</div>
                <div role="columnheader">{t.colDescription}</div>
                <div role="columnheader">
                  <span className="sr-only">{t.colActions}</span>
                </div>
              </div>
            </div>
            <div role="rowgroup">
              {editing?.isNew === true && (
                <EditRow
                  editing={editing}
                  errors={editTried ? editErrors : undefined}
                  names={names}
                  onChange={(row) => {
                    setEditing({ ...editing, row });
                  }}
                  onSave={commitEdit}
                  onCancel={() => {
                    setEditing(undefined);
                    setEditTried(false);
                  }}
                />
              )}
              {shown.map((event) =>
                editing !== undefined && !editing.isNew && editing.row.id === event.id ? (
                  <EditRow
                    key={event.id}
                    editing={editing}
                    errors={editTried ? editErrors : undefined}
                    names={names}
                    onChange={(row) => {
                      setEditing({ ...editing, row });
                    }}
                    onSave={commitEdit}
                    onCancel={() => {
                      setEditing(undefined);
                      setEditTried(false);
                    }}
                  />
                ) : (
                  <div role="row" className="life-events-line" key={event.id}>
                    <div role="cell" className="life-events-cell-date">
                      {event.date}
                    </div>
                    <div role="cell">{event.time ?? '—'}</div>
                    <div role="cell">{event.category === undefined ? '—' : names[event.category]}</div>
                    <div role="cell" className="life-events-cell-label">
                      {event.label}
                    </div>
                    <div role="cell" className="life-events-cell-actions">
                      <Button
                        size="compact"
                        disabled={editBlocks}
                        aria-label={t.editLabel(event.label)}
                        onClick={() => {
                          startEdit(event);
                        }}
                      >
                        {t.edit}
                      </Button>
                      <Button
                        size="compact"
                        variant="danger"
                        disabled={editBlocks}
                        aria-label={t.removeLabel(event.label)}
                        onClick={() => {
                          setDraft(draft.filter((other) => other.id !== event.id));
                        }}
                      >
                        {t.remove}
                      </Button>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
        {draft.length === 0 && editing === undefined && <p className="muted">{t.noEvents}</p>}
        {draft.length > 0 && shown.length === 0 && (
          <div className="life-events-no-match">
            <p className="muted">{t.noMatches}</p>
            {filtered && (
              <Button
                onClick={() => {
                  setView({ ...view, search: '', category: '' });
                }}
              >
                {t.clearFilters}
              </Button>
            )}
          </div>
        )}
        <p className="muted life-events-showing">{t.showing(shown.length, draft.length)}</p>

        <form
          ref={quickForm}
          className="life-events-quick"
          aria-label={t.quickAddLegend}
          onSubmit={(event) => {
            event.preventDefault();
            commitQuick();
          }}
        >
          <DateField
            label={t.quickAddDate}
            hideLabel
            value={quick.date}
            error={quickTried ? quickErrors?.date : undefined}
            disabled={atCap}
            onChange={(date) => {
              setQuick({ ...quick, date });
            }}
          />
          <TextField
            label={t.quickAddDescription}
            hideLabel
            placeholder={t.colDescription}
            value={quick.label}
            error={quickTried ? quickErrors?.label : undefined}
            disabled={atCap}
            inputProps={{
              maxLength: LIFE_EVENT_LABEL_MAX_CHARACTERS,
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitQuick();
                }
              },
            }}
            onChange={(label) => {
              setQuick({ ...quick, label });
            }}
          />
          <Button variant="primary" type="submit" disabled={atCap}>
            {t.quickAddButton}
          </Button>
        </form>
      </StagedDialog>

      <StagedDialog
        open={open && confirming}
        heading={t.confirmHeading}
        closeLabel={t.confirmClose}
        onDiscard={() => {
          setConfirming(false);
        }}
        returnFocusTo={clearButton}
        dialogClassName="settings-card drawer-fit life-events-confirm"
        footer={
          <div className="settings-card-footer-group">
            <Button
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t.confirmKeep}
            </Button>
            <Button variant="danger" busy={saving} busyLabel={t.saving} onClick={clearAll}>
              {t.confirmDelete(draft.length)}
            </Button>
          </div>
        }
      >
        <p>{t.confirmBody(draft.length, name)}</p>
      </StagedDialog>
    </>
  );
}

interface EditRowProps {
  readonly editing: Editing;
  readonly errors: { readonly date?: string; readonly label?: string } | undefined;
  readonly names: Readonly<Record<(typeof LIFE_EVENT_CATEGORIES)[number], string>>;
  readonly onChange: (row: LifeEventRow) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}

/** One row turned into inputs: a single wide cell holding a small grid, so narrow columns do not squeeze the fields. */
function EditRow({ editing, errors, names, onChange, onSave, onCancel }: EditRowProps): React.JSX.Element {
  const t = useMessages(lifeEventsDrawerMessages);
  const { row } = editing;
  return (
    <div role="row" className="life-events-edit-row">
      <div role="cell">
        <div
          className="life-events-edit"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
              event.preventDefault();
              onSave();
            }
          }}
        >
          <DateField
            label={t.colDate}
            value={row.date}
            error={errors?.date}
            onChange={(date) => {
              onChange({ ...row, date });
            }}
          />
          <TimeField
            label={t.colTime}
            optional
            step={60}
            value={row.time}
            onChange={(time) => {
              onChange({ ...row, time });
            }}
          />
          <Select
            label={t.colCategory}
            value={row.category ?? ''}
            options={[
              { value: '', label: t.noCategory },
              ...LIFE_EVENT_CATEGORIES.map((category) => ({ value: category, label: names[category] })),
            ]}
            onChange={(value) => {
              const { category: _previous, ...rest } = row;
              onChange(isLifeEventCategory(value) ? { ...rest, category: value } : rest);
            }}
          />
          <TextField
            label={t.colDescription}
            value={row.label}
            error={errors?.label}
            inputProps={{ maxLength: LIFE_EVENT_LABEL_MAX_CHARACTERS, autoFocus: true }}
            onChange={(label) => {
              onChange({ ...row, label });
            }}
          />
          <div className="life-events-edit-actions">
            <Button variant="primary" size="compact" onClick={onSave}>
              {t.rowSave}
            </Button>
            <Button size="compact" onClick={onCancel}>
              {t.rowCancel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
