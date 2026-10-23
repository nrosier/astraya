/**
 * Message catalogue for `AccountPanel.tsx` (#158).
 */
/**
 * @module AccountPanel.messages
 * @purpose English/Dutch i18n strings for sign-in/sign-out, account adoption, and local-data-removal UI.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by AccountPanel.tsx via `useMessages(accountPanelMessages)`; `nl` is typed as `typeof en`.
 * @exports accountPanelMessages
 */
const en = {
  oneChange: '1 change',
  changesCount: (n: string) => `${n} changes`,
  adoptionPrompt: (changes: string) =>
    `This device saved ${changes} before you signed in. Add it to your account so it syncs to your other devices, or leave it here.`,
  adoptionFailed: (message: string) => `That did not go through, so nothing has changed. ${message}`,
  addToAccountButton: 'Add it to my account',
  leaveOnDeviceButton: 'Leave it on this device',

  ssoConsequence: 'Single sign-on: you sign in at Authentik and come back here.',
  showPasswordLabel: 'Show password',
  hidePasswordLabel: 'Hide password',
  ssoExplainer: 'You will go to Authentik to sign in, then return here. Astraya never sees your Authentik password.',
  signInWithOpenId: 'Sign in with OpenID',
  otherLoginMethod: 'Select another login method',
  ssoContinuing: 'Opening Authentik…',

  signInButton: 'Sign in',
  closeLabel: 'Close',
  signInPopoverHeading: 'Sign in to sync this device',
  signInExplainer:
    'An account syncs your data to your other devices. It is optional — (almost) everything here already works with no account, on this device alone.',
  passwordLabel: 'Password',

  signOutButton: 'Sign out',
  manageUsersLink: 'Admin',
  signOutFailed: (message: string) => `That did not go through, so you are still signed in. ${message}`,

  removeDataPrompt: 'Signed out. This device still has a local copy of that account’s data.',
  removeDataButton: 'Remove it from this device',
  removeDataConfirm:
    'This deletes this account’s data from this device only. It stays in your account and comes back the next time you sign in here. Continue?',
  removeDataFailed: (message: string) => `That did not go through, so nothing was removed. ${message}`,

  demoModeBadge: 'Demo — no sign-in or sync here',
};

const nl: typeof en = {
  oneChange: '1 wijziging',
  changesCount: (n: string) => `${n} wijzigingen`,
  adoptionPrompt: (changes: string) =>
    `Dit apparaat heeft ${changes} opgeslagen voordat je inlogde. Voeg het toe aan je account zodat het synchroniseert naar je andere apparaten, of laat het hier staan.`,
  adoptionFailed: (message: string) => `Dat is niet gelukt, er is dus niets veranderd. ${message}`,
  addToAccountButton: 'Toevoegen aan mijn account',
  leaveOnDeviceButton: 'Op dit apparaat laten staan',

  ssoConsequence: 'Single sign-on: je logt in bij Authentik en komt hier terug.',
  showPasswordLabel: 'Wachtwoord tonen',
  hidePasswordLabel: 'Wachtwoord verbergen',
  ssoExplainer:
    'Je gaat naar Authentik om in te loggen en komt daarna hier terug. Astraya ziet je Authentik-wachtwoord nooit.',
  signInWithOpenId: 'Inloggen met OpenID',
  otherLoginMethod: 'Kies een andere inlogmethode',
  ssoContinuing: 'Authentik openen…',

  signInButton: 'Inloggen',
  closeLabel: 'Sluiten',
  signInPopoverHeading: 'Inloggen om dit apparaat te synchroniseren',
  signInExplainer:
    'Een account synchroniseert je gegevens naar je andere apparaten. Het is optioneel — (bijna) alles hier werkt al zonder account, op dit apparaat alleen.',
  passwordLabel: 'Wachtwoord',

  signOutButton: 'Uitloggen',
  manageUsersLink: 'Beheer',
  signOutFailed: (message: string) => `Dat is niet gelukt, je bent dus nog steeds ingelogd. ${message}`,

  removeDataPrompt: 'Uitgelogd. Dit apparaat heeft nog een lokale kopie van de gegevens van dat account.',
  removeDataButton: 'Verwijderen van dit apparaat',
  removeDataConfirm:
    'Dit verwijdert de gegevens van dit account alleen van dit apparaat. Ze blijven in je account en komen terug de volgende keer dat je hier inlogt. Doorgaan?',
  removeDataFailed: (message: string) => `Dat is niet gelukt, er is dus niets verwijderd. ${message}`,

  demoModeBadge: 'Demo — geen inloggen of synchronisatie hier',
};

export const accountPanelMessages = { en, nl };
