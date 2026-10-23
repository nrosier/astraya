/**
 * Sign-in/out UI (#78, #109). Mounted globally in the sticky `app-header` (#421), right next to
 * `SyncBadge` (#230) — signed-in or signed-out state is the answer to "am I signed
 * in", and that has to be visible without navigating anywhere.
 *
 * Signed out: a compact "Sign in" button that opens a centred dialog with a non-nagging
 * explanation of what an account adds (sync to other devices), then one of two stages (#781):
 * the OpenID button when single sign-on is configured, or the local form — collapsed by
 * default so it costs no space on the common, signed-out path. Signed in: a sign-out button, no
 * click needed to confirm you're signed in since `SyncBadge`'s own "(logged in as:
 * {username})" already says so right next to it (#230) — this panel doesn't repeat it.
 * Between the two, at most once ever per device: the adoption prompt (#109), which
 * `signIn` puts this panel into instead of completing the switch on its own.
 */
/**
 * @module AccountPanel
 * @purpose Renders the sign-in/sign-out control mounted in the sticky app header, plus the one-time account-adoption prompt and local-data-removal flow.
 * @conventions Mounted globally alongside SyncBadge; reads session state via `useSession()`/`session-context.js`; the sign-in is a centred `StagedDialog` that swaps between an OpenID stage (when SSO is configured, #651) and a local-form stage (#781); text comes from co-located `AccountPanel.messages.ts` via `useMessages()`.
 * @exports AccountPanel
 */
import { Button } from './primitives/Button.js';
import { PasswordField } from './primitives/PasswordField.js';
import { StagedDialog } from './primitives/StagedDialog.js';
import { TextField } from './primitives/TextField.js';
import { useEffect, useRef, useState } from 'react';
import { removeAccountData, useSession } from './session-context.js';
import { getOidcConfig } from '../sync/auth-client.js';
import { accountPanelMessages } from './AccountPanel.messages.js';
import { useMessages } from './messages.js';
import { startOidcHandshake } from './oidc-pkce.js';
import { sharedMessages } from './shared.messages.js';
import { IS_DEMO_MODE } from '../demo-mode.js';
import type { AuthUser, OidcConfig } from '../sync/auth-client.js';
import { StatusMessage } from './primitives/StatusMessage.js';

function changes(count: number, t: typeof accountPanelMessages.en): string {
  return count === 1 ? t.oneChange : t.changesCount(String(count));
}

function AdoptionPanel({
  recordCount,
  resolveAdoption,
}: {
  recordCount: number;
  resolveAdoption: (accept: boolean) => Promise<void>;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const t = useMessages(accountPanelMessages);

  const resolve = (accept: boolean): void => {
    setBusy(true);
    setError(undefined);
    void resolveAdoption(accept).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    });
  };

  return (
    <div className="accountpanel-popover">
      <p>{t.adoptionPrompt(changes(recordCount, t))}</p>
      {error !== undefined && <StatusMessage kind="error">{t.adoptionFailed(error)}</StatusMessage>}
      <p className="actions">
        <button
          disabled={busy}
          onClick={() => {
            resolve(true);
          }}
        >
          {t.addToAccountButton}
        </button>
        <button
          className="quiet"
          disabled={busy}
          onClick={() => {
            resolve(false);
          }}
        >
          {t.leaveOnDeviceButton}
        </button>
      </p>
    </div>
  );
}

type SignInStage = 'openid' | 'local';

function ShieldIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" focusable="false">
      <path d="m6 9 6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A real top-level navigation to Authentik's `authorization_endpoint`, submitted as a
 * plain GET form rather than `window.location.href = ...` — hidden inputs keep the PKCE
 * challenge and other params out of a manually-constructed URL string. `main.tsx` never
 * needs to know this happened: the callback is consumed and exchanged entirely inside
 * `session-context.tsx`'s boot effect on the next load.
 *
 * `authorizationEndpoint` comes from the server's `/api/auth/oidc/config`, not from a
 * browser-side fetch of the issuer's own discovery document: that fetch would depend on
 * the issuer sending CORS headers on `/.well-known/openid-configuration`, which Authentik
 * does not do by default, and fails with an opaque cross-origin error when it doesn't.
 */
