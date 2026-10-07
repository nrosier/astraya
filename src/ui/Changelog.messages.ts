/**
 * Message catalogue for `Changelog.tsx` (#464).
 */
/**
 * @module Changelog.messages
 * @purpose English/Dutch i18n strings for the in-app changelog screen's chrome (heading, running-version line, commit-history link).
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by Changelog.tsx via `useMessages(changelogMessages)`; `nl` is typed as `typeof en`. The release-note body itself (`CHANGELOG.md`) is deliberately not translated here — only the application-owned chrome around it is.
 * @exports changelogMessages
 */
const en = {
  heading: 'Changelog',
  runningBefore: 'You are running ',
  runningAfter: '.',
  commitHistoryLink: 'Full commit history',
};

const nl: typeof en = {
  heading: 'Changelog',
  runningBefore: 'Je gebruikt ',
  runningAfter: '.',
  commitHistoryLink: 'Volledige commitgeschiedenis',
};

export const changelogMessages = { en, nl };
