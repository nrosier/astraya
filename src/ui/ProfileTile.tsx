/**
 * The sidebar's account tile and its popover (#964), replacing the scattered Sign out, Admin,
 * Preferences, language and theme pills that used to sit in the sidebar foot.
 *
 * The tile is the one popup trigger (`aria-haspopup`, `aria-expanded`). Its popover opens above the tile and
 * holds, top to bottom: the identity header, Preferences, Admin Panel (administrative roles only), and the
 * account action (Sign out, or Sign in for a guest). Language, theme and the symbol class are chosen in
 * Preferences, not here (#1183). The avatar, with the sync status dot on its corner, is its own button beside
 * the tile (a guest gets the dot alone) and opens the sync popover (`SyncBadge`). Dismissal (Escape with focus
 * back on the tile, a press outside, tabbing out, or a page change) is `useExclusiveOpen`'s, the same rules as
 * the header's other dropdowns, not a second open/close system.
 */
/**
 * @module ProfileTile
 * @purpose Sidebar account tile (signed-in or guest), its sync status dot and its popover: identity, Preferences, Admin Panel for admins, and Sign out or Sign in.
 * @conventions Open/close and focus rules come from use-exclusive-open.ts. The popover holds exactly those items; language and theme live in Preferences (#1183). Hosts SyncBadge (the avatar and sync dot) as the first item of the row, beside the tile button, so no two targets overlap. Colours come only from existing app.css tokens. Text comes from ProfileTile.messages.ts and AccountPanel.messages.ts via useMessages().
 * @exports ProfileTile
 */
import { useId, useState, useSyncExternalStore } from 'react';
import type { AuthUser } from '../sync/auth-client.js';
import { accountPanelMessages } from './AccountPanel.messages.js';
import { useMessages } from './messages.js';
import { profileTileMessages } from './ProfileTile.messages.js';
import { Button } from './primitives/Button.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { SyncBadge } from './SyncBadge.js';
import { useExclusiveOpen } from './use-exclusive-open.js';

const KEY = 'profile';

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

function currentHash(): string {
  return window.location.hash;
}

export function ProfileTile({
  user,
  onSignIn,
  onSignOut,
  onSignedOut,
}: {
  /** The signed-in account, or `undefined` for a guest. */
  readonly user: AuthUser | undefined;
  /** Opens the sign-in dialog (a guest's account action). */
  readonly onSignIn: () => void;
  readonly onSignOut: () => Promise<void>;
  /** Reports which account just signed out, so its local data can be offered for removal. */
  readonly onSignedOut: (userId: string) => void;
}): React.JSX.Element {
  const t = useMessages(profileTileMessages);
  const account = useMessages(accountPanelMessages);
  // A page change (the hash) closes the popover, the same signal `AppNav` uses.
  const route = useSyncExternalStore(subscribeToHash, currentHash);
  const dropdown = useExclusiveOpen<typeof KEY>(route);
  const open = dropdown.open === KEY;
  const popupId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const roleLabel =
    user === undefined
      ? t.guestIdentity
      : user.role === 'super_admin'
        ? t.roleSuperAdmin
        : user.isAdmin
          ? t.roleAdmin
          : t.roleUser;
  const initial = user === undefined ? '' : user.username.trim().charAt(0).toUpperCase() || '?';

  const signOut = (): void => {
    if (user === undefined) return;
    setBusy(true);
    setError(undefined);
    const userId = user.id;
    onSignOut()
      .then(() => {
        setBusy(false);
        dropdown.close();
        onSignedOut(userId);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setBusy(false);
      });
  };

  return (
    <div
      ref={dropdown.groupRef(KEY)}
      className={open ? 'profile open' : 'profile'}
      onBlur={(event) => {
        dropdown.onGroupBlur(KEY, event);
      }}
    >
      <SyncBadge {...(user === undefined ? {} : { initial })} />
      {user === undefined ? (
        <>
          <Button
            variant="plain"
            className="profile-tile profile-tile-guest"
            onClick={() => {
              onSignIn();
            }}
          >
            {account.signInButton}
          </Button>
          <Button
            ref={dropdown.buttonRef(KEY)}
            type="button"
            className="profile-tile-menu"
            aria-label={t.menuLabel}
            aria-haspopup="true"
            aria-expanded={open}
            aria-controls={open ? popupId : undefined}
            onClick={() => {
              dropdown.toggle(KEY);
            }}
          >
            {t.kebabGlyph}
          </Button>
        </>
      ) : (
        <Button
          variant="plain"
          ref={dropdown.buttonRef(KEY)}
          type="button"
          className="profile-tile"
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={open ? popupId : undefined}
          onClick={() => {
            dropdown.toggle(KEY);
          }}
        >
          <span className="profile-tile-name">{user.username}</span>
          {user.isAdmin && <span className="profile-tile-role">{roleLabel}</span>}
          <span className="profile-tile-kebab" aria-hidden="true">
            {t.kebabGlyph}
          </span>
        </Button>
      )}
      {open && (
        <div id={popupId} className="profile-popover" role="group" aria-label={t.menuLabel}>
          <div className="profile-popover-identity">
            <span className="profile-popover-name">{user?.username ?? t.guestIdentity}</span>
            <span className="profile-popover-status">{user === undefined ? t.guestStatus : roleLabel}</span>
          </div>
          <div className="profile-popover-separator" aria-hidden="true" />
          <div className="profile-popover-section">
            <a
              className="profile-popover-link"
              href="#/preferences"
              onClick={() => {
                dropdown.close();
              }}
            >
              {t.preferences}
            </a>
            {user?.isAdmin === true && (
              <a
                className="profile-popover-link"
                href="#/admin"
                onClick={() => {
                  dropdown.close();
                }}
              >
                {t.adminPanel}
              </a>
            )}
          </div>
          <div className="profile-popover-separator" aria-hidden="true" />
          <div className="profile-popover-section">
            {user === undefined ? (
              <Button
                variant="plain"
                className="profile-popover-action"
                onClick={() => {
                  dropdown.close();
                  onSignIn();
                }}
              >
                {account.signInButton}
              </Button>
            ) : (
              <Button variant="plain" className="profile-popover-action danger" disabled={busy} onClick={signOut}>
                {account.signOutButton}
              </Button>
            )}
            {error !== undefined && <StatusMessage kind="error">{account.signOutFailed(error)}</StatusMessage>}
          </div>
        </div>
      )}
    </div>
  );
}