function OidcSignIn({
  config,
  onOtherMethod,
}: {
  config: { clientId: string; authorizationEndpoint: string };
  onOtherMethod: () => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const t = useMessages(accountPanelMessages);

  const start = (): void => {
    setBusy(true);
    setError(undefined);
    void (async () => {
      const { state, nonce, codeChallenge, redirectUri } = await startOidcHandshake();

      const form = document.createElement('form');
      form.method = 'GET';
      form.action = config.authorizationEndpoint;
      const fields: Record<string, string> = {
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        // `openid` alone gets only `sub` — Authentik only includes `preferred_username`
        // (and `name`/`email`) in the id_token when the `profile` scope is actually
        // requested, so without it every account is provisioned under its raw subject
        // hash instead of a real username.
        scope: 'openid profile',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        nonce,
      };
      for (const [name, value] of Object.entries(fields)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.append(input);
      }
      document.body.append(form);
      form.submit();
    })().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    });
  };

  return (
    <>
      {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
      <Button variant="primary" busy={busy} busyLabel={t.ssoContinuing} onClick={start}>
        <ShieldIcon />
        {t.signInWithOpenId}
      </Button>
      <p>{t.ssoConsequence}</p>
      <p>{t.ssoExplainer}</p>
      <p className="signin-switch">
        <Button variant="quiet" onClick={onOtherMethod}>
          {t.otherLoginMethod}
          <ChevronIcon />
        </Button>
      </p>
    </>
  );
}

/**
 * Collapsed to a compact "Sign in" button by default — this lives in the sticky header at
 * the top right of every screen (#421), so an always-open form would sit over the page on
 * every route rather than just where it's relevant. Opening it shows the sign-in as a centred
 * dialog (`StagedDialog`, #506/#508) on one of two stages (#781): the OpenID button (when SSO is
 * configured, the default) or the local form, swapped by a text button at the bottom. Closing it
 * (Escape, the ×, a backdrop press, or a successful sign-in) hides it again without losing
 * anything typed elsewhere on the page, and returns focus to the trigger and
 * the next opening starts on the OpenID stage again.
 */
function SignInForm({
  signIn,
  oidcConfig,
}: {
  signIn: (username: string, password: string) => Promise<void>;
  oidcConfig: OidcConfig | undefined;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ssoConfig = oidcConfig?.enabled === true ? oidcConfig : undefined;
  // Derived rather than initialised from `ssoConfig`, which loads async: until it resolves (or if SSO is off) the dialog is the local form (#651, #781).
  const [chosen, setChosen] = useState<SignInStage>();
  const stage: SignInStage = ssoConfig === undefined ? 'local' : (chosen ?? 'openid');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // The trigger stays mounted while the dialog is open: StagedDialog returns focus to it on close (#69).
  const triggerRef = useRef<HTMLButtonElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const t = useMessages(accountPanelMessages);
  const shared = useMessages(sharedMessages);

  const close = (): void => {
    setOpen(false);
    setChosen(undefined);
  };

  const switchTo = (next: SignInStage): void => {
    setChosen(next);
    setError(undefined);
  };

  // Focus the first field once the local stage is showing. Not React's autoFocus, which runs before StagedDialog calls showModal.
  useEffect(() => {
    if (open && stage === 'local') usernameRef.current?.focus();
  }, [open, stage]);

  const submit = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    void signIn(username, password)
      .then(() => {
        setPassword('');
        close();
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="corner-pill corner-signin"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
        }}
      >
        {t.signInButton}
      </button>
      <StagedDialog
        open={open}
        heading={t.signInPopoverHeading}
        closeLabel={t.closeLabel}
        onDiscard={close}
        returnFocusTo={triggerRef}
        footer={null}
        dialogClassName="signin-card"
      >
        <p>{t.signInExplainer}</p>
        {stage === 'openid' && ssoConfig !== undefined ? (
          <OidcSignIn
            config={ssoConfig}
            onOtherMethod={() => {
              switchTo('local');
            }}
          />
        ) : (
          <>
            {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
            <form onSubmit={submit}>
              <div className="field-grid">
                <TextField
                  label={shared.usernameLabel}
                  inputRef={usernameRef}
                  autoComplete="username"
                  value={username}
                  onChange={setUsername}
                />
                <PasswordField
                  label={t.passwordLabel}
                  autoComplete="current-password"
                  value={password}
                  onChange={setPassword}
                  revealable
                  showLabel={t.showPasswordLabel}
                  hideLabel={t.hidePasswordLabel}
                />
              </div>
              <p className="actions">
                <Button type="submit" variant="primary" disabled={busy || username.trim() === '' || password === ''}>
                  {t.signInButton}
                </Button>
              </p>
            </form>
            {ssoConfig !== undefined && (
              <p className="signin-switch">
                <Button
                  variant="quiet"
                  onClick={() => {
                    switchTo('openid');
                  }}
                >
                  {t.signInWithOpenId}
                  <ChevronIcon />
                </Button>
              </p>
            )}
          </>
        )}
      </StagedDialog>
    </>
  );
}

/**
 * No "signed in as" text here — `SyncBadge`'s "(logged in as: {username})" already
 * says that, right next to this in the header (#230, #421).
 */
function SignedIn({
  user,
  signOut,
  onSignedOut,
}: {
  user: AuthUser;
  signOut: () => Promise<void>;
  onSignedOut: (userId: string) => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const t = useMessages(accountPanelMessages);

  const doSignOut = (): void => {
    setBusy(true);
    setError(undefined);
    // Captured before `signOut()` resolves: the `user` prop is gone once this component
    // unmounts along with it, so there's no reading `user.id` back afterwards.
    const userId = user.id;
    void signOut()
      .then(() => {
        onSignedOut(userId);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setBusy(false);
      });
  };

  return (
    <div className="accountpanel-signedin">
      <button className="corner-pill quiet" disabled={busy} onClick={doSignOut}>
        {t.signOutButton}
      </button>
      {user.isAdmin && (
        <button
          type="button"
          className="corner-pill quiet"
          onClick={() => {
            window.location.hash = '#/admin';
          }}
        >
          {t.manageUsersLink}
        </button>
      )}
      {error !== undefined && <StatusMessage kind="error">{t.signOutFailed(error)}</StatusMessage>}
    </div>
  );
}

/**
 * Offered only once signed out of `userId`'s account (#327) — never while its store is
 * the one currently open, since deleting that database out from under a live `Store`
 * instance is exactly the kind of write-after-close bug `store.ts` closing on sign-out
 * already exists to avoid. Uses `window.confirm`, matching `People.tsx`'s convention for
 * a destructive, no-undo local action: the data is still safe in the account itself (the
 * next sign-in re-syncs it), but there's no in-app undo for the local copy once it's gone.
 */
function RemoveAccountData({ userId, onRemoved }: { userId: string; onRemoved: () => void }): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const t = useMessages(accountPanelMessages);

  const remove = (): void => {
    if (!window.confirm(t.removeDataConfirm)) return;
    setBusy(true);
    setError(undefined);
    void removeAccountData(userId)
      .then(onRemoved)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setBusy(false);
      });
  };

  return (
    <div className="accountpanel-popover">
      <p>{t.removeDataPrompt}</p>
      {error !== undefined && <StatusMessage kind="error">{t.removeDataFailed(error)}</StatusMessage>}
      <p className="actions">
        <button className="quiet" disabled={busy} onClick={remove}>
          {t.removeDataButton}
        </button>
      </p>
    </div>
  );
}

