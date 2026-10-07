/**
 * Message catalogue for `SyncBadge.tsx` (#158).
 */
/**
 * @module SyncBadge.messages
 * @purpose English/Dutch message catalogue for the always-visible sync-status badge.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `SyncBadge.tsx`.
 * @exports syncBadgeMessages
 */
const en = {
  loggedInAs: (username: string) => `(logged in as: ${username})`,
  syncNow: 'Sync now',
};

const nl: typeof en = {
  loggedInAs: (username: string) => `(ingelogd als: ${username})`,
  syncNow: 'Nu synchroniseren',
};

export const syncBadgeMessages = { en, nl };
