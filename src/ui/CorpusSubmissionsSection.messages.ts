/**
 * Message catalogue for `CorpusSubmissionsSection.tsx` (#1338, slice 2).
 */
/**
 * @module CorpusSubmissionsSection.messages
 * @purpose English/Dutch strings for the admin list of corrections that users submitted, with approve and reject.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by CorpusSubmissionsSection.tsx via `useMessages()`; `nl` is typed as `typeof en`.
 * @exports corpusSubmissionsSectionMessages
 */
const en = {
  heading: 'Submitted by users',
  intro:
    'Corrections that signed-in users suggested. Approving a suggestion publishes its text for every reader at once; rejecting it changes nothing readers see. Decided suggestions stay in this list as history.',
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
  approveButton: 'Approve',
  rejectButton: 'Reject',
  deciding: 'Saving…',
  confirmApprove: (entry: string) =>
    `Approve this text for ${entry}? It becomes the text every reader sees, right away.`,
  confirmReject: (entry: string) => `Reject this suggestion for ${entry}? Readers see no change.`,
  confirmApproveButton: 'Approve and publish',
  confirmRejectButton: 'Reject suggestion',
  cancelButton: 'Cancel',
  couldNotDecide: (message: string) => `Could not save the decision: ${message}`,
  decidedBy: (name: string, date: string) => `by ${name} on ${date}`,
  decidedOn: (date: string) => `on ${date}`,
};

const nl: typeof en = {
  heading: 'Ingestuurd door gebruikers',
  intro:
    'Verbeteringen die aangemelde gebruikers hebben voorgesteld. Een voorstel goedkeuren publiceert de tekst direct voor alle lezers; afwijzen verandert niets voor lezers. Beoordeelde voorstellen blijven als geschiedenis in deze lijst staan.',
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
  approveButton: 'Goedkeuren',
  rejectButton: 'Afwijzen',
  deciding: 'Opslaan…',
  confirmApprove: (entry: string) =>
    `Deze tekst goedkeuren voor ${entry}? Het wordt direct de tekst die elke lezer ziet.`,
  confirmReject: (entry: string) => `Dit voorstel voor ${entry} afwijzen? Lezers zien geen verandering.`,
  confirmApproveButton: 'Goedkeuren en publiceren',
  confirmRejectButton: 'Voorstel afwijzen',
  cancelButton: 'Annuleren',
  couldNotDecide: (message: string) => `Kan de beslissing niet opslaan: ${message}`,
  decidedBy: (name: string, date: string) => `door ${name} op ${date}`,
  decidedOn: (date: string) => `op ${date}`,
};

export const corpusSubmissionsSectionMessages = { en, nl };
