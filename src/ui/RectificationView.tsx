/**
 * Birth-time rectification (#408): for a birth date and place with an uncertain time, test
 * candidate times against dated life events and rank them (`astrology/rectification.ts` states the
 * method). Lives inside `Stored` because a stored person can pre-fill the form; the search itself
 * needs only the ephemeris.
 *
 * Presented as a narrowing aid, never a verdict: the caveat is on the screen above the result, and
 * each time is shown with its lift over the average candidate, so a flat field cannot pass for an
 * answer.
 */
/**
 * @module RectificationView
 * @purpose Birth-time rectification screen: tests candidate birth times for a known date/place against dated life events and ranks them by lift of the solar-arc/transit contact count over the window average.
 * @conventions Scoring method citation pending (#1445), stated on the page with the method and its limits; each event has an include toggle (all on by default, kept in component state for the session) that re-scores the tested candidates without a new search; only a lift above 1.0 is highlighted, others read "explains the events no better than chance"; shows the reported time (never changed) and the optional rectified time, labelled an estimate, with its source note; "Promote to rectified time" writes `rectifiedTimeMutation` through the person operation log and is disabled with a stated reason (methodology citation pending while `RECTIFICATION_CITATION_RECORDED` is false). Optional pre-fill from a stored person; for a chosen person the life events are read from and written back to that person's `lifeEvents` register (#1399) on leaving a row, on add and on remove, and an unreadable stored list is shown as a warning and never overwritten; with no person the events stay local; uses RectificationView.messages.ts for en/nl text via useMessages(). Laid out as a tool page (#1065): birth-details form and life-events panel side by side, candidate results full width below (`.tool-layout`).
 * @exports RectificationView
 */
import { GlossaryText } from './GlossaryText.js';
import { formatFixed, formatOrb } from './format.js';
import { Badge } from './primitives/Badge.js';
import { Button } from './primitives/Button.js';
import { Checkbox } from './primitives/Checkbox.js';
import { Disclosure } from './primitives/Disclosure.js';
import { Tooltip } from './primitives/Tooltip.js';
import { StatList } from './primitives/StatList.js';
import { DateField } from './primitives/DateField.js';
import { apiErrorText } from './api-error.js';
import { Select } from './primitives/Select.js';
import { TextField } from './primitives/TextField.js';
import { TimeField } from './primitives/TimeField.js';
import { useMemo, useRef, useState } from 'react';
import { SIGNS } from '../astrology/signs.js';
import { runRectification, type TimedCandidate } from '../domain/rectification.js';
import { isSpike, rescoreForEvents, type RescoredCandidate } from '../astrology/rectification-lift.js';
import {
  promotionBlock,
  RECTIFICATION_CITATION_RECORDED,
  rectifiedTimeMutation,
  rectifiedTimeNote,
} from '../domain/rectified-time.js';
import { BirthPlaceSearch } from './BirthPlaceSearch.js';
import { aspectDisplayName, bodyDisplayName, signDisplayName } from './astro-names.messages.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { ordered } from './people-list.js';
import {
  eventNoonParts,
  parseRectificationFields,
  RECTIFICATION_STEP_MINUTES,
  type EventField,
  type RectificationFieldError,
} from './rectification.js';
import { rectificationViewMessages } from './RectificationView.messages.js';
import { SortableTable, csvExportTable, useCsvExports } from './SortableTable.js';
import { useStore, useStoreState } from './store-context.js';
import { LIFE_EVENTS_MAX, lifeEventsMutation } from '../domain/life-events.js';
import { personFormMessages } from './PersonForm.messages.js';
import {
  lifeEventsChanged,
  rowsFromEvents,
  rowsToEvents,
  validateLifeEventRows,
  type LifeEventRow,
} from './life-events-draft.js';
import type { TableColumn } from './table-sort.js';
import type { Locale } from '../interpretation/schema.js';
import { Notice } from './primitives/Notice.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { PageHeader } from './PageHeader.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../astrology/rulership.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import { useCalculationBasisLine } from './calculation-basis.js';

