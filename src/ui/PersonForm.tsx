/**
 * The birth-data form (#45).
 *
 * It absorbs M2's time-and-place panel rather than sitting beside it: the resolved offset,
 * where it came from, and every caveat are shown next to the fields that produced them, and
 * the user can overrule us. That was the point of building that panel first.
 *
 * All the rules live in `domain/person-form.ts`, so this component is only wiring: hold the
 * draft, show the errors, save the fields that changed. Nothing here decides what is valid.
 */
/**
 * @module PersonForm
 * @purpose Birth-data entry/edit form for a person record (name, place, date/time, calendar/timezone overrides, notes), with resolved-moment feedback and delete.
 * @conventions Thin wiring over domain/person-form.ts's draft/validation/mutation logic; uses PersonForm.messages.ts for en/nl text via useMessages().
 * @exports PersonForm
 */
import { useEffect, useId, useState } from 'react';
import { draftFrom, draftToMutations, timeToHhMm, validateDraft, type Draft } from '../domain/person-form.js';
import { personFormValidationMessages } from '../domain/person-form.messages.js';
import { formatOffset, resolveMoment } from '../time/resolve.js';
import { Button } from './primitives/Button.js';
import { Disclosure } from './primitives/Disclosure.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { BirthPlaceSearch } from './BirthPlaceSearch.js';
import { useMessages } from './messages.js';
import { NEEDS_A_DECISION, PROVENANCE } from './moment-labels.js';
import { personFormMessages } from './PersonForm.messages.js';
import { DateField } from './primitives/DateField.js';
import { NumberField } from './primitives/NumberField.js';
import { ChoiceGroup } from './primitives/ChoiceGroup.js';
import { Select } from './primitives/Select.js';
import { TextAreaField } from './primitives/TextAreaField.js';
import { TextField } from './primitives/TextField.js';
import { TimeField } from './primitives/TimeField.js';
import { PersonNotFound } from './PersonNotFound.js';
import { useStore, useStoreState } from './store-context.js';
import type { Calendar } from '../time/types.js';
import type { TimeAccuracy } from '../domain/person.js';
import { BackLink } from './BackLink.js';
import { PageHeader } from './PageHeader.js';
import { PersonFileActions } from './PersonFileActions.js';
import { sharedMessages } from './shared.messages.js';
import { checkFeatureFlag, initProfileOverlay, loadOverlayConfig } from './profile-overlay.js';

function accuracyOptions(t: typeof personFormMessages.en): Record<TimeAccuracy, string> {
  return {
    recorded: t.accuracyRecorded,
    remembered: t.accuracyRemembered,
    approximate: t.accuracyApproximate,
    unknown: t.accuracyUnknown,
  };
}

/** Whether the record already carries a calendar, offset or timezone override, so the section opens on them. */
function hasOverrides(draft: Draft): boolean {
  return draft.calendar !== 'auto' || draft.offsetOverride.trim() !== '' || draft.zoneOverride.trim() !== '';
}

