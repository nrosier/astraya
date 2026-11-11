/**
 * The button under a selected placement's information card that asks the model for the tensions of
 * *that* placement (#424), and shows the answer below it.
 *
 * It is a Tier 2 feature, so it follows Tier 2's rules (ADR 0003): signed in, a plain consent
 * checkbox that is never remembered and is spent the moment the request is sent, and the same
 * server-side limits. What is sent is only `context` — the placement's own sign, house, rulerships
 * and aspects — never the whole chart, and no name, date, time or place. The reading resets
 * whenever the selection changes, so an answer never sits under a different placement.
 */
/**
 * @module FocusInterpretation
 * @purpose Renders the "interpret the tensions of this placement" Tier 2 AI-interpretation control shown under a selected chart placement,
 * @conventions A Tier 2 feature per ADR 0003: requires sign-in, a plain consent checkbox that is never remembered and is spent the moment the request is sent; sends only the placement's own `FocusContext` (sign, house, rulerships, aspects) via `generateTier2Interpretation`, never the whole chart or any name/date/time/place. Resets whenever `resetKey` (the selection) changes. Text comes from co-located `FocusInterpretation.messages.ts` via `useMessages()`.
 * @exports FocusInterpretation
 */
import { useEffect, useId, useState } from 'react';
import type { FocusContext } from '../interpretation/focus-context-schema.js';
import type { Locale } from '../interpretation/schema.js';
import { generateTier2Interpretation, type Tier2Section } from '../interpretation/tier2-client.js';
import { Button } from './primitives/Button.js';
import { Checkbox } from './primitives/Checkbox.js';
import { useOnline } from './online-status.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { sharedMessages } from './shared.messages.js';
import { focusInterpretationMessages } from './FocusInterpretation.messages.js';
import { useMessages } from './messages.js';
import { useSessionUserOrUndefined } from './session-context.js';
import { apiErrorText } from './api-error.js';

export function FocusInterpretation({
  context,
  locale,
  resetKey,
  personId,
}: {
  readonly context: FocusContext | undefined;
  readonly locale: Locale;
  /** Changes with the selection: the consent, the answer and any error start over. */
  readonly resetKey: string;
  /** The person the readings are saved under (#768). Absent (until every caller passes it), nothing is generated. */
  readonly personId?: string | undefined;
}): React.JSX.Element | null {
  const t = useMessages(focusInterpretationMessages);
  const shared = useMessages(sharedMessages);
  const online = useOnline();
  const user = useSessionUserOrUndefined();
  const [consent, setConsent] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sections, setSections] = useState<readonly Tier2Section[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const reasonId = useId();

  useEffect(() => {
    setConsent(false);
    setSections(undefined);
    setError(undefined);
  }, [resetKey]);

  if (context === undefined) return null;

  const disabledReason = user === undefined ? t.signIn : !consent ? t.disabledConsent : undefined;

  function generate(): void {
    if (context === undefined || personId === undefined) return;
    setGenerating(true);
    setError(undefined);
    setSections(undefined);
    // Consent authorizes this one request: spent as it is sent, as in the report's AI panel (#391).
    setConsent(false);
    generateTier2Interpretation({ mode: 'focus', focusContext: context, locale, personId })
      .then((generated) => {
        setSections(generated);
      })
      .catch((caught: unknown) => {
        setError(apiErrorText(caught));
      })
      .finally(() => {
        setGenerating(false);
      });
  }

  return (
    <section className="focus-interpretation" aria-label={t.heading}>
      <h3>{t.heading}</h3>
      {user !== undefined && (
        <Checkbox
          label={t.consent}
          checked={consent}
          onChange={(value) => {
            setConsent(value);
          }}
        />
      )}
      <Button
        variant="primary"
        disabled={disabledReason !== undefined || generating || !online}
        aria-describedby={disabledReason === undefined ? undefined : reasonId}
        onClick={generate}
      >
        {generating ? t.generating : t.generate}
      </Button>
      {!online && <StatusMessage kind="offline">{shared.offlineNeeded}</StatusMessage>}
      {disabledReason !== undefined && (
        <span id={reasonId} className="hint">
          {' '}
          {user === undefined ? disabledReason : `(${disabledReason})`}
        </span>
      )}
      {error !== undefined && <StatusMessage kind="error">{t.error(error)}</StatusMessage>}
      {sections !== undefined && (
        <div className="tier2-result" aria-live="polite">
          {sections.map((section) => (
            <article key={section.heading}>
              <h4>{section.heading}</h4>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
