/**
 * Message catalogue for `TransitFilterPanel.tsx` (#416).
 */
/**
 * @module TransitFilterPanel.messages
 * @purpose English/Dutch message catalogue for the transit-filter control panel (presets, orb scale, aspect groups, body checkboxes).
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `TransitFilterPanel.tsx`.
 * @exports transitFilterPanelMessages
 */
const en = {
  heading: 'Which transits to show',
  presetLabel: 'Show',
  presets: {
    important: 'Important',
    outer: 'Outer planets (Jupiter–Pluto)',
    personal: 'Personal planets (Sun–Mars)',
    all: 'All transits',
    custom: 'Custom',
  },
  presetsShort: { important: 'Important', outer: 'Outer', personal: 'Personal', all: 'All', custom: 'Custom' },
  count: (shown: number, total: number, preset: string) => `${preset} · ${String(shown)} of ${String(total)} shown`,
  clearFilters: 'Clear filters',
  groupAll: 'All',
  groupClear: 'Clear',
  rulersNote: 'Planetary rulers (which planet rules a sign) are a preference:',
  rulersLink: 'change them in Preferences',
  dailyNote:
    'Important, for a day: the Sun, Moon, Mercury, Venus and Mars, and the slow planets only when within 1° of exact, touching your Sun, Moon, Mercury, Venus, Mars or chart ruler within 1.5° (the Moon within 1°). A common working convention, not a fixed rule — widen it below.',
  yearlyNote:
    'Important, for a year: Jupiter, Saturn, Uranus, Neptune, Pluto and Chiron touching your planets and nodes by a major aspect within 3.5°, wide enough to follow a retrograde cycle. A common working convention, not a fixed rule — widen it below.',
  adjust: 'Change filters',
  orbLabel: 'Orb',
  orbs: { tight: 'Tight (up to 1.5°)', balanced: 'Balanced (the preset’s own)', wide: 'Wide (at least 5°)' },
  aspectsLegend: 'Aspects',
  hard: 'Hard (conjunction, square, opposition)',
  soft: 'Soft (sextile, trine)',
  minor: 'Minor (semisquare, sesquiquadrate, quincunx)',
  transitingLegend: 'Transiting planets',
  natalLegend: 'Natal points',
  applyingOnly: 'Applying only',
  empty: (preset: string) =>
    `No transits match the ${preset} filter. Widen it, or clear the filters to see all of them.`,
  closeLabel: 'Close without applying',
  applyButton: 'Apply',
  applyAsDefaultButton: 'Apply as Default',
  resetToDefaultButton: 'Reset to Default',
  cancelButton: 'Cancel',
  nothingChanged: 'nothing has changed',
};

const nl: typeof en = {
  heading: 'Welke transits tonen',
  presetLabel: 'Toon',
  presets: {
    important: 'Belangrijk',
    outer: 'Buitenplaneten (Jupiter–Pluto)',
    personal: 'Persoonlijke planeten (Zon–Mars)',
    all: 'Alle transits',
    custom: 'Aangepast',
  },
  presetsShort: { important: 'Belangrijk', outer: 'Buiten', personal: 'Persoonlijk', all: 'Alle', custom: 'Aangepast' },
  count: (shown, total, preset) => `${preset} · ${String(shown)} van ${String(total)} getoond`,
  clearFilters: 'Filters wissen',
  groupAll: 'Alle',
  groupClear: 'Geen',
  rulersNote: 'Heersende planeten (welke planeet een teken regeert) zijn een voorkeur:',
  rulersLink: 'wijzig ze in Voorkeuren',
  dailyNote:
    'Belangrijk, voor een dag: Zon, Maan, Mercurius, Venus en Mars, en de trage planeten alleen binnen 1° van exact, die je Zon, Maan, Mercurius, Venus, Mars of horoscoopheerser raken binnen 1,5° (de Maan binnen 1°). Een gangbare werkafspraak, geen vaste regel — verbreed het hieronder.',
  yearlyNote:
    'Belangrijk, voor een jaar: Jupiter, Saturnus, Uranus, Neptunus, Pluto en Chiron die je planeten en knopen raken met een hoofdaspect binnen 3,5°, ruim genoeg om een retrograde cyclus te volgen. Een gangbare werkafspraak, geen vaste regel — verbreed het hieronder.',
  adjust: 'Filters wijzigen',
  orbLabel: 'Orb',
  orbs: { tight: 'Krap (tot 1,5°)', balanced: 'Gemiddeld (van de keuze zelf)', wide: 'Ruim (minstens 5°)' },
  aspectsLegend: 'Aspecten',
  hard: 'Hard (conjunctie, vierkant, oppositie)',
  soft: 'Zacht (sextiel, driehoek)',
  minor: 'Klein (halfvierkant, anderhalfvierkant, quincunx)',
  transitingLegend: 'Transiterende planeten',
  natalLegend: 'Radixpunten',
  applyingOnly: 'Alleen toenemend',
  empty: (preset: string) =>
    `Geen transits voldoen aan het filter ${preset}. Verbreed het, of wis de filters om ze allemaal te zien.`,
  closeLabel: 'Sluiten zonder toe te passen',
  applyButton: 'Toepassen',
  applyAsDefaultButton: 'Toepassen als standaard',
  resetToDefaultButton: 'Terugzetten naar standaard',
  cancelButton: 'Annuleren',
  nothingChanged: 'er is niets gewijzigd',
};

export const transitFilterPanelMessages = { en, nl };
