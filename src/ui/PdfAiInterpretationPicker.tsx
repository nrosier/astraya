/**
 * @module ui/PdfAiInterpretationPicker
 * @purpose Lists the signed-in user's saved AI interpretations in the PDF's language so the PDF builder can select and order them (#759); it generates nothing.
 * @conventions Controlled: owns only the fetched list, never the selection. Only entries whose locale equals the PDF's locale are offered; signed out, the checkboxes are disabled and the list endpoint is never called. UI strings follow the app locale; entry labels follow the PDF locale.
 * @exports PdfAiInterpretationPicker
 */
import { useEffect, useState } from 'react';
import { listSavedInterpretations, type SavedInterpretationSummary } from '../interpretation/tier2-client.js';
import type { Locale } from '../interpretation/schema.js';
import { useMessages } from './messages.js';
import { pdfExportMessages } from './pdf-export.messages.js';
import { Checkbox } from './primitives/Checkbox.js';
import { savedKindLabel } from './result-basis-label.js';
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

function describe(entry: SavedInterpretationSummary, locale: Locale): string {
  return `${savedKindLabel(entry, locale)} (${formatSavedTime(entry.createdAt, locale)})`;
}

export function PdfAiInterpretationPicker({
  selectedIds,
  onChange,
  locale,
  signedIn,
}: PdfAiInterpretationPickerProps): React.JSX.Element {
  const t = useMessages(pdfExportMessages);
  const [state, setState] = useState<LoadState>({ status: 'idle' });

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

  const offered =
    state.status === 'ready' ? state.entries.filter((entry) => entry.locale === locale) : [];
  const byId = new Map(offered.map((entry) => [entry.id, entry]));
  const chosen = selectedIds.flatMap((id) => {
    const entry = byId.get(id);
    return entry === undefined ? [] : [entry];
  });

  function toggle(id: string, checked: boolean): void {
    onChange(checked ? [...selectedIds, id] : selectedIds.filter((other) => other !== id));
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
      {signedIn && state.status === 'loading' && <p className="hint">{t.interpretationSavedLoading}</p>}
      {signedIn && state.status === 'error' && <p role="alert">{t.interpretationSavedError}</p>}
      {signedIn && state.status === 'ready' && offered.length === 0 && (
        <p className="hint">{t.interpretationSavedEmpty}</p>
      )}
      {offered.map((entry) => (
        <Checkbox
          key={entry.id}
          label={describe(entry, locale)}
          checked={selectedIds.includes(entry.id)}
          disabled={!signedIn}
          onChange={(checked) => {
            toggle(entry.id, checked);
          }}
        />
      ))}
      {chosen.length > 0 && (
        <ol>
          {chosen.map((entry, index) => (
            <li key={entry.id}>
              {describe(entry, locale)}{' '}
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
