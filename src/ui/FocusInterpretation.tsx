/**
 * The button under a selected placement's information card that asks the model for the tensions of
 * *that* placement (#424), and shows the answer below it.
 *
 * It is a Tier 2 feature, so it follows Tier 2's rules (ADR 0003): signed in, a plain consent
 * checkbox, asked in a drawer opened by every click, that is never remembered and is spent the moment the request is sent, and the same
 * server-side limits. What is sent is only `context` — the placement's own sign, house, rulerships
 * and aspects — never the whole chart, and no name, date, time or place. The reading resets
 * whenever the selection changes, so an answer never sits under a different placement.
 *
 * A selected sign (#1998) uses the same control with a `signContext` instead: what is sent is that
 * sign's cusp houses, its ruler's placement and aspects, and the bodies in it, and the heading,
 * button, consent and sign-in text say so.
 */
/**
 * @module FocusInterpretation
 * @purpose Renders the "interpret the tensions of this placement" Tier 2 AI-interpretation control shown under a selected chart placement,
 * @conventions A Tier 2 feature per ADR 0003: requires sign-in, a plain consent checkbox that is never remembered and is spent the moment the request is sent; sends only the placement's own `FocusContext` (sign, house, rulerships, aspects), or a selected sign's `SignContext` (#1998), via `generateTier2Interpretation`, never the whole chart or any name/date/time/place. Resets whenever `resetKey` (the selection) changes. Text comes from co-located `FocusInterpretation.messages.ts` via `useMessages()`.
 * @exports FocusInterpretation
 */
import { useEffect, useId, useState } from 'react';
import type { FocusContext } from '../interpretation/focus-context-schema.js';
import type { Locale } from '../interpretation/schema.js';
import type { SignContext } from '../interpretation/sign-context-schema.js';
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
  signContext,
  locale,
  resetKey,
  personId,
  restingHeading = true,
}: {
  readonly context: FocusContext | undefined;
  /** A selected sign's sign-ruler context (#1998); used when `context` is absent, with the sign wording. */
  readonly signContext?: SignContext | undefined;
  readonly locale: Locale;
  /** Changes with the selection: the consent, the answer and any error start over. */
  readonly resetKey: string;
  /** The person the readings are saved under (#768). Absent (until every caller passes it), nothing is generated. */
  readonly personId?: string | undefined;
  /** False in the docked sign foot (#1998): the resting footer is the single button, and the heading shows only in the open consent drawer. */
  readonly restingHeading?: boolean;
}): React.JSX.Element | null {
  const t = useMessages(focusInterpretationMessages);
  const shared = useMessages(sharedMessages);
  const online = useOnline();
  const user = useSessionUserOrUndefined();
  const [consent, setConsent] = useState(false);
  // The per-request consent drawer (#1998). Closed by default; every Interpret click opens it, as consent is never remembered.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sections, setSections] = useState<readonly Tier2Section[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const reasonId = useId();

  useEffect(() => {
    setConsent(false);
    setDrawerOpen(false);
    setSections(undefined);
    setError(undefined);
  }, [resetKey]);

  if (context === undefined && signContext === undefined) return null;

  const forSign = context === undefined;
  const words = forSign
    ? { heading: t.signHeading, generate: t.signGenerate, consent: t.signConsent, signIn: t.signSignIn }
    : { heading: t.heading, generate: t.generate, consent: t.consent, signIn: t.signIn };
  // Signed out the button is disabled with the sign-in reason; signed in it is enabled and the consent is asked in the drawer.
  const signInReason = user === undefined ? words.signIn : undefined;
  const confirmReason = consent ? undefined : t.disabledConsent;
  const confirmReasonId = `${reasonId}-confirm`;

  function generate(): void {
    if (personId === undefined) return;
    const request =
      context !== undefined
        ? ({ mode: 'focus', focusContext: context, locale, personId } as const)
        : signContext !== undefined
          ? ({ mode: 'sign', signContext, locale, personId } as const)
          : undefined;
    if (request === undefined) return;
    setGenerating(true);
    setError(undefined);
    setSections(undefined);
    // Consent authorizes this one request: spent as it is sent, as in the report's AI panel (#391).
    setConsent(false);
    setDrawerOpen(false);
    generateTier2Interpretation(request)
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
    <section className="focus-interpretation" aria-label={words.heading}>
      {(restingHeading || drawerOpen) && <h3>{words.heading}</h3>}
      {user !== undefined && drawerOpen ? (
        <div className="focus-interpretation-drawer">
          <Checkbox
            label={words.consent}
            checked={consent}
            onChange={(value) => {
              setConsent(value);
            }}
          />
          <div className="focus-interpretation-actions">
            <Button
              variant="primary"
              disabled={!consent || generating || !online}
              aria-describedby={confirmReason === undefined ? undefined : confirmReasonId}
              onClick={generate}
            >
              {t.confirm}
            </Button>
            <Button
              onClick={() => {
                setConsent(false);
                setDrawerOpen(false);
              }}
            >
              {t.cancel}
            </Button>
          </div>
          {confirmReason !== undefined && (
            <p id={confirmReasonId} className="hint">
              ({confirmReason})
            </p>
          )}
        </div>
      ) : (
        <Button
          variant="primary"
          disabled={signInReason !== undefined || generating || !online}
          aria-describedby={signInReason === undefined ? undefined : reasonId}
          onClick={() => {
            setDrawerOpen(true);
          }}
        >
          {generating ? t.generating : words.generate}
        </Button>
      )}
      {!online && <StatusMessage kind="offline">{shared.offlineNeeded}</StatusMessage>}
      {signInReason !== undefined && (
        <p id={reasonId} className="hint">
          {signInReason}
        </p>
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
