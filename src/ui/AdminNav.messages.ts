/** Message catalogue for `AdminNav.tsx` (#414). */
/**
 * @module AdminNav.messages
 * @purpose English/Dutch i18n strings for the admin tab strip's section labels.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by AdminNav.tsx via `useMessages(adminNavMessages)`; `nl` is typed as `typeof en`.
 * @exports adminNavMessages
 */
import type { AdminTabKey } from './admin-nav.js';

const en = {
  adminSectionsAriaLabel: 'Admin sections',
  tabLabels: {
    users: 'Users',
    usage: 'AI usage',
    'corpus-overrides': 'Corpus overrides',
    'corpus-candidates': 'Corpus candidates',
  } satisfies Record<AdminTabKey, string>,
};

const nl: typeof en = {
  adminSectionsAriaLabel: 'Beheeronderdelen',
  tabLabels: {
    users: 'Gebruikers',
    usage: 'AI-gebruik',
    'corpus-overrides': 'Corpuscorrecties',
    'corpus-candidates': 'Corpuskandidaten',
  } satisfies Record<AdminTabKey, string>,
};

export const adminNavMessages = { en, nl };