export function PersonForm({ personId }: { personId: string }): React.JSX.Element {
  const store = useStore();
  const state = useStoreState();
  const person = state.people.get(personId);
  const t = useMessages(personFormMessages);
  const shared = useMessages(sharedMessages);
  const unknownTimeHintId = useId();
  const validationT = useMessages(personFormValidationMessages);

  // The stored person, as a draft, recomputed every render rather than memoized: until the user
  // edits a field, the form must keep tracking the store, so a sync pull that merges in a remote
  // edit while this form is open is not silently hidden behind a mount-time snapshot.
  const opened = person === undefined ? undefined : draftFrom(person);
  const [draft, setDraft] = useState<Draft | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [saved, setSaved] = useState(false);

  // The easter egg (#697), from the saved record, not the draft being edited.
  const civil = person?.moment?.civil;
  const savedDate =
    civil === undefined
      ? undefined
      : `${String(civil.year).padStart(4, '0')}-${String(civil.month).padStart(2, '0')}-${String(civil.day).padStart(2, '0')}`;
  const savedName = person?.displayName ?? '';
  useEffect(() => {
    if (savedDate === undefined) return undefined;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void loadOverlayConfig()
      .then((config) => checkFeatureFlag(savedDate, savedName, config))
      .then((matches) => {
        if (matches && !cancelled) stop = initProfileOverlay();
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [savedDate, savedName]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  const current = draft ?? opened ?? draftFrom(person);
  const unknown = current.timeAccuracy === 'unknown';
  const { errors, moment } = validateDraft(current, validationT);
  const resolved = moment === undefined ? undefined : resolveMoment(moment);

  // `onPick` below needs to update latitude and longitude together: two separate `set` calls in
  // the same handler would both close over this render's `current` and the second would clobber
  // the first's update with its own stale copy of the other field.
  const setFields = (patch: Partial<Draft>): void => {
    setSaved(false);
    setDraft({ ...current, ...patch });
  };

  const set = <K extends keyof Draft>(field: K, value: Draft[K]): void => {
    setFields({ [field]: value });
  };

  const save = (): void => {
    if (opened === undefined || moment === undefined) return;
    const mutations = draftToMutations(personId, current, opened, validationT);
    if (mutations.length === 0) {
      setSaved(true);
      return;
    }
    setSaving(true);
    setSaveError(undefined);
    void store
      .mutate(mutations)
      .then(() => {
        setSaved(true);
        // The draft is deliberately not reset to the stored person here. The store's state is
        // already the authority, and re-deriving the draft would fight the user's cursor.
      })
      .catch((cause: unknown) => {
        setSaveError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setSaving(false);
      });
  };

  const remove = (): void => {
    void store.remove('person', personId).then(
      () => {
        window.location.hash = '#/people';
      },
      (cause: unknown) => {
        setSaveError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  };

  return (
    <main className="shell">
      <BackLink fallback="#/people" label={shared.people} />
      {/* Save changes sits in the page header, aligned with the title (#896, overrides D-795b). */}
      <PageHeader title={current.displayName.trim() === '' ? t.newPerson : current.displayName}>
        <div className="birth-record-save">
          <Button variant="primary" onClick={save} disabled={saving || moment === undefined}>
            {saving ? t.saving : t.saveButton}
          </Button>
          {saved && !saving && (
            <span className="status" role="status">
              {t.savedStatus}
            </span>
          )}
          {moment === undefined && (
            <span className="muted">
              {/* Why the button is disabled, next to the button. A disabled control with no
                  explanation is the most common way a form wastes someone's afternoon. */}
              {t.fillFieldsHint}
            </span>
          )}
        </div>
      </PageHeader>
      <p className="tagline">{t.tagline}</p>

      {saveError !== undefined && <StatusMessage kind="error">{t.saveFailed(saveError)}</StatusMessage>}

      <h2>{t.birthRecordHeading}</h2>

      {/* Two columns of cards (#795, #896). The left column holds identity, place and notes; the right column holds
          export, replace and danger. The DOM order is the narrow (single-column) order; see app.css for the columns. */}
      <div className="birth-record">
        <div className="birth-record-column">
          <section className="birth-record-card birth-record-card--identity" aria-labelledby="birth-card-identity">
            <h3 id="birth-card-identity">{t.identityCardHeading}</h3>
            <TextField
              label={t.nameLabel}
              value={current.displayName}
              error={errors.displayName}
              onChange={(value) => {
                set('displayName', value);
              }}
            />
            <div className="birth-record-timestamp">
              <DateField
                label={t.dateLabel}
                value={current.date}
                error={errors.date}
                onChange={(value) => {
                  set('date', value);
                }}
              />
              <Select
                label={t.timeKnownLabel}
                value={current.timeAccuracy}
                options={Object.entries(accuracyOptions(t)).map(([value, text]) => ({ value, label: text }))}
                onChange={(value) => {
                  set('timeAccuracy', value as TimeAccuracy);
                }}
              />
              <TimeField
                label={t.timeLabel}
                step={60}
                value={timeToHhMm(current.time)}
                disabled={unknown}
                error={errors.time}
                extraDescribedBy={unknown ? `${unknownTimeHintId}-reason` : undefined}
                onChange={(value) => {
                  set('time', value);
                }}
              />
            </div>
            {unknown && (
              <div>
                <p id={`${unknownTimeHintId}-reason`} className="hint">
                  {t.timeUnavailableReason}
                </p>
                <p id={unknownTimeHintId} className="hint">
                  {t.unknownTimeHint}
                </p>
              </div>
            )}
          </section>

          <section className="birth-record-card birth-record-card--location" aria-labelledby="birth-card-location">
            <h3 id="birth-card-location">{t.locationCardHeading}</h3>
            <BirthPlaceSearch
              onPick={(lat, lng, placeLabel) => {
                setFields({
                  latitude: String(lat),
                  longitude: String(lng),
                  ...(placeLabel === undefined ? {} : { placeLabel }),
                });
              }}
            />
            {/* A label, not a lookup: the coordinates below are what the calculation uses, and this text is only
              for the reader. "Search for a place by name" above can fill it in from a search result, but the
              result is still just typed text afterward — never re-derived or locked (#290). */}
            <TextField
              label={t.placeOfBirthLabel}
              placeholder={t.placeOfBirthPlaceholder}
              value={current.placeLabel}
              onChange={(value) => {
                set('placeLabel', value);
              }}
            />
            <div className="birth-record-coordinates">
              {/* The raw text, not `valueAsNumber`: a half-typed "-" is a work in progress, and reading it as a
                number would turn it into a coordinate of zero. */}
              <NumberField
                label={t.latitudeLabel}
                step="any"
                placeholder="38.7478"
                value={current.latitude}
                error={errors.latitude}
                onChange={(value) => {
                  set('latitude', value);
                }}
              />
              <NumberField
                label={t.longitudeLabel}
                step="any"
                placeholder="-85.0672"
                value={current.longitude}
                error={errors.longitude}
                onChange={(value) => {
                  set('longitude', value);
                }}
              />
            </div>
            {/* The resolved timezone, as one compact status row at the foot of this card (#896). Its details and the
              overrides sit behind Show details, so the raw timezone strings (D-795a) stay one click away. */}
            <div className="birth-record-timezone">
              <p className="birth-record-timezone-row">
                <span className="birth-record-timezone-status">
                  {resolved === undefined ? t.timezoneNotResolved : t.timezoneResolved}
                </span>
                {resolved !== undefined && (
                  <>
                    <span>{resolved.zone ?? <span className="muted">{t.noneOffsetFromLongitude}</span>}</span>
                    <span>{formatOffset(resolved.offsetMinutes)}</span>
                  </>
                )}
              </p>
              {resolved !== undefined && resolved.warnings.length > 0 && (
                <div>
                  <h4>{t.worthCheckingHeading}</h4>
                  <ul className="warnings">
                    {resolved.warnings.map((warning) => (
                      <li
                        key={warning.code}
                        className={NEEDS_A_DECISION.includes(warning.code) ? 'warning' : undefined}
                        role={NEEDS_A_DECISION.includes(warning.code) ? 'alert' : undefined}
                      >
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Disclosure
                title={t.timezoneDetailsTitle}
                showLabel={t.timezoneShowDetails}
                hideLabel={t.timezoneHideDetails}
                defaultOpen={opened !== undefined && hasOverrides(opened)}
              >
                <div className="birth-record-timezone-details">
                  {resolved !== undefined && (
                    <>
                      <dl>
                        <dt>{t.utcOffsetLabel}</dt>
                        <dd>{formatOffset(resolved.offsetMinutes)}</dd>
                        <dt>{t.derivedFromLabel}</dt>
                        <dd>{PROVENANCE[resolved.provenance]}</dd>
                        <dt>{t.calendarResolvedLabel}</dt>
                        <dd>{resolved.calendar === 'julian' ? t.calendarJulian : t.calendarGregorian}</dd>
                        {resolved.alternativeOffsetMinutes.length > 0 && (
                          <>
                            <dt>{t.alsoValidLabel}</dt>
                            <dd>{resolved.alternativeOffsetMinutes.map(formatOffset).join(', ')}</dd>
                          </>
                        )}
                        {/* The raw debug string is always shown (D-795a): a tabular-numerals value. */}
                        <dt>{t.tzdbLabel}</dt>
                        <dd>
                          <span className="birth-record-raw">{resolved.tzdbFingerprint}</span>
                        </dd>
                      </dl>
                      <p className="hint">{t.tzdbHint}</p>
                    </>
                  )}
                  <Disclosure
                    title={t.overridesTitle}
                    showLabel={t.overridesShow}
                    hideLabel={t.overridesHide}
                    defaultOpen={opened !== undefined && hasOverrides(opened)}
                  >
                    <div className="birth-record-overrides">
                      <div className="primitive-choice-field">
                        <span className="primitive-field-label">{t.calendarLabel}</span>
                        <ChoiceGroup
                          label={t.calendarLabel}
                          value={current.calendar}
                          options={[
                            { value: 'auto', label: t.calendarAutomatic },
                            { value: 'gregorian', label: t.calendarGregorian },
                            { value: 'julian', label: t.calendarJulian },
                          ]}
                          onChange={(value) => {
                            set('calendar', value as Calendar);
                          }}
                        />
                      </div>
                      <NumberField
                        label={t.utcOffsetOverrideLabel}
                        step="any"
                        placeholder={t.offsetOverridePlaceholder}
                        value={current.offsetOverride}
                        error={errors.offsetOverride}
                        onChange={(value) => {
                          set('offsetOverride', value);
                        }}
                      />
                      <TextField
                        label={t.timezoneOverrideLabel}
                        placeholder={t.timezoneOverridePlaceholder}
                        value={current.zoneOverride}
                        onChange={(value) => {
                          set('zoneOverride', value);
                        }}
                      />
                      <p className="hint">{t.timezoneHint}</p>
                    </div>
                  </Disclosure>
                </div>
              </Disclosure>
            </div>
          </section>

          <section className="birth-record-card birth-record-card--notes" aria-labelledby="birth-card-notes">
            <h3 id="birth-card-notes">{t.notesCardHeading}</h3>
            <TextAreaField
              label={t.notesLabel}
              hideLabel
              rows={3}
              value={current.notes}
              onChange={(value) => {
                set('notes', value);
              }}
            />
          </section>
        </div>

        <div className="birth-record-column">
          <PersonFileActions
            person={person}
            accuracyLabels={accuracyOptions(t)}
            onReplaced={() => {
              setDraft(undefined);
            }}
          />

          <section className="birth-record-card birth-record-card--danger" aria-labelledby="birth-card-danger">
            <h3 id="birth-card-danger">{t.deleteHeading}</h3>
            <p className="hint">{t.deleteHint}</p>
            <p>
              <button type="button" className="danger" onClick={remove}>
                {t.deleteButton(current.displayName.trim() === '' ? t.thisPerson : current.displayName)}
              </button>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