export function AccountPanel(): React.JSX.Element {
  const { user, adoption, signIn, signOut, resolveAdoption } = useSession();
  const [oidcConfig, setOidcConfig] = useState<OidcConfig>();
  // Which account's local data can still be removed from this device (#327) — set once
  // `SignedIn` reports a completed sign-out, cleared either by removal succeeding or by
  // signing back in (whichever happens first makes the prompt moot).
  const [removableAccount, setRemovableAccount] = useState<string>();
  const t = useMessages(accountPanelMessages);

  useEffect(() => {
    // Demo mode has no server to ask — skip the fetch entirely rather than let
    // it fail every load.
    if (IS_DEMO_MODE) return;
    // Best-effort: the password form above works regardless, so a failed fetch here
    // just means no "Sign in with Authentik" button rather than a broken panel.
    void getOidcConfig()
      .then(setOidcConfig)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    // A sign-in makes the prompt moot either way: signing back into the same account
    // reopens its store (nothing to remove), and signing into a different one leaves
    // the removable account's data exactly as it was, with the prompt just no longer
    // relevant to what's on screen.
    if (user !== undefined) setRemovableAccount(undefined);
  }, [user]);

  // Positioned so the popover/warning below — absolutely positioned, `right: 0` beneath the
  // trigger — anchors to this trigger's own box rather than to the header's (#230, #421: this
  // shares the header with `SyncBadge`, so anchoring to the shared container would misplace the
  // popover under whichever control sits first).
  return (
    <div className="accountpanel">
      {IS_DEMO_MODE ? (
        <span className="corner-pill accountpanel-demo">{t.demoModeBadge}</span>
      ) : adoption !== undefined ? (
        <AdoptionPanel recordCount={adoption.recordCount} resolveAdoption={resolveAdoption} />
      ) : user === undefined ? (
        <>
          <SignInForm signIn={signIn} oidcConfig={oidcConfig} />
          {removableAccount !== undefined && (
            <RemoveAccountData
              userId={removableAccount}
              onRemoved={() => {
                setRemovableAccount(undefined);
              }}
            />
          )}
        </>
      ) : (
        <SignedIn user={user} signOut={signOut} onSignedOut={setRemovableAccount} />
      )}
    </div>
  );
}
