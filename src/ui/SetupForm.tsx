/**
 * The unauthenticated end of the admin-bootstrap link (`server/auth/bootstrap.ts`) —
 * printed to the server log on first boot, before any account exists. Outside `Stored`:
 * nothing here needs the local store beyond what `setup()` (session-context.tsx) already
 * opens itself, and rendering it without one means a mistyped or expired link never has to
 * open IndexedDB first to say so.
 */
/**
 * @module SetupForm
 * @purpose Unauthenticated first-boot form for creating the admin account from the server-log bootstrap link token.
 * @conventions Rendered outside the Stored local-store context; uses SetupForm.messages.ts for en/nl text via useMessages().
 * @exports SetupForm
 */
import { PasswordField } from './primitives/PasswordField.js';
import { TextField } from './primitives/TextField.js';
import { useState } from 'react';
import { useMessages } from './messages.js';
import { useSession } from './session-context.js';
import { setupToken } from './route.js';
import { setupFormMessages } from './SetupForm.messages.js';
import { sharedMessages } from './shared.messages.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { BackLink } from './BackLink.js';
import { PageHeader } from './PageHeader.js';

export function SetupForm(): React.JSX.Element {
  const { setup } = useSession();
  const [token] = useState(() => setupToken(window.location.hash));
  const [username, setUsername] = useState('');
  const [password, setPasswordInput] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const t = useMessages(setupFormMessages);
  const shared = useMessages(sharedMessages);

  if (token === null) {
    return (
      <main className="shell">
        <BackLink fallback="#/people" />
        <PageHeader title={t.heading} />
        <StatusMessage kind="error">{t.missingToken}</StatusMessage>
      </main>
    );
  }

  const submit = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (password !== confirm) {
      setError(shared.passwordMismatch);
      return;
    }
    setBusy(true);
    setError(undefined);
    void setup(token, username, password)
      .then(() => {
        // Not '#/': `parseRoute` strips the trailing slash, leaving a bare '#' that matches
        // no route and falls through to `home`, whose `HomeRedirect` renders nothing for one
        // frame before correcting itself (#263) — a blank flash this skips by landing on the
        // real destination directly.
        window.location.hash = '#/people';
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <main className="shell">
      <BackLink fallback="#/people" />
      <PageHeader title={t.heading} />
      {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
      <form onSubmit={submit}>
        <div className="field-grid">
          <TextField label={shared.usernameLabel} autoComplete="username" value={username} onChange={setUsername} />
          <PasswordField
            label={t.passwordLabel}
            autoComplete="new-password"
            value={password}
            onChange={setPasswordInput}
          />
          <PasswordField
            label={shared.confirmPasswordLabel}
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
          />
        </div>
        <p className="actions">
          <button type="submit" disabled={busy || username === '' || password === '' || confirm === ''}>
            {t.submitButton}
          </button>
        </p>
      </form>
    </main>
  );
}
