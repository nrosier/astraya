/**
 * @module ui/PersonFileActions
 * @purpose The birth-record page's export and import of one person (#699, #896): an export card with one row of AAF, JSON and CSV downloads, and a separate Replace data card that replaces this person's birth data from an AAF or Astraya JSON file after a preview.
 * @conventions Reuses the backup's writers (`peopleToAaf`, `buildFullExport`, `peopleToCsv`) with one person, and `domain/person-file.ts` to read and stage; the store is written only on Replace, in one `store.mutate`. CSV is export only. Returns two sibling cards for the birth-record right-hand column. Not registered in the page header's Export menu (#896): the EXPORT card is the only place these downloads live.
 * @exports PersonFileActions
 */
import { Fragment, useState } from 'react';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import { peopleToAaf } from '../domain/aaf-people.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { buildFullExport, peopleToCsv, type ExportedPerson } from '../domain/full-export.js';
import type { Person, TimeAccuracy } from '../domain/person.js';
import { readPersonFile, stagePersonReplace, type PersonChange } from '../domain/person-file.js';
import { APP_VERSION } from '../version.js';
import { readDefaultCalculationProfile } from './default-calculation-profile.js';
import { downloadText } from './download.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { useMessages } from './messages.js';
import { personFileActionsMessages } from './PersonFileActions.messages.js';
import { preferencesViewMessages } from './PreferencesView.messages.js';
import { Button } from './primitives/Button.js';
import { FileInput } from './primitives/FileInput.js';
import { Select } from './primitives/Select.js';
import { StatusMessage, type StatusKind } from './primitives/StatusMessage.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { useStore } from './store-context.js';
import { useSymbolClass } from './symbol-setting.js';
import { useLocale } from './locale.js';
import { formatCoordinate } from './format.js';
import type { Coordinates } from '../time/types.js';

interface Status {
  readonly kind: StatusKind;
  readonly text: string;
}

