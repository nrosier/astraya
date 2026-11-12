/**
 * @module ChartSearchPanel.messages
 * @purpose English/Dutch UI text for the "Search charts" card on People (#1405): scopes, condition kinds, operators, not-evaluable reasons, buttons, states and saved searches.
 * @conventions Co-located `{ en, nl }` catalogue consumed through `useMessages()`; `nl` is typed as `typeof en`; not-evaluable reasons are a fixed list mapped to one sentence each, never shown raw.
 * @exports chartSearchPanelMessages
 */
const en = {
  scope: {
    natal: 'Natal chart',
    transit: 'Transits',
    progression: 'Secondary progressions',
    solarReturn: 'Solar return',
    lunarReturn: 'Lunar return',
    // TODO(#1405): add `solarArc` here when the solar arc scope lands in the domain. Not yet a domain scope; no key until then.
  },
  condition: {
    sign: 'Body in sign',
    house: 'Body in house',
    aspect: 'Body in aspect to',
  },
  matchLabel: 'Match',
  operator: {
    all: 'Match all',
    any: 'Match any',
  },
  reason: {
    birthTimeUnknown: 'No birth time, so house and angle conditions cannot be checked.',
    housesUndefined: 'Houses cannot be calculated for this place, so house and angle conditions cannot be checked.',
    bodyMissing: 'This chart does not contain the body named in the condition.',
    timingUnavailable: 'There is no timing chart for this date, so this condition cannot be checked.',
  },
  addCondition: 'Add condition',
  removeCondition: (n: string) => `Remove condition ${n}`,
  run: 'Run search',
  searching: 'Searching…',
  saveSearch: 'Save search',
  reopen: 'Reopen',
  delete: 'Delete',
  undo: 'Undo',
  retry: 'Retry',
  conditionCount: (n: string) => `${n} of 10 conditions`,
  capReached: 'Maximum of 10 conditions reached. Remove one to add another.',
  firstUse: 'No search yet. Pick a scope, a condition and a body, then press Run search to list the people who match.',
  zeroResults: 'No one matches these conditions. Try removing a condition, or choose Match any.',
  searchFailed: 'The search did not finish. Your conditions are kept.',
  readOnly: 'Searches cannot be changed or saved on this device right now. Opening results still works.',
  asOfLabel: 'As-of date',
  asOfHelp: 'Used by transit, progression and return conditions. Natal conditions ignore it.',
  notEvaluableHeading: 'Could not be evaluated',
  notEvaluableNote: 'These people are not counted as matches or non-matches.',
  savedHeading: 'Saved searches',
  savedEmpty: 'No saved searches yet. Save the conditions above to reopen them later.',
  deleted: (name: string) => `Deleted “${name}”.`,
};

const nl: typeof en = {
  scope: {
    natal: 'Geboortehoroscoop',
    transit: 'Transiten',
    progression: 'Secundaire progressies',
    solarReturn: 'Zonne-return',
    lunarReturn: 'Maan-return',
  },
  condition: {
    sign: 'Hemellichaam in teken',
    house: 'Hemellichaam in huis',
    aspect: 'Hemellichaam in aspect met',
  },
  matchLabel: 'Voldoen aan',
  operator: {
    all: 'Alle voorwaarden',
    any: 'Minstens één voorwaarde',
  },
  reason: {
    birthTimeUnknown: 'Geen geboortetijd bekend, dus huis- en hoekvoorwaarden kunnen niet worden gecontroleerd.',
    housesUndefined:
      'Voor deze plaats kunnen geen huizen worden berekend, dus huis- en hoekvoorwaarden kunnen niet worden gecontroleerd.',
    bodyMissing: 'Dit horoscoop bevat het gekozen hemellichaam niet.',
    timingUnavailable: 'Voor deze datum is er geen tijdhoroscoop, dus deze voorwaarde kan niet worden gecontroleerd.',
  },
  addCondition: 'Voorwaarde toevoegen',
  removeCondition: (n: string) => `Voorwaarde ${n} verwijderen`,
  run: 'Zoeken',
  searching: 'Zoeken…',
  saveSearch: 'Zoekopdracht opslaan',
  reopen: 'Heropenen',
  delete: 'Verwijderen',
  undo: 'Ongedaan maken',
  retry: 'Opnieuw proberen',
  conditionCount: (n: string) => `${n} van 10 voorwaarden`,
  capReached: 'Het maximum van 10 voorwaarden is bereikt. Verwijder er een om een andere toe te voegen.',
  firstUse:
    'Nog geen zoekopdracht. Kies een bereik, een voorwaarde en een hemellichaam en kies Zoeken om de passende personen te zien.',
  zeroResults: 'Niemand voldoet aan deze voorwaarden. Verwijder een voorwaarde of kies Minstens één voorwaarde.',
  searchFailed: 'De zoekopdracht is niet afgerond. Je voorwaarden blijven bewaard.',
  readOnly:
    'Zoekopdrachten kunnen op dit apparaat nu niet worden gewijzigd of opgeslagen. Resultaten openen werkt nog wel.',
  asOfLabel: 'Peildatum',
  asOfHelp: 'Gebruikt voor transit-, progressie- en return-voorwaarden. Geboortevoorwaarden negeren deze datum.',
  notEvaluableHeading: 'Niet te evalueren',
  notEvaluableNote: 'Deze personen tellen niet mee als wel of niet passend.',
  savedHeading: 'Opgeslagen zoekopdrachten',
  savedEmpty: 'Nog geen opgeslagen zoekopdrachten. Sla de voorwaarden hierboven op om ze later opnieuw te openen.',
  deleted: (name: string) => `“${name}” verwijderd.`,
};

export const chartSearchPanelMessages = { en, nl };
