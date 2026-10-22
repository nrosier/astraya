/**
 * @module ui/PdfAiInterpretationPicker
 * @purpose Lets the signed-in user tick saved AI interpretations in the PDF's language in a selection modal (#762) and order the chosen ones in the PDF builder (#759); it generates nothing.
 * @conventions Controlled: owns only the fetched list, never the selection. Only entries whose locale equals the PDF's locale are offered; signed out, the trigger is disabled and the list endpoint is never called. The modal only ticks entries (time, description when present, type; never the generic AI label); Move up/down stay in the builder's list; closing keeps the selection. UI strings follow the app locale; entry labels follow the PDF locale.
 * @exports PdfAiInterpretationPicker
 */
import { useEffect, useRef, useState } from 'react';
import { listSavedInterpretations, type SavedInterpretationSummary } from '../interpretation/tier2-client.js';
import type { Locale } from '../interpretation/schema.js';
import { useMessages } from './messages.js';
import { pdfExportMessages } from './pdf-export.messages.js';
import { Checkbox } from './primitives/Checkbox.js';
import { StagedDialog } from './primitives/StagedDialog.js';
import { savedTypeLabel } from './result-basis-label.js';
import { formatSavedTime } from './saved-time.js';

type LoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly entries: readonly SavedInterpretationSummary[] };

export interface PdfAiInterpretationPickerProps {
  readonly selectedIds: readonly string[];
  readonly onChange: (ids: readonly string[]) => void;
  /** The PDF's language; only saved interpretations in it are offered. */
  readonly locale: Locale;
  readonly signedIn: boolean;
}

/** The type wording for an entry; the neutral label when nothing specific was recorded. */
function typeOf(entry: SavedInterpretationSummary, locale: Locale, neutral: string): string {
  return savedTypeLabel(entry, locale) ?? neutral;
}

/** One line for the builder's ordered list: time, description when present, type. */
function describe(entry: SavedInterpretationSummary, locale: Locale, neutral: string): string {
  const description = entry.description?.trim() ?? '';
  return [formatSavedTime(entry.createdAt, locale), description, typeOf(entry, locale, neutral)]
    .filter((part) => part !== '')
    .join(' · ');
}

export function PdfAiInterpretationPicker({
  selectedIds,
  onChange,
  locale,
  signedIn,
}: PdfAiInterpretationPickerProps): React.JSX.Element {
  const t = useMessages(pdfExportMessages);
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [modalOpen, setModalOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!signedIn) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    listSavedInterpretations().then(
      (entries) => {
        if (!cancelled) setState({ status: 'ready', entries });
      },
      () => {
        if (!cancelled) setState({ status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const offered = state.status === 'ready' ? state.entries.filter((entry) => entry.locale === locale) : [];
  const byId = new Map(offered.map((entry) => [entry.id, entry]));
  const chosen = selectedIds.flatMap((id) => {
    const entry = byId.get(id);
    return entry === undefined ? [] : [entry];
  });

  function toggle(id: string, checked: boolean): void {
    onChange(checked ? [...selectedIds, id] : selectedIds.filter((other) => other !== id));
  }

  function closeModal(): void {
    setModalOpen(false);
  }

  /** Swaps a chosen entry with its neighbour in the shown order, by id, so ids not offered here keep their slots. */
  function move(index: number, by: -1 | 1): void {
    const a = chosen[index]?.id;
    const b = chosen[index + by]?.id;
    if (a === undefined || b === undefined) return;
    onChange(selectedIds.map((id) => (id === a ? b : id === b ? a : id)));
  }

  return (
    <fieldset className="field-group" disabled={!signedIn} aria-busy={state.status === 'loading'}>
      <legend>{t.interpretationSavedLabel}</legend>
      <p className="hint">{t.interpretationSavedHint}</p>
      {!signedIn && <p className="hint">{t.interpretationSavedSignedOut}</p>}
      <button
        ref={triggerRef}
        type="button"
        disabled={!signedIn}
        onClick={() => {
          setModalOpen(true);
        }}
      >
        {t.interpretationSavedChoose}
      </button>
      <StagedDialog
        open={modalOpen && signedIn}
        heading={t.interpretationSavedModalHeading}
        closeLabel={t.interpretationSavedClose}
        onDiscard={closeModal}
        returnFocusTo={triggerRef}
        footer={
          <button type="button" onClick={closeModal}>
            {t.interpretationSavedClose}
          </button>
        }
      >
        {state.status === 'loading' && <p className="hint">{t.interpretationSavedLoading}</p>}
        {state.status === 'error' && <p role="alert">{t.interpretationSavedError}</p>}
        {state.status === 'ready' && offered.length === 0 && <p className="hint">{t.interpretationSavedEmpty}</p>}
        {offered.map((entry) => {
          const description = entry.description?.trim() ?? '';
          return (
            <Checkbox
              key={entry.id}
              label={formatSavedTime(entry.createdAt, locale)}
              description={[description, typeOf(entry, locale, t.interpretationSavedTypeNeutral)]
                .filter((part) => part !== '')
                .join(' · ')}
              checked={selectedIds.includes(entry.id)}
              onChange={(checked) => {
                toggle(entry.id, checked);
              }}
            />
          );
        })}
      </StagedDialog>
      {chosen.length > 0 && (
        <ol>
          {chosen.map((entry, index) => (
            <li key={entry.id}>
              {describe(entry, locale, t.interpretationSavedTypeNeutral)}{' '}
              <button
                type="button"
                disabled={index === 0}
                onClick={() => {
                  move(index, -1);
                }}
              >
                {t.interpretationSavedMoveUp}
              </button>{' '}
              <button
                type="button"
                disabled={index === chosen.length - 1}
                onClick={() => {
                  move(index, 1);
                }}
              >
                {t.interpretationSavedMoveDown}
              </button>
            </li>
          ))}
        </ol>
      )}
    </fieldset>
  );
}