export function PersonFileActions({
  person,
  accuracyLabels,
  onReplaced,
}: {
  readonly person: Person;
  readonly accuracyLabels: Readonly<Record<TimeAccuracy, string>>;
  /** Called after a replace is saved, so the form drops any unsaved draft and shows the new record. */
  readonly onReplaced: () => void;
}): React.JSX.Element {
  const store = useStore();
  const { provider } = useEphemerisProvider();
  const { rulership } = usePersonCalculationSettings(person.id);
  const [symbolClass] = useSymbolClass();
  const t = useMessages(personFileActionsMessages);
  const [locale] = useLocale();
  const preferencesT = useMessages(preferencesViewMessages);
  const [exportStatus, setExportStatus] = useState<Status | undefined>(undefined);
  const [importStatus, setImportStatus] = useState<Status | undefined>(undefined);
  const [candidates, setCandidates] = useState<readonly ExportedPerson[]>([]);
  const [chosen, setChosen] = useState(0);
  const [saving, setSaving] = useState(false);

  const filename = (extension: string): string => deriveExportFilename(person.displayName, 'birth-record', extension);

  const exportAaf = (): void => {
    const { text, skipped } = peopleToAaf([person]);
    if (skipped.length > 0) {
      setExportStatus({ kind: 'error', text: t.exportAafNeedsBirth });
      return;
    }
    downloadText(filename('aaf'), text, 'text/plain');
    setExportStatus({ kind: 'success', text: t.exported('AAF') });
  };
  const exportJson = (): void => {
    if (provider === undefined) {
      setExportStatus({ kind: 'error', text: t.exportNeedsEngine });
      return;
    }
    const settings = readDefaultCalculationProfile()?.settings ?? DEFAULT_EXTENDED_SETTINGS;
    void buildFullExport({
      people: [person],
      provider,
      appVersion: APP_VERSION,
      settings,
      rulership,
      symbolClass,
      now: new Date(),
    })
      .then((archive) => {
        downloadText(filename('json'), `${JSON.stringify(archive, null, 2)}\n`, 'application/json');
        setExportStatus({ kind: 'success', text: t.exported('Astraya JSON') });
      })
      .catch((error: unknown) => {
        setExportStatus({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
      });
  };
  const exportCsv = (): void => {
    downloadText(filename('csv'), peopleToCsv([person]), 'text/csv');
    setExportStatus({ kind: 'success', text: t.exported('CSV') });
  };
  const onFileChosen = (file: File | undefined): void => {
    if (file === undefined) return;
    setCandidates([]);
    setChosen(0);
    setImportStatus({ kind: 'loading', text: t.reading });
    void file.text().then(
      (text) => {
        const read = readPersonFile(text);
        if (!read.ok) {
          const { error } = read;
          const firstAaf = error.kind === 'no-people' ? error.aafErrors[0] : undefined;
          setImportStatus({
            kind: 'error',
            text:
              error.kind === 'not-json'
                ? preferencesT.restoreInvalidJson
                : error.kind === 'invalid-export'
                  ? preferencesT.restoreInvalid(error.error)
                  : firstAaf === undefined
                    ? t.noPeople
                    : `${t.noPeople} ${preferencesT.restoreAafErrors(error.aafErrors.length, `line ${String(firstAaf.line)}: ${firstAaf.message}`)}`,
          });
          return;
        }
        setCandidates(read.people);
        setImportStatus(undefined);
      },
      (error: unknown) => {
        setImportStatus({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
      },
    );
  };

  const incoming = candidates[chosen];
  const staged = incoming === undefined ? undefined : stagePersonReplace(person, incoming);
  const place = (coordinates: Coordinates | undefined): string =>
    coordinates === undefined
      ? t.empty
      : `${formatCoordinate(coordinates.latitude, 'lat', locale)}, ${formatCoordinate(coordinates.longitude, 'lon', locale)}`;
  const describe = (change: PersonChange): string => {
    if (change.field === 'timeAccuracy') return t.change(accuracyLabels[change.before], accuracyLabels[change.after]);
    if (change.field === 'coordinates') return t.change(place(change.before), place(change.after));
    return t.change(change.before === '' ? t.empty : change.before, change.after === '' ? t.empty : change.after);
  };

  const cancel = (): void => {
    setCandidates([]);
    setChosen(0);
  };
  const confirm = (): void => {
    if (staged === undefined || staged.mutations.length === 0) return;
    setSaving(true);
    setImportStatus({ kind: 'updating', text: t.applying });
    void store
      .mutate(staged.mutations)
      .then(() => {
        cancel();
        onReplaced();
        setImportStatus({ kind: 'success', text: t.applied });
      })
      .catch((error: unknown) => {
        setImportStatus({ kind: 'error', text: t.failed(error instanceof Error ? error.message : String(error)) });
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <div className="person-file-actions">
      <section className="birth-record-card birth-record-card--files" aria-labelledby="person-file-heading">
        <h3 id="person-file-heading">{t.heading}</h3>
        <p className="hint">{t.exportHint}</p>
        <div className="birth-record-export-row" role="group" aria-label={t.exportGroupLabel}>
          <Button size="compact" onClick={exportAaf}>
            {t.exportAaf}
          </Button>
          <Button size="compact" onClick={exportJson}>
            {t.exportJson}
          </Button>
          <Button size="compact" onClick={exportCsv}>
            {t.exportCsv}
          </Button>
        </div>
        {exportStatus !== undefined && <StatusMessage kind={exportStatus.kind}>{exportStatus.text}</StatusMessage>}
      </section>

      <section className="birth-record-card birth-record-card--replace" aria-labelledby="person-replace-heading">
        <h3 id="person-replace-heading">{t.replaceHeading}</h3>
        <p className="hint">{t.importHint}</p>
        <p>
          <FileInput
            buttonLabel={t.importButton}
            accept="application/json,.json,.aaf,text/plain"
            onChange={onFileChosen}
          />
        </p>
        {candidates.length > 1 && (
          <Select
            label={t.choosePerson}
            value={String(chosen)}
            options={candidates.map((candidate, index) => ({ value: String(index), label: candidate.displayName }))}
            onChange={(value) => {
              setChosen(Number(value));
            }}
          />
        )}
        {staged !== undefined &&
          (staged.changes.length === 0 ? (
            <StatusMessage kind="zero">{t.noChanges}</StatusMessage>
          ) : (
            <div className="person-file-preview">
              <h4>{t.changesHeading}</h4>
              <dl>
                {staged.changes.map((change) => (
                  <Fragment key={change.field}>
                    <dt>{t.fields[change.field]}</dt>
                    <dd>{describe(change)}</dd>
                  </Fragment>
                ))}
              </dl>
              <p className="actions">
                <Button variant="danger" busy={saving} busyLabel={t.applying} onClick={confirm}>
                  {t.confirm}
                </Button>{' '}
                <Button onClick={cancel} disabled={saving}>
                  {t.cancel}
                </Button>
              </p>
            </div>
          ))}
        {importStatus !== undefined && <StatusMessage kind={importStatus.kind}>{importStatus.text}</StatusMessage>}
      </section>
    </div>
  );
}
