/**
 * The dialog in which a signed-in reader suggests a corrected text for one interpretation entry to the admins
 * (#1338, slice 2). It shows the licence notice and will not send until the reader ticks the box.
 */
/**
 * @module SuggestCorrectionDialog
 * @purpose A drawer in which a signed-in reader edits a text, accepts the licence notice and submits it to the admins.
 * @conventions Controlled by the caller (`target` open, `undefined` closed); the text starts from the reader's own version or the original and is checked with `checkCorrectionText` before sending; Send stays disabled until the licence box is ticked, and the client wrapper refuses to send without it; the server's stable error codes (`pending-limit`, `daily-limit`) are worded here; only locale, key and text are sent; wording is `CorpusCorrectionEditor.messages.ts`.
 * @exports SuggestCorrectionDialog
 */
import { useEffect, useState } from 'react';
import { checkCorrectionText } from '../store/corpus-corrections.js';
import { SubmissionError, submitCorpusCorrection } from '../sync/submission-client.js';
import { refusalText, type CorrectionTarget } from './CorpusCorrectionEditor.js';
import { corpusCorrectionMessages } from './CorpusCorrectionEditor.messages.js';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { Checkbox } from './primitives/Checkbox.js';
import { StagedDialog } from './primitives/StagedDialog.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { TextAreaField } from './primitives/TextAreaField.js';
import { apiErrorText } from './api-error.js';

export function SuggestCorrectionDialog({
  target,
  returnFocusTo,
  onClose,
}: {
  readonly target: CorrectionTarget | undefined;
  readonly returnFocusTo: React.RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}): React.JSX.Element {
  const t = useMessages(corpusCorrectionMessages);
  const [draft, setDraft] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const targetKey = target === undefined ? undefined : `${target.locale}|${target.key}`;
  useEffect(() => {
    setDraft(target?.correctedText ?? target?.originalText ?? '');
    // The acceptance is never carried over from a previous entry.
    setAccepted(false);
    setError(undefined);
    setBusy(false);
    setSent(false);
    // Only a different entry resets the draft, not a re-render of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  const submit = (): void => {
    if (target === undefined) return;
    if (!accepted) {
      setError(t.licenceRequired);
      return;
    }
    const refusal = checkCorrectionText(target.locale, target.key, draft);
    if (refusal !== undefined) {
      setError(refusalText(t, refusal));
      return;
    }
    setBusy(true);
    setError(undefined);
    submitCorpusCorrection({ locale: target.locale, key: target.key, text: draft, licenceAccepted: accepted }).then(
      () => {
        setBusy(false);
        setSent(true);
      },
      (cause: unknown) => {
        setBusy(false);
        if (cause instanceof SubmissionError && cause.code === 'pending-limit') setError(t.pendingLimit);
        else if (cause instanceof SubmissionError && cause.code === 'daily-limit') setError(t.dailyLimit);
        else setError(t.submitFailed(apiErrorText(cause)));
      },
    );
  };

  return (
    <StagedDialog
      open={target !== undefined}
      heading={target?.label === undefined ? t.suggestHeading : `${t.suggestHeading}: ${target.label}`}
      closeLabel={t.closeLabel}
      placement="right"
      phoneSheet
      dialogClassName="settings-card drawer-fit"
      onDiscard={onClose}
      returnFocusTo={returnFocusTo}
      footer={
        target === undefined ? null : sent ? (
          <div className="settings-card-footer-group">
            <Button type="button" variant="primary" onClick={onClose}>
              {t.submitClose}
            </Button>
          </div>
        ) : (
          <>
            <div className="settings-card-footer-group" />
            <div className="settings-card-footer-group">
              <Button type="button" variant="quiet" onClick={onClose}>
                {t.cancel}
              </Button>
              <Button type="button" variant="primary" disabled={busy || !accepted} onClick={submit}>
                {busy ? t.submitting : t.submit}
              </Button>
            </div>
          </>
        )
      }
    >
      {target !== undefined &&
        (sent ? (
          <StatusMessage kind="success">{t.submitted}</StatusMessage>
        ) : (
          <>
            <TextAreaField
              label={t.suggestTextLabel}
              value={draft}
              onChange={setDraft}
              help={t.suggestHelp}
              rows={10}
            />
            <p className="hint">{t.licenceNotice}</p>
            <Checkbox label={t.licenceAccept} checked={accepted} onChange={setAccepted} />
            {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
          </>
        ))}
    </StagedDialog>
  );
}