/** How many of the best candidates are listed, and given a detail section. */
const SHOWN = 15;
const DETAILED = 5;

type Result =
  | { readonly kind: 'idle' }
  | { readonly kind: 'testing' }
  | {
      readonly kind: 'ready';
      readonly candidates: readonly TimedCandidate[];
      readonly tested: number;
      readonly events: readonly EventField[];
      /** The id of the row each searched event came from, so a toggle maps to the event's contacts. */
      readonly eventIds: readonly string[];
    }
  | { readonly kind: 'error'; readonly message: string };

function blankEvent(): LifeEventRow {
  return { id: crypto.randomUUID(), date: '', time: '', label: '' };
}

/** `Aquarius 19°24'` for a longitude, rounded to the minute. */
function signPosition(longitude: number, locale: Locale): string {
  const totalMinutes = Math.round((((longitude % 360) + 360) % 360) * 60) % (360 * 60);
  const signIndex = Math.floor(totalMinutes / (30 * 60));
  const within = totalMinutes - signIndex * 30 * 60;
  const name = signDisplayName(SIGNS[signIndex]?.name ?? '', locale);
  return `${name} ${String(Math.floor(within / 60))}°${String(within % 60).padStart(2, '0')}'`;
}

export function RectificationView(): React.JSX.Element {
  const t = useMessages(rectificationViewMessages);
  const basisLine = useCalculationBasisLine(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);
  const [locale] = useLocale();
  const state = useStoreState();
  const store = useStore();
  const tPerson = useMessages(personFormMessages);
  const { provider } = useEphemerisProvider();
  const people = useMemo(() => ordered(state.people), [state.people]);

  const [personId, setPersonId] = useState('');
  const [fields, setFields] = useState({
    birthDate: '',
    latitude: '',
    longitude: '',
    fromTime: '00:00',
    toTime: '23:55',
  });
  const [zone, setZone] = useState<{ zoneOverride?: string; offsetOverrideMinutes?: number }>({});
  const [stepMinutes, setStepMinutes] = useState(5);
  // Rows keep the stored event's id and time so that saving back to the person (#1399) never drops either.
  const [events, setEvents] = useState<readonly LifeEventRow[]>([blankEvent()]);
  const [saveError, setSaveError] = useState<string>();
  // Events left out of the score, by row id: empty means every event is included (the default). Kept for the session only.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [promoteError, setPromoteError] = useState<string>();
  const [fieldError, setFieldError] = useState<RectificationFieldError>();
  const [result, setResult] = useState<Result>({ kind: 'idle' });
  const runId = useRef(0);

  const edit = (patch: Partial<typeof fields>): void => {
    setFields((current) => ({ ...current, ...patch }));
  };

  const choosePerson = (id: string): void => {
    setPersonId(id);
    setSaveError(undefined);
    const chosen = id === '' ? undefined : state.people.get(id);
    if (chosen !== undefined) {
      // Only the events are filled from the person; an unreadable stored list is not shown as events.
      const stored = chosen.lifeEventsUnreadable === true ? [] : rowsFromEvents(chosen.lifeEvents ?? []);
      setEvents(stored.length === 0 ? [blankEvent()] : stored);
    }
    const moment = id === '' ? undefined : state.people.get(id)?.moment;
    if (moment === undefined) {
      setZone({});
      return;
    }
    const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
    edit({
      birthDate: `${pad(moment.civil.year, 4)}-${pad(moment.civil.month)}-${pad(moment.civil.day)}`,
      latitude: String(moment.coordinates.latitude),
      longitude: String(moment.coordinates.longitude),
    });
    setZone({
      ...(moment.zoneOverride === undefined ? {} : { zoneOverride: moment.zoneOverride }),
      ...(moment.offsetOverrideMinutes === undefined ? {} : { offsetOverrideMinutes: moment.offsetOverrideMinutes }),
    });
  };

  const chosenPerson = personId === '' ? undefined : state.people.get(personId);
  const eventsUnreadable = chosenPerson?.lifeEventsUnreadable === true;

  /**
   * Writes the rows back to the chosen person through the same person operation the birth record uses (#1399). Rows
   * with neither a date nor a description are blanks and are left out; if any other row is incomplete nothing is
   * written yet. An unreadable stored list is never overwritten.
   */
  const saveEvents = (rows: readonly LifeEventRow[]): void => {
    if (chosenPerson === undefined || eventsUnreadable) return;
    const filled = rows.filter((row) => row.date !== '' || row.label.trim() !== '');
    if (validateLifeEventRows(filled, tPerson).size > 0) return;
    if (!lifeEventsChanged(filled, chosenPerson.lifeEvents ?? [])) return;
    setSaveError(undefined);
    const fail = (cause: unknown): void => {
      setSaveError(apiErrorText(cause));
    };
    try {
      store.mutate([lifeEventsMutation(chosenPerson.id, rowsToEvents(filled))]).catch(fail);
    } catch (cause) {
      fail(cause);
    }
  };

  /** Adding and removing a row write at once; editing a row writes when focus leaves it. */
  const changeEvents = (next: readonly LifeEventRow[]): void => {
    setEvents(next);
    saveEvents(next);
  };

  const updateEvent = (index: number, patch: Partial<LifeEventRow>): void => {
    setEvents((current) => current.map((event, i) => (i === index ? { ...event, ...patch } : event)));
  };

  const run = (): void => {
    if (provider === undefined) return;
    const parsed = parseRectificationFields({ ...fields, stepMinutes, events, ...zone });
    if (!parsed.ok) {
      setFieldError(parsed.error);
      return;
    }
    setFieldError(undefined);
    const id = ++runId.current;
    setResult({ kind: 'testing' });
    void (async () => {
      try {
        const eventJds = [];
        for (const event of parsed.events) {
          const parts = eventNoonParts(event.date);
          if (parts === undefined) continue;
          eventJds.push({
            label: event.label,
            jd: await provider.julianDayFromUtc(parts.year, parts.month, parts.day, 12, 0, 0),
          });
        }
        const candidates = await runRectification(provider, { ...parsed.request, events: eventJds });
        if (id === runId.current) {
          setResult({
            kind: 'ready',
            candidates,
            tested: candidates.length,
            events: parsed.events,
            eventIds: events.filter((row) => row.date.trim() !== '').map((row) => row.id),
          });
        }
      } catch (error) {
        if (id === runId.current) {
          setResult({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      }
    })();
  };

  const errorText = (error: RectificationFieldError): string => {
    const messages = t.fieldErrors;
    switch (error.field) {
      case 'eventDate':
        return messages.eventDate(error.index + 1);
      case 'eventBeforeBirth':
        return messages.eventBeforeBirth(error.index + 1);
      default:
        return messages[error.field];
    }
  };

  // The included events re-score the candidates already tested: toggling an event needs no new search.
  const includedIndexes = useMemo(() => {
    const indexes = new Set<number>();
    if (result.kind === 'ready') {
      for (const [index, id] of result.eventIds.entries()) if (!excluded.has(id)) indexes.add(index);
    }
    return indexes;
  }, [result, excluded]);
  const rescored = useMemo<readonly RescoredCandidate<TimedCandidate>[]>(
    () => (result.kind === 'ready' ? rescoreForEvents(result.candidates, includedIndexes) : []),
    [result, includedIndexes],
  );
  const top = rescored.slice(0, SHOWN);
  const best = rescored[0];
  // Gated (#1445): disabled with "methodology citation pending" until a citation for the scoring is recorded.
  const block = promotionBlock({
    citationRecorded: RECTIFICATION_CITATION_RECORDED,
    hasPerson: chosenPerson !== undefined,
    topLift: best?.lift,
  });

  const promote = (): void => {
    if (block !== undefined || chosenPerson === undefined || best === undefined) return;
    setPromoteError(undefined);
    const fail = (cause: unknown): void => {
      setPromoteError(apiErrorText(cause));
    };
    try {
      store
        .mutate([
          rectifiedTimeMutation(chosenPerson.id, {
            time: best.localTime,
            note: rectifiedTimeNote(formatFixed(best.lift, 1)),
          }),
        ])
        .catch(fail);
    } catch (cause) {
      fail(cause);
    }
  };

  const reportedCivil = chosenPerson?.moment?.civil;
  const reportedTime =
    reportedCivil === undefined
      ? undefined
      : `${String(reportedCivil.hour).padStart(2, '0')}:${String(reportedCivil.minute).padStart(2, '0')}`;

  const columns = useMemo<readonly TableColumn<TimedCandidate>[]>(
    () => [
      { key: 'time', label: t.timeColumn, valueOf: (row) => row.localTime },
      {
        key: 'ascendant',
        label: t.ascendantColumn,
        labelHelp: 'ascendant',
        valueOf: (row) => row.ascendant,
        render: (row) => signPosition(row.ascendant, locale),
      },
      {
        key: 'midheaven',
        label: t.midheavenColumn,
        labelHelp: 'midheaven',
        valueOf: (row) => row.midheaven,
        render: (row) => signPosition(row.midheaven, locale),
      },
      { key: 'score', label: t.scoreColumn, valueOf: (row) => row.score, render: (row) => formatFixed(row.score, 2) },
      { key: 'lift', label: t.liftColumn, valueOf: (row) => row.lift, render: (row) => `×${formatFixed(row.lift, 1)}` },
      {
        key: 'verdict',
        label: t.verdictColumn,
        valueOf: (row) => (isSpike(row.lift) ? t.spike : t.noBetterThanChance),
        // Only a lift above 1.0 is highlighted; the text always says it, so colour is never the only carrier.
        renderCell: (row) =>
          isSpike(row.lift) ? (
            <Badge tone="success">{t.spike}</Badge>
          ) : (
            <span className="hint">{t.noBetterThanChance}</span>
          ),
      },
    ],
    [t, locale],
  );

  const describeContact = (contact: TimedCandidate['contacts'][number]): string => {
    const name = (key: string): string => bodyDisplayName(key, locale);
    const orb = formatOrb(contact.orb);
    const aspect = aspectDisplayName(contact.aspect, locale).toLowerCase();
    return contact.technique === 'solar-arc'
      ? t.solarArcContact(name(contact.moving), aspect, name(contact.natal), orb)
      : t.transitContact(name(contact.moving), aspect, name(contact.natal), orb);
  };

  useCsvExports(
    result.kind === 'ready' && top.length > 0
      ? [csvExportTable('candidates', t.tableCaption, 'rectification-candidates.csv', columns, top)]
      : undefined,
  );

  return (
    <main className="shell">
      <PageHeader
        title={t.heading}
        titleTerm="rectification"
        titleAside={
          <Tooltip
            text={t.hint}
            label={t.hintTooltipLabel}
            className="primitive-tooltip-icon primitive-tooltip-superscript"
          >
            ?
          </Tooltip>
        }
        basis={basisLine}
        basisEditHref={null}
        headingLevel={2}
      />
      <Notice>
        <GlossaryText text={t.caveat} />
      </Notice>
      {/* The method is one dropdown: its citation status sits inside it, with the method and its limits (owner review, #1445). */}
      <Disclosure title={t.methodHeading} showLabel={t.showMethod} hideLabel={t.hideMethod}>
        <p>
          <Badge tone="warning">{t.citationPending}</Badge>
        </p>
        <p className="hint">{t.methodBody}</p>
        <p className="hint">{t.methodLimits}</p>
      </Disclosure>

      <div className="tool-layout">
        <section className="tool-card tool-form" aria-labelledby="rectification-search-heading">
          <h2 id="rectification-search-heading">{t.searchHeading}</h2>
          <Select
            label={t.personLabel}
            value={personId}
            options={[
              { value: '', label: t.personNone },
              ...people.map((person) => ({
                value: person.id,
                label: person.displayName === '' ? t.unnamedPerson : person.displayName,
              })),
            ]}
            onChange={choosePerson}
          />
          <DateField
            label={t.birthDateLabel}
            value={fields.birthDate}
            onChange={(value) => {
              edit({ birthDate: value });
              setZone({});
            }}
          />
          <div className="tool-field-row tool-location-grid">
            <div className="tool-location-search">
              <BirthPlaceSearch
                onPick={(latitude, longitude) => {
                  edit({ latitude: String(latitude), longitude: String(longitude) });
                  setZone({});
                }}
              />
            </div>
            <TextField
              label={t.latitudeLabel}
              inputMode="decimal"
              value={fields.latitude}
              onChange={(value) => {
                edit({ latitude: value });
                setZone({});
              }}
            />
            <TextField
              label={t.longitudeLabel}
              inputMode="decimal"
              value={fields.longitude}
              onChange={(value) => {
                edit({ longitude: value });
                setZone({});
              }}
            />
          </div>
          {fieldError !== undefined && <StatusMessage kind="error">{errorText(fieldError)}</StatusMessage>}
          <div className="tool-actions">
            <Button
              variant="primary"
              disabled={provider === undefined}
              busy={result.kind === 'testing'}
              busyLabel={t.testing}
              onClick={run}
            >
              {t.findButton}
            </Button>
          </div>
        </section>

        <section className="tool-card tool-panel" aria-labelledby="rectification-panel-heading">
          <h2 id="rectification-panel-heading">{t.panelHeading}</h2>
          <div className="tool-field-row tool-field-row--three">
            <TimeField
              label={t.fromTimeLabel}
              value={fields.fromTime}
              onChange={(value) => {
                edit({ fromTime: value });
              }}
            />
            <TimeField
              label={t.toTimeLabel}
              value={fields.toTime}
              onChange={(value) => {
                edit({ toTime: value });
              }}
            />
            <Select
              label={t.stepLabel}
              value={String(stepMinutes)}
              options={RECTIFICATION_STEP_MINUTES.map((minutes) => ({
                value: String(minutes),
                label: t.stepOption(minutes),
              }))}
              onChange={(value) => {
                setStepMinutes(Number(value));
              }}
            />
          </div>
          <fieldset className="field-group">
            <legend>{t.eventsLegend}</legend>
            <p className="hint">{t.eventsHint}</p>
            {chosenPerson !== undefined && !eventsUnreadable && <p className="hint">{t.eventsSavedHint}</p>}
            {eventsUnreadable && (
              <StatusMessage kind="partial" detail={t.eventsUnreadableDetail}>
                {tPerson.lifeEventsUnreadable}
              </StatusMessage>
            )}
            {saveError !== undefined && <StatusMessage kind="error">{t.eventsSaveError(saveError)}</StatusMessage>}
            <ul className="rectification-events">
              {events.map((event, index) => (
                <li
                  key={event.id}
                  className="tool-field-row"
                  onBlur={(focus) => {
                    // Typing stays local; the person record is written once focus leaves the row, not per keystroke.
                    if (focus.relatedTarget instanceof Node && focus.currentTarget.contains(focus.relatedTarget))
                      return;
                    saveEvents(events);
                  }}
                >
                  <Checkbox
                    label={t.includeEvent(index + 1)}
                    checked={!excluded.has(event.id)}
                    onChange={(checked) => {
                      setExcluded((current) => {
                        const next = new Set(current);
                        if (checked) next.delete(event.id);
                        else next.add(event.id);
                        return next;
                      });
                    }}
                  />
                  <DateField
                    label={t.eventDateLabel(index + 1)}
                    value={event.date}
                    onChange={(value) => {
                      updateEvent(index, { date: value });
                    }}
                  />
                  <TextField
                    label={t.eventLabelLabel(index + 1)}
                    placeholder={t.eventLabelPlaceholder}
                    value={event.label}
                    onChange={(value) => {
                      updateEvent(index, { label: value });
                    }}
                  />
                  {(events.length > 1 || (chosenPerson !== undefined && (event.date !== '' || event.label !== ''))) && (
                    <Button
                      type="button"
                      variant="quiet"
                      onClick={() => {
                        const rest = events.filter((_, i) => i !== index);
                        changeEvents(rest.length === 0 ? [blankEvent()] : rest);
                      }}
                    >
                      {t.removeEvent(index + 1)}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="quiet"
              disabled={chosenPerson !== undefined && !eventsUnreadable && events.length >= LIFE_EVENTS_MAX}
              onClick={() => {
                changeEvents([...events, blankEvent()]);
              }}
            >
              {t.addEvent}
            </Button>
          </fieldset>
          <h3>{t.timesHeading}</h3>
          <StatList
            items={[
              { label: t.reportedTimeLabel, value: reportedTime ?? t.reportedTimeNone },
              {
                label: t.rectifiedTimeLabel,
                value:
                  chosenPerson?.rectifiedTime === undefined
                    ? t.rectifiedTimeNone
                    : `${t.rectifiedTimeValue(chosenPerson.rectifiedTime.time)} — ${chosenPerson.rectifiedTime.note}`,
              },
            ]}
          />
          <p className="hint">{t.reportedNeverChanged}</p>
          <div className="tool-actions">
            <Button
              type="button"
              variant="primary"
              disabled={block !== undefined}
              aria-describedby={block === undefined ? undefined : 'rectification-promote-reason'}
              onClick={promote}
            >
              {t.promoteButton}
            </Button>
          </div>
          {block !== undefined && (
            <p className="hint" id="rectification-promote-reason">
              {t.promoteReasonPrefix} {t.promoteBlocked[block]}
            </p>
          )}
          {promoteError !== undefined && <StatusMessage kind="error">{promoteError}</StatusMessage>}
        </section>
      </div>

      {/* The result region: busy while the candidates are tested, as the Astrocartography map is. */}
      <div aria-busy={result.kind === 'testing'}>
        {result.kind === 'error' && <StatusMessage kind="error">{t.error(result.message)}</StatusMessage>}

        {result.kind === 'ready' && (
          <>
            <p>{t.summary(result.tested, top.length)}</p>
            <p className="hint">{t.includedCount(includedIndexes.size, result.events.length)}</p>
            {includedIndexes.size === 0 && <StatusMessage kind="partial">{t.noEventsIncluded}</StatusMessage>}
            <SortableTable
              caption={t.tableCaption}
              columns={columns}
              rows={top}
              getRowKey={(row) => String(row.jd)}
              downloadFilename="rectification-candidates.csv"
              selectedRowKey={best !== undefined && isSpike(best.lift) ? String(best.jd) : undefined}
            />
            <h2>{t.detailsHeading}</h2>
            {top.slice(0, DETAILED).map((candidate) => (
              <div key={candidate.jd} className="rectification-detail">
                <Disclosure
                  title={t.detailsSummary(candidate.localTime, formatFixed(candidate.score, 2))}
                  summary={t.contactCount(
                    candidate.contacts.filter((contact) => includedIndexes.has(contact.eventIndex)).length,
                  )}
                  showLabel={t.showDetails}
                  hideLabel={t.hideDetails}
                >
                  {!candidate.contacts.some((contact) => includedIndexes.has(contact.eventIndex)) ? (
                    <p className="hint">
                      <GlossaryText text={t.noContacts} />
                    </p>
                  ) : (
                    <ul>
                      {result.events.map((event, eventIndex) => {
                        if (!includedIndexes.has(eventIndex)) return null;
                        const forEvent = candidate.contacts.filter((contact) => contact.eventIndex === eventIndex);
                        if (forEvent.length === 0) return null;
                        return (
                          <li key={eventIndex}>
                            <strong>{t.forEvent(eventIndex + 1, event.label)}</strong>
                            <ul>
                              {forEvent.map((contact, contactIndex) => (
                                <li key={contactIndex}>{describeContact(contact)}</li>
                              ))}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Disclosure>
              </div>
            ))}
          </>
        )}
      </div>
    </main>
  );
}
