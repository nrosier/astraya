/**
 * The Life events card on the birth record (#1399, slice S3): dated events of one person, edited with the page Save.
 */
/**
 * @module LifeEventsCard
 * @purpose Card of date, optional time and label rows with add and remove, a visible count against the 100-event cap, and the unreadable-list warning.
 * @conventions Controlled: the parent holds the rows and writes them through `lifeEventsMutation` on the page Save; rows keep their place while one is being edited and are put in date-then-time order when focus leaves the row; the add control is disabled at the cap with the reason beside it; an unreadable stored list shows a warning and no editor, so it is never overwritten; errors show for a row once it has content or has been left, through the shared fields.
 * @exports LifeEventsCard
 */
import { useId, useState } from 'react';
import { LIFE_EVENT_LABEL_MAX_CHARACTERS, LIFE_EVENTS_MAX, sortLifeEvents } from '../domain/life-events.js';
import { useMessages } from './messages.js';
import { personFormMessages } from './PersonForm.messages.js';
import { rowsToEvents, validateLifeEventRows, type LifeEventRow } from './life-events-draft.js';
import { Button } from './primitives/Button.js';
import { DateField } from './primitives/DateField.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { TextField } from './primitives/TextField.js';
import { TimeField } from './primitives/TimeField.js';

export interface LifeEventsCardProps {
  readonly rows: readonly LifeEventRow[];
  readonly onChange: (rows: readonly LifeEventRow[]) => void;
  /** The stored list exists but cannot be read; nothing is editable and the stored value is left alone. */
  readonly unreadable: boolean;
}

export function LifeEventsCard({ rows, onChange, unreadable }: LifeEventsCardProps): React.JSX.Element {
  const t = useMessages(personFormMessages);
  const headingId = useId();
  const reasonId = useId();
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const errors = validateLifeEventRows(rows, t);
  const atCap = rows.length >= LIFE_EVENTS_MAX;

  const update = (id: string, patch: Partial<LifeEventRow>): void => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const add = (): void => {
    if (atCap) return;
    onChange([...rows, { id: crypto.randomUUID(), date: '', time: '', label: '' }]);
  };
  const remove = (id: string): void => {
    onChange(rows.filter((row) => row.id !== id));
  };
  /** Leaving a row marks it as visited and puts the list in date-then-time order. */
  const leave = (id: string, event: React.FocusEvent<HTMLElement>): void => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setTouched((previous) => new Set(previous).add(id));
    const valid = rows.every((row) => !errors.has(row.id));
    if (valid) {
      const order = sortLifeEvents(rowsToEvents(rows)).map((entry) => entry.id);
      if (order.some((rowId, index) => rows[index]?.id !== rowId)) {
        onChange(order.flatMap((rowId) => rows.filter((row) => row.id === rowId)));
      }
    }
  };

  return (
    <section className="birth-record-card birth-record-card--life-events" aria-labelledby={headingId}>
      <h3 id={headingId}>{t.lifeEventsHeading}</h3>
      {unreadable ? (
        <StatusMessage kind="partial" detail={t.lifeEventsUnreadableDetail}>
          {t.lifeEventsUnreadable}
        </StatusMessage>
      ) : (
        <>
          <p className="hint">{t.lifeEventsHint}</p>
          {rows.length > 0 && (
            <ul className="life-events-list">
              {rows.map((row) => {
                const rowErrors = errors.get(row.id);
                const show = touched.has(row.id) || row.date !== '' || row.label !== '';
                return (
                  <li
                    key={row.id}
                    className="life-events-row"
                    onBlur={(event) => {
                      leave(row.id, event);
                    }}
                  >
                    <DateField
                      label={t.lifeEventDateLabel}
                      value={row.date}
                      error={show ? rowErrors?.date : undefined}
                      onChange={(value) => {
                        update(row.id, { date: value });
                      }}
                    />
                    <TimeField
                      label={t.lifeEventTimeLabel}
                      optional
                      step={60}
                      value={row.time}
                      onChange={(value) => {
                        update(row.id, { time: value });
                      }}
                    />
                    <TextField
                      label={t.lifeEventLabelLabel}
                      value={row.label}
                      error={show ? rowErrors?.label : undefined}
                      inputProps={{ maxLength: LIFE_EVENT_LABEL_MAX_CHARACTERS }}
                      onChange={(value) => {
                        update(row.id, { label: value });
                      }}
                    />
                    <Button
                      type="button"
                      variant="quiet"
                      className="life-events-remove"
                      aria-label={t.lifeEventRemoveLabel(
                        row.label.trim() === '' ? t.lifeEventUntitled : row.label.trim(),
                      )}
                      onClick={() => {
                        remove(row.id);
                      }}
                    >
                      {t.lifeEventRemove}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="life-events-footer">
            <Button
              type="button"
              variant="quiet"
              className="life-events-add"
              disabled={atCap}
              aria-describedby={atCap ? reasonId : undefined}
              onClick={add}
            >
              {t.lifeEventAdd}
            </Button>
            <span className="muted life-events-count">{t.lifeEventsCount(rows.length, LIFE_EVENTS_MAX)}</span>
            {atCap && (
              <span id={reasonId} className="hint">
                {t.lifeEventsAtCap(LIFE_EVENTS_MAX)}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
