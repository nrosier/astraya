/**
 * Message catalogue for `SidebarFooter.tsx`.
 */
/**
 * @module SidebarFooter.messages
 * @purpose English/Dutch strings for the sidebar footer: the update notice and its Reload button, the version link and the About & Licence link.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `SidebarFooter.tsx`; `nl` is typed as `typeof en`.
 * @exports sidebarFooterMessages
 */
const en = {
  updateAvailable: 'New version available',
  reload: 'Reload',
  versionLink: (version: string) => `Version ${version}`,
  aboutLink: 'About & Licence',
  separator: '•',
};

const nl: typeof en = {
  updateAvailable: 'Nieuwe versie beschikbaar',
  reload: 'Herladen',
  versionLink: (version: string) => `Versie ${version}`,
  aboutLink: 'Over & licentie',
  separator: '•',
};

export const sidebarFooterMessages = { en, nl };
