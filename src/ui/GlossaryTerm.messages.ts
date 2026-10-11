/**
 * Message catalogue for `GlossaryTerm.tsx` (#456).
 */
/**
 * @module GlossaryTerm.messages
 * @purpose English/Dutch accessible name of the "terms on this page" list.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()`; `nl` is typed as `typeof en`.
 * @exports glossaryTermMessages
 */
const en = { listLabel: 'Terms used on this page' };
const nl: typeof en = { listLabel: 'Termen op deze pagina' };

export const glossaryTermMessages = { en, nl };
