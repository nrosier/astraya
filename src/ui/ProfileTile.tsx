/**
 * The sidebar's account tile and its popover (#964), replacing the scattered Sign out, Admin,
 * Preferences, language and theme pills that used to sit in the sidebar foot.
 *
 * The tile is the one popup trigger (`aria-haspopup`, `aria-expanded`). Its popover opens above
 * the tile and holds, top to bottom: the identity header, Preferences, Admin Panel (administrative
 * roles only), the segmented Language and Theme controls, and the account action (Sign out, or
 * Sign in for a guest). The segmented controls apply at once and leave the popover open.
 * Dismissal (Escape with focus back on the tile, a press outside, tabbing out, or a page change) is
 * `useExclusiveOpen`'s, the same rules as the header's other dropdowns, not a second open/close system.
 *
 * Theme here is a two-way segmented choice, `[ ☀ Light | ☾ Dark ]` (owner decision on #964). When
 * the stored choice is "follow the system", the segment shows the OS theme, so one is always
 * selected. The Preferences page keeps its three-way `ThemeToggle` unchanged.
 */
/**
 * @module ProfileTile
 * @purpose Sidebar account tile (signed-in or guest) and its popover: identity, Preferences, Admin Panel for admins, segmented Language and Theme, and Sign out or Sign in.
 * @conventions Open/close and focus rules come from use-exclusive-open.ts; the two quick toggles are segmented ChoiceGroups; theme goes through theme-dom.ts and locale through the shared locale store. Colours come only from existing app.css tokens. Text comes from ProfileTile.messages.ts and AccountPanel.messages.ts via useMessages().
 * @exports ProfileTile
 */
import { useId, useState, useSyncExternalStore } from 'react';
import { CORPUS_LOCALES } from '../interpretation/schema.js';
import type { AuthUser } from '../sync/auth-client.js';
import { accountPanelMessages } from './AccountPanel.messages.js';
import { isLocale, setLocale, useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { profileTileMessages } from './ProfileTile.messages.js';
import { ChoiceGroup } from './primitives/ChoiceGroup.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { applyTheme, readStoredTheme, writeStoredTheme } from './theme-dom.js';
import type { Theme } from './theme.js';
import { useExclusiveOpen } from './use-exclusive-open.js';

const KEY = 'profile';
type DisplayTheme = 'light' | 'dark';

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

function currentHash(): string {
  return window.location.hash;
}

/** The theme the page shows: an explicit choice, or the OS setting when the stored choice is "system". */
function displayTheme(stored: Theme): DisplayTheme {
  if (stored === 'light' || stored === 'dark') return stored;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function isDisplayTheme(value: string): value is DisplayTheme {
  return value === 'light' || value === 'dark';
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
  const [locale] = useLocale();
  // A page change (the hash) closes the popover, the same signal `AppNav` uses.
  const route = useSyncExternalStore(subscribeToHash, currentHash);
  const dropdown = useExclusiveOpen<typeof KEY>(route);
  const open = dropdown.open === KEY;
  const popupId = useId();
  const [storedTheme, setStoredTheme] = useState<Theme>(() => readStoredTheme());
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
      {user === undefined ? (
        <>
          <button
            type="button"
            className="profile-tile profile-tile-guest"
            onClick={() => {
              onSignIn();
            }}
          >
            {account.signInButton}
          </button>
          <button
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
          </button>
        </>
      ) : (
        <button
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
          <span className="profile-tile-avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="profile-tile-name">{user.username}</span>
          {user.isAdmin && <span className="profile-tile-role">{roleLabel}</span>}
          <span className="profile-tile-kebab" aria-hidden="true">
            {t.kebabGlyph}
          </span>
        </button>
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
            <div className="profile-popover-row">
              <span className="profile-popover-row-label" aria-hidden="true">
                {t.language}
              </span>
              <ChoiceGroup
                label={t.language}
                segmented
                value={locale}
                options={CORPUS_LOCALES.map((code) => ({ value: code, label: code.toUpperCase() }))}
                onChange={(value) => {
                  if (isLocale(value)) setLocale(value);
                }}
              />
            </div>
            <div className="profile-popover-row">
              <span className="profile-popover-row-label" aria-hidden="true">
                {t.theme}
              </span>
              <ChoiceGroup
                label={t.theme}
                segmented
                value={displayTheme(storedTheme)}
                options={[
                  { value: 'light', label: `${t.lightGlyph} ${t.light}` },
                  { value: 'dark', label: `${t.darkGlyph} ${t.dark}` },
                ]}
                onChange={(value) => {
                  if (!isDisplayTheme(value)) return;
                  writeStoredTheme(value);
                  applyTheme(value);
                  setStoredTheme(value);
                }}
              />
            </div>
          </div>
          <div className="profile-popover-separator" aria-hidden="true" />
          <div className="profile-popover-section">
            {user === undefined ? (
              <button
                type="button"
                className="profile-popover-action"
                onClick={() => {
                  dropdown.close();
                  onSignIn();
                }}
              >
                {account.signInButton}
              </button>
            ) : (
              <button type="button" className="profile-popover-action danger" disabled={busy} onClick={signOut}>
                {account.signOutButton}
              </button>
            )}
            {error !== undefined && <StatusMessage kind="error">{account.signOutFailed(error)}</StatusMessage>}
          </div>
        </div>
      )}
    </div>
  );
}
