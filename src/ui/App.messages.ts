/**
 * Message catalogue for `App.tsx` (#158).
 */
/**
 * @module App.messages
 * @purpose English/Dutch i18n strings for the application shell: loading states, storage-unavailable warning, skip link, and footer links.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by App.tsx via `useMessages(appMessages)`; `nl` is typed as `typeof en`.
 * @exports appMessages
 */
const en = {
  openingLocalData: 'Opening your local data…',
  noLocalStorage: 'No local storage',
  noLocalStorageWarning: (message: string) =>
    `Your data is stored in this browser, and this browser will not let us open it. ${message}`,
  noLocalStorageHint:
    'Private-browsing windows and blocked site data are the usual causes. Nothing has been lost — anything saved earlier is still there once storage is available again.',

  loadingEphemeris: 'Loading ephemeris…',
  loadingScreen: 'Loading…',

  skipToContent: 'Skip to main content',
  homeLinkLabel: 'Astraya, back to the people list',

  changelogLink: (version: string) => `Version ${version}`,
  aboutLink: 'about & licence',
};

const nl: typeof en = {
  openingLocalData: 'Lokale gegevens worden geopend…',
  noLocalStorage: 'Geen lokale opslag',
  noLocalStorageWarning: (message: string) =>
    `Je gegevens worden opgeslagen in deze browser, en deze browser laat ons dit niet openen. ${message}`,
  noLocalStorageHint:
    'Privénavigatievensters en geblokkeerde sitegegevens zijn de gebruikelijke oorzaken. Er is niets verloren gegaan — alles wat eerder is opgeslagen, staat er nog zodra opslag weer beschikbaar is.',

  loadingEphemeris: 'Ephemeris wordt geladen…',
  loadingScreen: 'Laden…',

  skipToContent: 'Ga naar de hoofdinhoud',
  homeLinkLabel: 'Astraya, terug naar de lijst met mensen',

  changelogLink: (version: string) => `Versie ${version}`,
  aboutLink: 'over & licentie',
};

export const appMessages = { en, nl };
