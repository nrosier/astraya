/**
 * @module Home.messages
 * @purpose English/Dutch strings for the home screen at `#/` (#1058): the person picker and its first-use empty states.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by Home.tsx via `useMessages(homeMessages)`; `nl` is typed as `typeof en`.
 * @exports homeMessages
 */
const en = {
  heading: 'Home',
  pickerLabel: 'Person',
  pickerPlaceholder: 'Choose a person',
  pickerEmpty: 'Choose a person to see their timing timeline here. Home remembers the last person you open.',
  noPeople: 'Nobody yet. Add a person and their birth record to see a timing timeline here.',
  addPerson: 'Add a person',
  peopleLink: 'Open the people list',
  unnamed: 'Unnamed',
};

const nl: typeof en = {
  heading: 'Start',
  pickerLabel: 'Persoon',
  pickerPlaceholder: 'Kies een persoon',
  pickerEmpty: 'Kies een persoon om hier de tijdlijn te zien. Start onthoudt de persoon die je het laatst opende.',
  noPeople: 'Nog niemand. Voeg een persoon en de geboortegegevens toe om hier een tijdlijn te zien.',
  addPerson: 'Persoon toevoegen',
  peopleLink: 'Open de lijst met mensen',
  unnamed: 'Naamloos',
};

export const homeMessages = { en, nl };
