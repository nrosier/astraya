/**
 * Message catalogue for `ProfileTile.tsx`.
 */
/**
 * @module ProfileTile.messages
 * @purpose English/Dutch strings for the sidebar profile tile and its popover: role names, Preferences and Admin Panel links, the Language and Theme segmented groups, and the guest menu label.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `ProfileTile.tsx`; `nl` is typed as `typeof en`. Sign in / Sign out wording is reused from `AccountPanel.messages.ts`.
 * @exports profileTileMessages
 */
const en = {
  roleUser: 'User',
  roleAdmin: 'Admin',
  roleSuperAdmin: 'Super admin',
  guestIdentity: 'Not signed in',
  guestStatus: 'Data stays on this device',
  preferences: 'Preferences',
  adminPanel: 'Admin Panel',
  language: 'Language',
  theme: 'Theme',
  light: 'Light',
  dark: 'Dark',
  lightGlyph: '☀',
  darkGlyph: '☾',
  kebabGlyph: '⋮',
  menuLabel: 'Account menu',
};

const nl: typeof en = {
  roleUser: 'Gebruiker',
  roleAdmin: 'Beheerder',
  roleSuperAdmin: 'Hoofdbeheerder',
  guestIdentity: 'Niet ingelogd',
  guestStatus: 'Gegevens blijven op dit apparaat',
  preferences: 'Voorkeuren',
  adminPanel: 'Beheerpaneel',
  language: 'Taal',
  theme: 'Thema',
  light: 'Licht',
  dark: 'Donker',
  lightGlyph: '☀',
  darkGlyph: '☾',
  kebabGlyph: '⋮',
  menuLabel: 'Accountmenu',
};

export const profileTileMessages = { en, nl };
