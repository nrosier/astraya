/**
 * Message catalogue for `PwaStatus.tsx` (#158).
 */
/**
 * @module PwaStatus.messages
 * @purpose English/Dutch message catalogue for the PWA update-ready and offline-cache-warming status banner.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `PwaStatus.tsx`.
 * @exports pwaStatusMessages
 */
const en = {
  updateReady: 'An updated version is ready.',
  reloadToUpdate: 'Reload to update',
  warming: (loaded: string, total: string) => `Preparing offline use: ${loaded} of ${total}.`,
  warmFailed: (message: string) => `Could not prepare this device for offline use: ${message}`,
};

const nl: typeof en = {
  updateReady: 'Er is een nieuwe versie beschikbaar.',
  reloadToUpdate: 'Herladen om bij te werken',
  warming: (loaded: string, total: string) => `Offline gebruik voorbereiden: ${loaded} van ${total}.`,
  warmFailed: (message: string) => `Dit apparaat kon niet worden voorbereid voor offline gebruik: ${message}`,
};

export const pwaStatusMessages = { en, nl };
