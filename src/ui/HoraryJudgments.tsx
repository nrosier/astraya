/**
 * The saved horary judgments card (#1960): lists what the account holds, reopens one to read what was judged when it
 * was saved, and deletes one after a confirmation. Reopening shows the stored record and never recomputes it.
 */
/**
 * @module HoraryJudgments
 * @purpose Renders the Saved judgments card of the Horary screen: the saved judgments (question and saved date), a read-only reopen view of the stored question, moment, place, house system and summary, and a confirmed delete.
 * @conventions Thin: folding, sorting and refusals live in `store/horary-judgments`; a delete goes through `Store.remove` behind a `StagedDialog` that names the judgment and the consequence; there is deliberately no permanent-erase control (owner decision D2, #1960); an unreadable judgment is listed as could-not-be-read with no detail and can only be deleted; the reopen view reads only the stored record and never calls the ephemeris or the judgment code. Text comes from `HoraryView.messages.ts`.
 * @exports HoraryJudgments
 */
import { useRef, useState } from 'react';
import { decodeHlc, isHlc } from '../store/hlc.js';
import {
  HORARY_JUDGMENT_ENTITY,
  sortedHoraryJudgments,
  type HoraryJudgmentRecord,
  type SavedHoraryJudgment,
} from '../store/horary-judgments.js';
import type { Store } from '../store/store.js';
import { formatOffset } from '../time/resolve.js';
import { formatCivilDate, formatCoordinate, formatFixed, formatTimestamp } from './format.js';
import { GlossaryText } from './GlossaryText.js';
import { horaryViewMessages } from './HoraryView.messages.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { EmptyState } from './primitives/EmptyState.js';
import { StagedDialog } from './primitives/StagedDialog.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useOptionalStore, useStoreState } from './store-context.js';

type Messages = (typeof horaryViewMessages)['en'];

export function HoraryJudgments(): React.JSX.Element {
  const store = useOptionalStore();
  const t = useMessages(horaryViewMessages);
  return (
    <section className="horary-card horary-saved" aria-labelledby="horary-saved-heading">
      <h2 id="horary-saved-heading">{t.savedHeading}</h2>
      <p className="hint">{t.savedScopeNote}</p>
      {store === undefined ? (
        <StatusMessage kind="loading">{t.savedUnavailable}</StatusMessage>
      ) : (
        <Panel store={store} />
      )}
    </section>
  );
}

function savedDate(savedAt: string): string | undefined {
  return isHlc(savedAt) ? formatTimestamp(decodeHlc(savedAt).millis) : undefined;
}

