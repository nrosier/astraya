/**
 * The editor in which a reader corrects the text of one interpretation entry (#1338, slice 1). The correction is the
 * reader's own: saved in the op-log on this device and synced to their profile when signed in. Nothing is submitted.
 */
/**
 * @module CorpusCorrectionEditor
 * @purpose A drawer in which a reader edits, saves or resets their own version of one interpretation entry's text.
 * @conventions Controlled by the caller (`entry` open, `null` closed); the draft is staged and only Save writes, through `correctionWrite` so an invalid text is refused before any write; Reset writes the tombstone and shows only when the reader has a correction; wording comes from `CorpusCorrectionEditor.messages.ts` with refusal codes mapped to text here; reuses `StagedDialog`, `TextAreaField` and `Button`.
 * @exports CorpusCorrectionEditor, CorrectionTarget, refusalText
 */
import { useEffect, useState } from 'react';
import type { Locale } from '../interpretation/schema.js';
import {
  CorrectionRefusedError,
  checkCorrectionText,
  correctionReset,
  correctionWrite,
  textHash,
  type CorrectionRefusal,
} from '../store/corpus-corrections.js';
import type { Store } from '../store/store.js';
import { corpusCorrectionMessages } from './CorpusCorrectionEditor.messages.js';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { StagedDialog } from './primitives/StagedDialog.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { TextAreaField } from './primitives/TextAreaField.js';

/** What the editor is editing: one entry, its original text and the reader's current version, if any. */
export interface CorrectionTarget {
  readonly key: string;
  readonly locale: Locale;
  /** The text without the reader's correction: the approved override, or the committed text. */
  readonly originalText: string;
  /** The reader's saved correction, when there is one. */
  readonly correctedText?: string | undefined;
  /** What the entry is about, for the heading. */
  readonly label?: string | undefined;
}

type Messages = (typeof corpusCorrectionMessages)['en'];

/** The wording of a refusal code; shared with the submit dialog so both say the same thing. */
export function refusalText(t: Messages, refusal: CorrectionRefusal): string {
  switch (refusal) {
    case 'empty':
      return t.empty;
    case 'too-short':
      return t.tooShort;
    case 'too-long':
      return t.tooLong;
    case 'markup':
      return t.markup;
    case 'link':
      return t.link;
    case 'invalid':
      return t.invalid;
  }
}

export function CorpusCorrectionEditor({
  store,
  target,
  returnFocusTo,
  onClose,
}: {
  readonly store: Store;
  readonly target: CorrectionTarget | undefined;
  readonly returnFocusTo: React.RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}): React.JSX.Element {
  const t = useMessages(corpusCorrectionMessages);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  // A fresh draft for each entry opened: the reader's version when there is one, otherwise the original to start from.
  const targetKey = target === undefined ? undefined : `${target.locale}|${target.key}`;
  useEffect(() => {
    setDraft(target?.correctedText ?? target?.originalText ?? '');
    setError(undefined);
    setBusy(false);
    // Only a different entry resets the draft, not a re-render of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  const run = (work: () => Promise<void>): void => {
    setBusy(true);
    setError(undefined);
    work().then(
      () => {
        setBusy(false);
        onClose();
      },
      (cause: unknown) => {
        setBusy(false);
        setError(
          cause instanceof CorrectionRefusedError
            ? refusalText(t, cause.refusal)
            : t.saveFailed(cause instanceof Error ? cause.message : String(cause)),
        );
      },
    );
  };

  const save = (): void => {
    if (target === undefined) return;
    const refusal = checkCorrectionText(target.locale, target.key, draft);
    if (refusal !== undefined) {
      setError(refusalText(t, refusal));
      return;
    }
    run(async () => {
      await store.mutate(correctionWrite(target.locale, target.key, draft, await textHash(target.originalText)));
    });
  };

  const reset = (): void => {
    if (target === undefined) return;
    run(() => store.mutate([correctionReset(target.locale, target.key)]));
  };

  return (
    <StagedDialog
      open={target !== undefined}
      heading={target?.label === undefined ? t.heading : `${t.heading}: ${target.label}`}
      closeLabel={t.closeLabel}
      placement="right"
      onDiscard={onClose}
      returnFocusTo={returnFocusTo}
      footer={
        target === undefined ? null : (
          <>
            <div className="settings-card-footer-group">
              {target.correctedText !== undefined && (
                <Button type="button" variant="danger" disabled={busy} onClick={reset}>
                  {t.reset}
                </Button>
              )}
            </div>
            <div className="settings-card-footer-group">
              <Button type="button" variant="quiet" onClick={onClose}>
                {t.cancel}
              </Button>
              <Button type="button" variant="primary" disabled={busy} onClick={save}>
                {busy ? t.saving : t.save}
              </Button>
            </div>
          </>
        )
      }
    >
      {target !== undefined && (
        <>
          <TextAreaField label={t.textLabel} value={draft} onChange={setDraft} help={t.help} rows={10} />
          {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
          {target.correctedText !== undefined && (
            <>
              <h4>{t.defaultTextLabel}</h4>
              <p className="hint">{target.originalText}</p>
            </>
          )}
        </>
      )}
    </StagedDialog>
  );
}
