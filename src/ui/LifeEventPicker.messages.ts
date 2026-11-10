/** Message catalogue for `LifeEventPicker.tsx` (#1399, slice S5). */
/**
 * @module ui/LifeEventPicker.messages
 * @purpose English/Dutch strings for the life-event date picker on the Progressions, Solar Arc and Returns screens.
 * @conventions Co-located i18n file exporting `{ en, nl }` with key parity, consumed via `useMessages()`.
 * @exports lifeEventPickerMessages
 */
const en = {
  label: 'Life event',
  placeholder: 'Pick a life event…',
  option: (dateLabel: string, label: string) => `${dateLabel} — ${label}`,
  filterTitle: 'Filter by category',
  filterShow: 'Show',
  filterHide: 'Hide',
  filterSummary: (shown: number, total: number) => `${String(shown)} of ${String(total)} events`,
  filterAll: 'All categories',
  filterEmpty: 'No life events in the chosen categories.',
  returnError: (message: string) => `The return at this event could not be found: ${message}`,
};

const nl: typeof en = {
  label: 'Levensgebeurtenis',
  placeholder: 'Kies een levensgebeurtenis…',
  option: (dateLabel: string, label: string) => `${dateLabel} — ${label}`,
  filterTitle: 'Filter op categorie',
  filterShow: 'Tonen',
  filterHide: 'Verbergen',
  filterSummary: (shown: number, total: number) => `${String(shown)} van ${String(total)} gebeurtenissen`,
  filterAll: 'Alle categorieën',
  filterEmpty: 'Geen levensgebeurtenissen in de gekozen categorieën.',
  returnError: (message: string) => `De terugkeer bij deze gebeurtenis kon niet worden gevonden: ${message}`,
};

export const lifeEventPickerMessages = { en, nl };
