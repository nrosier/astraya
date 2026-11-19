/**
 * Message catalogue for `CommandPalette.tsx` (#1654): the dialog's own labels, the group headings,
 * the empty and no-match states, and the pin buttons. Result titles and breadcrumbs come from
 * `search-index.ts`, so they are not repeated here.
 */
/**
 * @module ui/CommandPalette.messages
 * @purpose English/Dutch strings for the command palette dialog (#1654): search label, placeholder, group headings, no-match and empty states, pin and unpin labels, and the keyboard legend (#1769).
 * @conventions Co-located i18n file exporting `{ en, nl }`; `nl` is typed as `typeof en`, so both locales share every key. Functions take the text they need (the query or the result title) so no string is built in the component.
 * @exports commandPaletteMessages
 */

const en = {
  dialogLabel: 'Search features and pages',
  searchLabel: 'Search features, charts and tabs',
  placeholder: 'Search features, charts, tabs…',
  resultsLabel: 'Results',
  pinnedHeading: 'Pinned',
  recentHeading: 'Recent',
  noMatch: (query: string): string => `No matches for "${query}".`,
  emptyHint: 'Type a feature, chart or tab name to search.',
  disabledHint: 'Complete the birth record first.',
  pin: (title: string): string => `Pin ${title}`,
  unpin: (title: string): string => `Unpin ${title}`,
  close: 'Close search',
  legend: (shortcut: string): string => `↑↓ navigate · ↵ open · Esc close · ${shortcut} toggle`,
  shortcutApple: '⌘K',
  shortcutOther: 'Ctrl+K',
};

const nl: typeof en = {
  dialogLabel: 'Functies en pagina’s zoeken',
  searchLabel: 'Functies, grafieken en tabbladen zoeken',
  placeholder: 'Zoek functies, grafieken, tabbladen…',
  resultsLabel: 'Resultaten',
  pinnedHeading: 'Vastgezet',
  recentHeading: 'Recent',
  noMatch: (query: string): string => `Geen resultaten voor "${query}".`,
  emptyHint: 'Typ de naam van een functie, grafiek of tabblad om te zoeken.',
  disabledHint: 'Vul eerst het geboortedossier in.',
  pin: (title: string): string => `${title} vastzetten`,
  unpin: (title: string): string => `${title} losmaken`,
  close: 'Zoeken sluiten',
  legend: (shortcut: string): string => `↑↓ navigeren · ↵ openen · Esc sluiten · ${shortcut} openen/sluiten`,
  shortcutApple: '⌘K',
  shortcutOther: 'Ctrl+K',
};

export const commandPaletteMessages = { en, nl };