function Panel({ store }: { readonly store: Store }): React.JSX.Element {
  const t = useMessages(horaryViewMessages);
  const state = useStoreState();
  const [openId, setOpenId] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<SavedHoraryJudgment>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const deleteTrigger = useRef<HTMLElement | null>(null);
  const openedHeading = useRef<HTMLHeadingElement>(null);

  const judgments = sortedHoraryJudgments(state.horaryJudgments);
  const label = (judgment: SavedHoraryJudgment): string =>
    judgment.question.trim() === '' ? t.noQuestion : judgment.question;
  const opened = judgments.find((judgment) => judgment.id === openId && judgment.status === 'ready');

  const confirmDelete = (): void => {
    const target = pendingDelete;
    if (target === undefined) return;
    setPendingDelete(undefined);
    setError(undefined);
    void store
      .remove(HORARY_JUDGMENT_ENTITY, target.id)
      .then(() => {
        if (openId === target.id) setOpenId(undefined);
        setMessage(t.deleted(label(target)));
      })
      .catch((cause: unknown) => {
        setMessage(undefined);
        setError(`${t.saveFailed} ${cause instanceof Error ? cause.message : String(cause)}`);
      });
  };

  return (
    <>
      {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
      {error === undefined && message !== undefined && <StatusMessage kind="success">{message}</StatusMessage>}

      {judgments.length === 0 ? (
        <EmptyState message={t.savedEmpty} />
      ) : (
        <ul className="people saved-query-list horary-saved-list">
          {judgments.map((judgment) => {
            const when = savedDate(judgment.savedAt);
            return (
              <li key={judgment.id}>
                <span className="person">
                  <span className={judgment.question.trim() === '' ? 'name unnamed' : 'name'}>{label(judgment)}</span>
                  <span className="summary">
                    {judgment.status === 'ready'
                      ? when === undefined
                        ? undefined
                        : t.savedOn(when)
                      : t.couldNotBeRead}
                  </span>
                </span>
                {judgment.status === 'ready' && (
                  <Button
                    aria-label={t.openLabel(label(judgment))}
                    aria-expanded={openId === judgment.id}
                    onClick={() => {
                      setOpenId(judgment.id);
                      setMessage(undefined);
                      // Focus moves to the opened judgment so a keyboard or screen-reader user lands on it.
                      requestAnimationFrame(() => {
                        openedHeading.current?.focus();
                      });
                    }}
                  >
                    {t.open}
                  </Button>
                )}
                <Button
                  variant="danger"
                  aria-label={t.deleteLabel(label(judgment))}
                  disabled={!store.writable}
                  onClick={(event) => {
                    deleteTrigger.current = event.currentTarget;
                    setPendingDelete(judgment);
                  }}
                >
                  {t.delete}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {opened?.status === 'ready' && (
        <section className="horary-saved-opened" aria-labelledby="horary-saved-opened-heading">
          <div className="horary-saved-opened-header">
            <h3 id="horary-saved-opened-heading" ref={openedHeading} tabIndex={-1}>
              {t.openedHeading}
            </h3>
            <Button
              onClick={() => {
                setOpenId(undefined);
              }}
            >
              {t.close}
            </Button>
          </div>
          <p className="hint">{t.openedNote}</p>
          <SavedRecord question={label(opened)} record={opened.record} t={t} />
        </section>
      )}

      <StagedDialog
        open={pendingDelete !== undefined}
        heading={t.deleteHeading}
        closeLabel={t.deleteClose}
        onDiscard={() => {
          setPendingDelete(undefined);
        }}
        returnFocusTo={deleteTrigger}
        footer={
          <>
            <Button
              onClick={() => {
                setPendingDelete(undefined);
              }}
            >
              {t.deleteCancel}
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              {t.deleteConfirm}
            </Button>
          </>
        }
      >
        <p>{pendingDelete === undefined ? undefined : t.deleteConsequence(label(pendingDelete))}</p>
      </StagedDialog>
    </>
  );
}

/** The stored record, read as stored: nothing here is recalculated. */
function SavedRecord({
  question,
  record,
  t,
}: {
  readonly question: string;
  readonly record: HoraryJudgmentRecord;
  readonly t: Messages;
}): React.JSX.Element {
  const [locale] = useLocale();
  const { civil, coordinates, summary } = record;
  const time = `${String(civil.hour).padStart(2, '0')}:${String(civil.minute).padStart(2, '0')}`;
  const place =
    record.placeLabel ??
    `${formatCoordinate(coordinates.latitude, 'lat', locale)} ${formatCoordinate(coordinates.longitude, 'lon', locale)}`;
  const applying = summary.considerations.filter((c) => c.applies && !c.softened).length;
  return (
    <dl className="horary-saved-record">
      <dt>{t.openedQuestion}</dt>
      <dd>{question}</dd>
      <dt>{t.openedMoment}</dt>
      <dd>{t.momentLine(formatCivilDate(civil, locale), time, formatOffset(record.witness.offsetMinutes))}</dd>
      <dt>{t.openedPlace}</dt>
      <dd>{place}</dd>
      <dt>{t.openedHouseSystem}</dt>
      <dd>{t.houseSystems[record.houseSystem] ?? record.houseSystem}</dd>
      <dt>{t.openedSummary}</dt>
      <dd>
        <p>
          <GlossaryText
            text={t.significators(summary.querent.rulerKey, summary.quesited.rulerKey, summary.quesited.house)}
          />
        </p>
        <p>
          <GlossaryText text={t.perfection[summary.perfection.kind]} />
        </p>
        {summary.perfection.timeToPerfectDays !== undefined && (
          <p className="hint">{t.timing(formatFixed(summary.perfection.timeToPerfectDays, 1))}</p>
        )}
        <p>{t.reception[summary.reception.kind]}</p>
        {summary.receptionAidsPerfection && <p className="hint">{t.receptionAidsPerfection}</p>}
      </dd>
      <dt>{t.openedConsiderations}</dt>
      <dd>
        <p>
          {summary.radical
            ? summary.considerations.some((c) => c.applies)
              ? t.radicalWithSoftened
              : t.radical
            : t.notRadical(applying)}
        </p>
        <ul className="horary-saved-considerations">
          {summary.considerations.map((consideration) => (
            <li key={consideration.key}>
              <strong>{t.considerations[consideration.key]?.label ?? consideration.key}</strong>
              {' — '}
              {consideration.applies ? (consideration.softened ? t.appliesSoftened : t.applies) : t.clear}
            </li>
          ))}
        </ul>
      </dd>
    </dl>
  );
}
