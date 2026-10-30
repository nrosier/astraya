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
 * @purpose Birth-time rectification screen: tests candidate birth times for a known date/place against dated life events and ranks them by solar-arc/transit contact score.
 * @conventions Not person-scoped (optional pre-fill from a stored person); uses RectificationView.messages.ts for en/nl text via useMessages().
 * @exports RectificationView
 */
import { formatFixed, formatOrb } from './format.js';
import { Disclosure } from './primitives/Disclosure.js';
import { DateField } from './primitives/DateField.js';
import { Select } from './primitives/Select.js';
import { TextField } from './primitives/TextField.js';
import { TimeField } from './primitives/TimeField.js';
import { useMemo, useRef, useState } from 'react';
import { SIGNS } from '../astrology/signs.js';
import { runRectification, type TimedCandidate } from '../domain/rectification.js';
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
import { SortableTable } from './SortableTable.js';
import { useStoreState } from './store-context.js';
import type { TableColumn } from './table-sort.js';
import type { Locale } from '../interpretation/schema.js';
import { Notice } from './primitives/Notice.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { BackLink } from './BackLink.js';

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
    }
  | { readonly kind: 'error'; readonly message: string };

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
  const [locale] = useLocale();
  const state = useStoreState();
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
  const [events, setEvents] = useState<readonly EventField[]>([{ date: '', label: '' }]);
  const [fieldError, setFieldError] = useState<RectificationFieldError>();
  const [result, setResult] = useState<Result>({ kind: 'idle' });
  const runId = useRef(0);

  const edit = (patch: Partial<typeof fields>): void => {
    setFields((current) => ({ ...current, ...patch }));
  };

  const choosePerson = (id: string): void => {
    setPersonId(id);
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

  const updateEvent = (index: number, patch: Partial<EventField>): void => {
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
          setResult({ kind: 'ready', candidates, tested: candidates.length, events: parsed.events });
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

  const top = result.kind === 'ready' ? result.candidates.slice(0, SHOWN) : [];

  const columns = useMemo<readonly TableColumn<TimedCandidate>[]>(
    () => [
      { key: 'time', label: t.timeColumn, valueOf: (row) => row.localTime },
      {
        key: 'ascendant',
        label: t.ascendantColumn,
        valueOf: (row) => row.ascendant,
        render: (row) => signPosition(row.ascendant, locale),
      },
      {
        key: 'midheaven',
        label: t.midheavenColumn,
        valueOf: (row) => row.midheaven,
        render: (row) => signPosition(row.midheaven, locale),
      },
      { key: 'score', label: t.scoreColumn, valueOf: (row) => row.score, render: (row) => formatFixed(row.score, 2) },
      { key: 'lift', label: t.liftColumn, valueOf: (row) => row.lift, render: (row) => `×${formatFixed(row.lift, 1)}` },
      { key: 'contacts', label: t.contactsColumn, valueOf: (row) => row.contacts.length },
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

  return (
    <main className="shell">
      <BackLink fallback="#/people" />
      <h1>{t.heading}</h1>
      <p className="hint">{t.hint}</p>
      <Notice>{t.caveat}</Notice>

      <div className="field-grid">
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

      <BirthPlaceSearch
        onPick={(latitude, longitude) => {
          edit({ latitude: String(latitude), longitude: String(longitude) });
          setZone({});
        }}
      />

      <fieldset className="field-group">
        <legend>{t.eventsLegend}</legend>
        <p className="hint">{t.eventsHint}</p>
        <ul className="rectification-events">
          {events.map((event, index) => (
            <li key={index} className="field-grid">
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
              {events.length > 1 && (
                <button
                  type="button"
                  className="quiet"
                  onClick={() => {
                    setEvents((current) => current.filter((_, i) => i !== index));
                  }}
                >
                  {t.removeEvent(index + 1)}
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            setEvents((current) => [...current, { date: '', label: '' }]);
          }}
        >
          {t.addEvent}
        </button>
      </fieldset>

      <p>
        <button type="button" disabled={provider === undefined || result.kind === 'testing'} onClick={run}>
          {result.kind === 'testing' ? t.testing : t.findButton}
        </button>
      </p>

      {fieldError !== undefined && <StatusMessage kind="error">{errorText(fieldError)}</StatusMessage>}
      {result.kind === 'error' && <StatusMessage kind="error">{t.error(result.message)}</StatusMessage>}

      {result.kind === 'ready' && (
        <>
          <p>{t.summary(result.tested, top.length)}</p>
          <SortableTable
            caption={t.tableCaption}
            columns={columns}
            rows={top}
            getRowKey={(row) => String(row.jd)}
            downloadFilename="rectification-candidates.csv"
          />
          <h2>{t.detailsHeading}</h2>
          {top.slice(0, DETAILED).map((candidate) => (
            <div key={candidate.jd} className="rectification-detail">
              <Disclosure
                title={t.detailsSummary(candidate.localTime, formatFixed(candidate.score, 2))}
                summary={t.contactCount(candidate.contacts.length)}
                showLabel={t.showDetails}
                hideLabel={t.hideDetails}
              >
                {candidate.contacts.length === 0 ? (
                  <p className="hint">{t.noContacts}</p>
                ) : (
                  <ul>
                    {result.events.map((event, eventIndex) => {
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
    </main>
  );
}
