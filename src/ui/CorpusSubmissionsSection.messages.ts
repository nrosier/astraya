/**
 * Message catalogue for `CorpusSubmissionsSection.tsx` (#1338, slice 2).
 */
/**
 * @module CorpusSubmissionsSection.messages
 * @purpose English/Dutch strings for the read-only admin list of corrections that users submitted.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by CorpusSubmissionsSection.tsx via `useMessages()`; `nl` is typed as `typeof en`.
 * @exports corpusSubmissionsSectionMessages
 */
const en = {
  heading: 'Submitted by users',
  intro:
    'Corrections that signed-in users suggested. This list is read-only for now: it is not approved, rejected or published from here yet, and it changes nothing readers see.',
  loading: 'Loading submissions…',
  couldNotLoad: (message: string) => `Could not load submissions: ${message}`,
  empty: 'No submissions yet.',
  count: (count: string) => `${count} submissions`,
  statusPending: 'Pending',
  statusApproved: 'Approved',
  statusRejected: 'Rejected',
  submitter: (name: string) => `Submitted by ${name}`,
  submittedOn: (date: string) => `on ${date}`,
  licence: (version: string) => `Licence notice accepted (${version})`,
  textLabel: 'Suggested text',
  unknownUser: 'a deleted account',
};

const nl: typeof en = {
  heading: 'Ingestuurd door gebruikers',
  intro:
    'Verbeteringen die aangemelde gebruikers hebben voorgesteld. Deze lijst is voorlopig alleen-lezen: je kunt hier nog niets goedkeuren, afwijzen of publiceren, en wat lezers zien verandert niet.',
  loading: 'Inzendingen laden…',
  couldNotLoad: (message: string) => `Kan inzendingen niet laden: ${message}`,
  empty: 'Nog geen inzendingen.',
  count: (count: string) => `${count} inzendingen`,
  statusPending: 'In behandeling',
  statusApproved: 'Goedgekeurd',
  statusRejected: 'Afgewezen',
  submitter: (name: string) => `Ingestuurd door ${name}`,
  submittedOn: (date: string) => `op ${date}`,
  licence: (version: string) => `Licentiemelding geaccepteerd (${version})`,
  textLabel: 'Voorgestelde tekst',
  unknownUser: 'een verwijderd account',
};

export const corpusSubmissionsSectionMessages = { en, nl };
