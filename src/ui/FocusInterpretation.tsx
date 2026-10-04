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
import { useEffect, useId, useState } from 'react';
import type { FocusContext } from '../interpretation/focus-context-schema.js';
import type { Locale } from '../interpretation/schema.js';
import { generateTier2Interpretation, Tier2Error, type Tier2Section } from '../interpretation/tier2-client.js';
import { focusInterpretationMessages } from './FocusInterpretation.messages.js';
import { useMessages } from './messages.js';
import { useSessionUserOrUndefined } from './session-context.js';

export function FocusInterpretation({
  context,
  locale,
  resetKey,
}: {
  readonly context: FocusContext | undefined;
  readonly locale: Locale;
  /** Changes with the selection: the consent, the answer and any error start over. */
  readonly resetKey: string;
}): React.JSX.Element | null {
  const t = useMessages(focusInterpretationMessages);
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
    if (context === undefined) return;
    setGenerating(true);
    setError(undefined);
    setSections(undefined);
    // Consent authorizes this one request: spent as it is sent, as in the report's AI panel (#391).
    setConsent(false);
    generateTier2Interpretation({ mode: 'focus', focusContext: context, locale })
      .then(setSections)
      .catch((caught: unknown) => {
        setError(caught instanceof Tier2Error ? caught.message : String(caught));
      })
      .finally(() => {
        setGenerating(false);
      });
  }

  return (
    <section className="focus-interpretation" aria-label={t.heading}>
      <h4>{t.heading}</h4>
      {user !== undefined && (
        <label>
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => {
              setConsent(event.target.checked);
            }}
          />{' '}
          {t.consent}
        </label>
      )}
      <button
        type="button"
        disabled={disabledReason !== undefined || generating}
        aria-describedby={disabledReason === undefined ? undefined : reasonId}
        onClick={generate}
      >
        {generating ? t.generating : t.generate}
      </button>
      {disabledReason !== undefined && (
        <span id={reasonId} className="hint">
          {' '}
          {user === undefined ? disabledReason : `(${disabledReason})`}
        </span>
      )}
      {error !== undefined && <p role="alert">{t.error(error)}</p>}
      {sections !== undefined && (
        <div className="tier2-result" aria-live="polite">
          {sections.map((section) => (
            <article key={section.heading}>
              <h5>{section.heading}</h5>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
