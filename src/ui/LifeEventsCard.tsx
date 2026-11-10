/**
 * The Life events card on the birth record (#1399, reshaped in #1439): a read-only summary and the way into the
 * management drawer.
 */
/**
 * @module LifeEventsCard
 * @purpose Compact summary of a person's life events: a Manage (n) button, a read-only preview of the most recent few, the count against the 100-event cap, and the button that opens the management drawer.
 * @conventions Holds no input fields and writes nothing itself; the drawer writes through the person operation log; the Manage (n) button in the header and the primary button open the drawer, and focus returns to the button that opened it; the preview shows the latest 5 events by date, newest first; an unreadable stored list shows a warning and no buttons, so it is never overwritten; empty state is one line and the same button.
 * @exports LifeEventsCard, LIFE_EVENTS_PREVIEW_MAX
 */
import { useId, useRef, useState } from 'react';
import { LIFE_EVENTS_MAX, sortLifeEvents, type LifeEvent } from '../domain/life-events.js';
import { LifeEventsDrawer } from './LifeEventsDrawer.js';
import { lifeEventsCardMessages } from './LifeEventsCard.messages.js';
import { useMessages } from './messages.js';
import { personFormMessages } from './PersonForm.messages.js';
import { Button } from './primitives/Button.js';
import { StatusMessage } from './primitives/StatusMessage.js';

/** The most events the card previews. */
export const LIFE_EVENTS_PREVIEW_MAX = 5;

export interface LifeEventsCardProps {
  readonly personId: string;
  readonly personName: string;
  readonly events: readonly LifeEvent[];
  /** The stored list exists but cannot be read; nothing is editable and the stored value is left alone. */
  readonly unreadable: boolean;
}

export function LifeEventsCard({ personId, personName, events, unreadable }: LifeEventsCardProps): React.JSX.Element {
  const t = useMessages(lifeEventsCardMessages);
  const tPerson = useMessages(personFormMessages);
  const headingId = useId();
  // Whichever control opened the drawer gets focus back.
  const opener = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const preview = sortLifeEvents(events).slice(-LIFE_EVENTS_PREVIEW_MAX).reverse();

  return (
    <section className="birth-record-card birth-record-card--life-events" aria-labelledby={headingId}>
      {unreadable ? (
        <>
          <h3 id={headingId}>{tPerson.lifeEventsHeading}</h3>
          <StatusMessage kind="partial" detail={tPerson.lifeEventsUnreadableDetail}>
            {tPerson.lifeEventsUnreadable}
          </StatusMessage>
        </>
      ) : (
        <>
          <div className="life-events-card-header">
            <h3 id={headingId}>{tPerson.lifeEventsHeading}</h3>
            <Button
              size="compact"
              onClick={(event) => {
                opener.current = event.currentTarget;
                setOpen(true);
              }}
            >
              {t.manage(events.length)}
            </Button>
          </div>
          {preview.length === 0 ? (
            <p className="muted">{t.empty}</p>
          ) : (
            <ul className="life-events-preview" aria-label={t.previewLabel}>
              {preview.map((event) => (
                <li key={event.id}>
                  <span className="life-events-preview-date">{event.date}</span>
                  <span className="life-events-preview-label">{event.label}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="life-events-footer">
            {events.length > 0 && <span className="muted">{t.showing(events.length, LIFE_EVENTS_MAX)}</span>}
            <Button
              variant="primary"
              onClick={(event) => {
                opener.current = event.currentTarget;
                setOpen(true);
              }}
            >
              {t.manageButton}
            </Button>
          </div>
          <LifeEventsDrawer
            open={open}
            personId={personId}
            personName={personName}
            events={events}
            returnFocusTo={opener}
            onClose={() => {
              setOpen(false);
            }}
          />
        </>
      )}
    </section>
  );
}
