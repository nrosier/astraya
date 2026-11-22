/**
 * Two-step sign-in (TOTP) enrolment for a signed-in local account (#1500, steps 4 and 5): password, then the QR code and
 * key, then the first code, then the ten recovery codes shown once, then a one-line "on" message. The copy is the
 * owner-approved table on #1500.
 */
/**
 * @module TotpEnrolmentPanel
 * @purpose The enrolment panel for two-step sign-in: start (current password), show the secret (QR code plus the manual key and an otpauth link), enter the first code, show the recovery codes once (copy, download), done.
 * @conventions The secret, the otpauth URI, the QR image and the recovery codes live in component state only: never in IndexedDB, localStorage, sessionStorage, a cookie, the URL or a module variable, and the secret is dropped when the codes arrive and the codes when "I've saved them" is pressed. The QR encoder (`totp-qr.ts`, `uqr`) is loaded with a dynamic `import()` here only. Errors are mapped from `TotpError.reason`, never from the server's text: invalid-credentials is the wrong password, invalid-code the wrong code, rate-limited the throttle message, anything else the shared generic `apiErrorText`. A 403 (not a local account) or 503 (enrolment disabled) hides the whole panel. Uses only existing primitives; text from `TotpEnrolmentPanel.messages.ts`. Nothing here logs.
 * @exports TotpEnrolmentPanel, RECOVERY_CODES_FILENAME
 */
import { useEffect, useId, useState } from 'react';
import { TotpError, confirmTotp, enrolTotp } from '../sync/auth-client.js';
import type { TotpEnrolment } from '../sync/auth-client.js';
import { apiErrorText } from './api-error.js';
import { downloadText } from './download.js';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { Notice } from './primitives/Notice.js';
import { PasswordField } from './primitives/PasswordField.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { TextField } from './primitives/TextField.js';
import { accountPanelMessages } from './AccountPanel.messages.js';
import { totpEnrolmentPanelMessages } from './TotpEnrolmentPanel.messages.js';

/** The file the recovery codes download as: one code per line, nothing else. */
export const RECOVERY_CODES_FILENAME = 'astraya-recovery-codes.txt';

type Step =
  | { readonly kind: 'start' }
  | { readonly kind: 'secret'; readonly enrolment: TotpEnrolment }
  | { readonly kind: 'recovery'; readonly codes: readonly string[] }
  | { readonly kind: 'done' }
  | { readonly kind: 'hidden' };

/** The base32 key in groups of four, easier to type by hand. */
function groupedKey(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}

export function TotpEnrolmentPanel(): React.JSX.Element | null {
  const t = useMessages(totpEnrolmentPanelMessages);
  const account = useMessages(accountPanelMessages);
  const headingId = useId();
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [qr, setQr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const secretUri = step.kind === 'secret' ? step.enrolment.otpauthUri : undefined;
  useEffect(() => {
    if (secretUri === undefined) return;
    let current = true;
    // Its own chunk, fetched only when a secret is on screen; without it the manual key and the link still work.
    void import('./totp-qr.js')
      .then(({ qrDataUrl }) => {
        if (current) setQr(qrDataUrl(secretUri));
      })
      .catch(() => undefined);
    return () => {
      current = false;
      setQr(undefined);
    };
  }, [secretUri]);

  /** Wrong password/code and throttling have their own approved text; not-local and disabled hide the panel; the rest is generic. */
  const failureText = (cause: unknown, wrong: string): string | undefined => {
    if (cause instanceof TotpError) {
      if (cause.reason === 'local-only' || cause.reason === 'unavailable') {
        setStep({ kind: 'hidden' });
        return undefined;
      }
      if (cause.reason === 'invalid-credentials' || cause.reason === 'invalid-code') return wrong;
      if (cause.reason === 'rate-limited') return t.throttled;
    }
    return apiErrorText(cause);
  };

  const start = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    enrolTotp(password)
      .then((enrolment) => {
        setPassword('');
        setStep({ kind: 'secret', enrolment });
      })
      .catch((cause: unknown) => {
        setError(failureText(cause, t.wrongPassword));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const confirm = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    confirmTotp(code.trim())
      .then((codes) => {
        setCode('');
        setStep({ kind: 'recovery', codes });
      })
      .catch((cause: unknown) => {
        setCode('');
        setError(failureText(cause, t.wrongCode));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  if (step.kind === 'hidden') return null;

  return (
    <section className="preferences-card totp-panel" aria-labelledby={headingId}>
      <h2 id={headingId} className="preferences-card-title">
        {step.kind === 'recovery' ? t.recoveryTitle : t.title}
      </h2>

      {step.kind === 'start' && (
        <form onSubmit={start}>
          <p className="hint">{t.intro}</p>
          {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
          <div className="field-grid">
            <PasswordField
              label={t.passwordLabel}
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              revealable
              showLabel={account.showPasswordLabel}
              hideLabel={account.hidePasswordLabel}
            />
          </div>
          <p className="actions">
            <Button type="submit" variant="primary" disabled={busy || password === ''}>
              {t.start}
            </Button>
          </p>
        </form>
      )}

      {step.kind === 'secret' && (
        <form onSubmit={confirm}>
          <p>{t.scanStep}</p>
          {qr !== undefined && <img className="totp-qr" src={qr} alt={t.qrAlt} width={192} height={192} />}
          <p className="totp-key">
            <span className="totp-key-label">{t.manualKeyLabel}</span> <code>{groupedKey(step.enrolment.secret)}</code>
          </p>
          <p>
            <a href={step.enrolment.otpauthUri}>{t.openInApp}</a>
          </p>
          {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
          <div className="field-grid">
            <TextField
              label={t.codeLabel}
              autoComplete="one-time-code"
              inputMode="numeric"
              value={code}
              onChange={setCode}
            />
          </div>
          <p className="actions">
            <Button type="submit" variant="primary" disabled={busy || code.trim() === ''}>
              {t.confirm}
            </Button>
          </p>
        </form>
      )}

      {step.kind === 'recovery' && (
        <RecoveryCodes
          codes={step.codes}
          onSaved={() => {
            setStep({ kind: 'done' });
          }}
        />
      )}

      {step.kind === 'done' && <StatusMessage kind="success">{t.enabled}</StatusMessage>}
    </section>
  );
}

function RecoveryCodes({
  codes,
  onSaved,
}: {
  readonly codes: readonly string[];
  readonly onSaved: () => void;
}): React.JSX.Element {
  const t = useMessages(totpEnrolmentPanelMessages);
  const [error, setError] = useState<string>();

  const copy = (): void => {
    setError(undefined);
    navigator.clipboard.writeText(codes.join('\n')).catch((cause: unknown) => {
      setError(apiErrorText(cause));
    });
  };

  return (
    <>
      <Notice>{t.recoveryWarning}</Notice>
      <ul className="totp-recovery-codes">
        {codes.map((recoveryCode) => (
          <li key={recoveryCode}>
            <code>{recoveryCode}</code>
          </li>
        ))}
      </ul>
      {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
      <p className="actions">
        <Button variant="plain" onClick={copy}>
          {t.copyCodes}
        </Button>
        <Button
          variant="plain"
          onClick={() => {
            downloadText(RECOVERY_CODES_FILENAME, `${codes.join('\n')}\n`, 'text/plain');
          }}
        >
          {t.downloadCodes}
        </Button>
        <Button variant="primary" onClick={onSaved}>
          {t.savedThem}
        </Button>
      </p>
    </>
  );
}
