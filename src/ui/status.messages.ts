/**
 * Message catalogue for `status.ts` (#158). `ago()`, `changes()` and `describeStatus()`
 * are pure functions with no locale access of their own, so each now takes a `t` of this
 * shape — the same pattern `AccountPanel.tsx`'s `changes()` uses.
 */
/**
 * @module ui/status.messages
 * @purpose en/nl message catalogue for status.ts's pure formatting functions (ago(), changes(), describeStatus()) describing sync/persistence state.
 * @conventions Read directly (not via useMessages) since status.ts's functions are plain functions with no locale access of their own and take a `t` parameter of this shape, the same pattern AccountPanel.tsx's own changes() uses.
 * @exports statusMessages
 */
const en = {
  justNow: 'just now',
  minutesAgo: (n: string) => `${n} minutes ago`,
  anHourAgo: 'an hour ago',
  hoursAgo: (n: string) => `${n} hours ago`,
  yesterday: 'yesterday',
  daysAgo: (n: string) => `${n} days ago`,

  oneChange: '1 change',
  changesCount: (n: string) => `${n} changes`,

  syncFailing: 'Sync failing',
  syncRetrying: 'Sync retrying',
  syncFailingDetail: (since: string, reason: string) =>
    `Syncing has been failing since ${since}. Nothing has been lost — every change is saved on this device and will be sent when syncing recovers. ${reason}`,
  syncFailureReason: {
    offline: 'There is no network connection.',
    unauthorized: 'Your session has expired. Sign in again to keep syncing.',
    server: 'The server is having trouble.',
    malformed: 'The server sent a reply this app could not read.',
    rejected: 'The server refused a request.',
    quota: 'This account has reached its storage limit on the server.',
    'account-mismatch': 'This device is now signed in to a different account.',
    unknown: 'Something unexpected went wrong.',
  },
  exportACopy: 'Export a copy',

  quarantinedLabel: (n: string) => `${n} won't sync`,
  quarantinedDetail: (changes: string) =>
    `${changes} could not sync because this device's clock was off when they were made. They are still saved here, but will not be retried — export a copy to keep them.`,

  quotaLabel: 'Storage full',
  quotaDetail: (changes: string) =>
    `This account has reached its storage limit on the server, so ${changes} cannot be sent. Nothing has been lost — every change is saved on this device. Export a copy to keep them.`,

  localOnly: 'Local only',
  localOnlyEvictableDetail:
    'This device holds the only copy of your data, and the browser has not promised to keep it. Export a copy, or sign in to sync.',
  localOnlyPersistedDetail:
    'This device holds the only copy of your data. The browser has agreed to keep it, but a lost device is a lost copy — export a copy, or sign in to sync.',
  howToKeepACopy: 'How to keep a copy',

  syncingLabel: 'Syncing…',
  sendingDetail: (changes: string) => `Sending ${changes} to your server.`,

  offline: 'Offline',
  offlineWaitingLabel: (changes: string) => `Offline — ${changes} waiting`,
  offlineNoneWaitingDetail: 'No network. Everything works offline; nothing is waiting to be sent.',
  offlineWaitingDetail: (changes: string) =>
    `No network. ${changes} are saved on this device and will be sent when you are back online.`,

  toSendLabel: (changes: string) => `${changes} to send`,
  waitingToSync: 'Waiting to sync.',

  synced: 'Synced',
  syncedDetail: (ago: string) => `Everything reached your server ${ago}.`,

  heldBackLine: (n: string) =>
    n === '1'
      ? '1 note kept on this device only because it is too long to sync.'
      : `${n} notes kept on this device only because they are too long to sync.`,
};

const nl: typeof en = {
  justNow: 'zojuist',
  minutesAgo: (n: string) => `${n} minuten geleden`,
  anHourAgo: 'een uur geleden',
  hoursAgo: (n: string) => `${n} uur geleden`,
  yesterday: 'gisteren',
  daysAgo: (n: string) => `${n} dagen geleden`,

  oneChange: '1 wijziging',
  changesCount: (n: string) => `${n} wijzigingen`,

  syncFailing: 'Synchronisatie mislukt',
  syncRetrying: 'Synchronisatie opnieuw proberen',
  syncFailingDetail: (since: string, reason: string) =>
    `Synchronisatie mislukt sinds ${since}. Er is niets verloren gegaan — elke wijziging is opgeslagen op dit apparaat en wordt verzonden zodra synchronisatie herstelt. ${reason}`,
  syncFailureReason: {
    offline: 'Er is geen netwerkverbinding.',
    unauthorized: 'Je sessie is verlopen. Log opnieuw in om te blijven synchroniseren.',
    server: 'De server heeft problemen.',
    malformed: 'De server stuurde een antwoord dat deze app niet kon lezen.',
    rejected: 'De server weigerde een verzoek.',
    quota: 'Dit account heeft de opslaglimiet op de server bereikt.',
    'account-mismatch': 'Dit apparaat is nu ingelogd bij een ander account.',
    unknown: 'Er ging iets onverwachts mis.',
  },
  exportACopy: 'Kopie exporteren',

  quarantinedLabel: (n: string) => `${n} synchroniseert niet`,
  quarantinedDetail: (changes: string) =>
    `${changes} konden niet synchroniseren omdat de klok van dit apparaat verkeerd stond toen ze werden gemaakt. Ze zijn hier nog wel opgeslagen, maar worden niet opnieuw geprobeerd — exporteer een kopie om ze te behouden.`,

  quotaLabel: 'Opslag vol',
  quotaDetail: (changes: string) =>
    `Dit account heeft de opslaglimiet op de server bereikt, daarom kunnen ${changes} niet worden verzonden. Er is niets verloren gegaan — elke wijziging is opgeslagen op dit apparaat. Exporteer een kopie om ze te behouden.`,

  localOnly: 'Alleen lokaal',
  localOnlyEvictableDetail:
    'Dit apparaat bevat de enige kopie van je gegevens, en de browser heeft niet toegezegd deze te bewaren. Exporteer een kopie, of log in om te synchroniseren.',
  localOnlyPersistedDetail:
    'Dit apparaat bevat de enige kopie van je gegevens. De browser heeft toegezegd deze te bewaren, maar een verloren apparaat is een verloren kopie — exporteer een kopie, of log in om te synchroniseren.',
  howToKeepACopy: 'Hoe bewaar je een kopie',

  syncingLabel: 'Synchroniseren…',
  sendingDetail: (changes: string) => `${changes} worden naar je server verzonden.`,

  offline: 'Offline',
  offlineWaitingLabel: (changes: string) => `Offline — ${changes} in wachtrij`,
  offlineNoneWaitingDetail: 'Geen netwerk. Alles werkt offline; er staat niets in de wachtrij.',
  offlineWaitingDetail: (changes: string) =>
    `Geen netwerk. ${changes} zijn opgeslagen op dit apparaat en worden verzonden zodra je weer online bent.`,

  toSendLabel: (changes: string) => `${changes} te verzenden`,
  waitingToSync: 'Wachten op synchronisatie.',

  synced: 'Gesynchroniseerd',
  syncedDetail: (ago: string) => `Alles is ${ago} bij je server aangekomen.`,

  heldBackLine: (n: string) =>
    n === '1'
      ? '1 notitie wordt alleen op dit apparaat bewaard omdat ze te lang is om te synchroniseren.'
      : `${n} notities worden alleen op dit apparaat bewaard omdat ze te lang zijn om te synchroniseren.`,
};

export const statusMessages = { en, nl };
