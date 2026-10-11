/**
 * Message catalogue for `PersonSwitcher.tsx` (#506/#509).
 */
/**
 * @module ui/PersonSwitcher.messages
 * @purpose English/Dutch i18n strings for the header's searchable person switcher.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()`.
 * @exports personSwitcherMessages
 */
const en = {
  triggerLabel: (name: string) => `Chart of ${name} — switch person`,
  popupLabel: 'Switch person',
  filterLabel: 'Filter people',
  filterPlaceholder: 'Type a name…',
  noMatches: 'No one matches.',
  unnamed: 'Unnamed',
  allPeople: 'All people…',
};

const nl: typeof en = {
  triggerLabel: (name: string) => `Horoscoop van ${name} — persoon wisselen`,
  popupLabel: 'Persoon wisselen',
  filterLabel: 'Personen filteren',
  filterPlaceholder: 'Typ een naam…',
  noMatches: 'Niemand komt overeen.',
  unnamed: 'Naamloos',
  allPeople: 'Alle personen…',
};

export const personSwitcherMessages = { en, nl };
