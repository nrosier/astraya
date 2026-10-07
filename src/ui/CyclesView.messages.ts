/** Message catalogue for `CyclesView.tsx` (#410). */
/**
 * @module CyclesView.messages
 * @purpose English/Dutch i18n strings for the Planetary Cycles tool screen: presets, search form, and the exact-aspects table/diagram.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by CyclesView.tsx via `useMessages(cyclesViewMessages)`; `nl` is typed as `typeof en`.
 * @exports cyclesViewMessages
 */
const en = {
  heading: 'Planetary cycles',
  hint: 'When two moving bodies make an exact aspect, found from the ephemeris alone — no birth chart involved. Each exact aspect is plotted on the zodiac below and joined to the next, so a cycle shows as a pattern: Venus’s inferior conjunctions with the Sun close into a five-pointed star over eight years.',
  presetLabel: 'Cycle',
  presetCustom: 'Custom',
  presets: {
    'jupiter-saturn': 'Jupiter–Saturn conjunctions (the great conjunction, ~20 years)',
    'saturn-uranus': 'Saturn–Uranus conjunctions (~45 years)',
    'saturn-neptune': 'Saturn–Neptune conjunctions (~36 years)',
    'saturn-pluto': 'Saturn–Pluto conjunctions (~33 years)',
    'venus-pentagram': 'Venus–Sun inferior conjunctions (the pentagram, 8 years)',
  } as Record<string, string>,
  bodyALabel: 'First body',
  bodyBLabel: 'Second body',
  aspectLabel: 'Aspect',
  motionLabel: 'First body’s motion',
  motionAll: 'Any',
  motionRetrograde: 'Retrograde only (e.g. Venus’s inferior conjunctions)',
  motionDirect: 'Direct only (e.g. Venus’s superior conjunctions)',
  fromYearLabel: 'From year',
  toYearLabel: 'To year',
  findButton: 'Find',
  finding: 'Searching…',
  needsTwoBodies: 'Pick two different bodies.',
  badYear: (min: number, max: number) => `Enter whole years between ${String(min)} and ${String(max)}.`,
  yearsReversed: 'The “to” year must not be before the “from” year.',
  error: (message: string) => `The search could not be completed. ${message}`,
  noEvents: 'No exact aspect of that kind in this range.',
  summary: (count: number, a: string, b: string, from: number, to: number) =>
    `${String(count)} exact ${count === 1 ? 'aspect' : 'aspects'} of ${a} and ${b}, ${String(from)}–${String(to)} (UTC).`,
  diagramCaption:
    'Each point is where the first body is at an exact aspect, numbered in order; lines join each to the next.',
  tableCaption: 'Exact aspects',
  stepColumn: 'Step',
  showStep: (step: number) => `Show step ${String(step)} on the diagram`,
  selectionHint: 'Click a point on the diagram, or a step number in the table, to link them; click again to clear.',
  stepSelected: (step: number, total: number) => `Step ${String(step)} of ${String(total)} is highlighted.`,
  dateColumn: 'Date (UTC)',
  aspectColumn: 'Aspect',
  positionColumn: 'Position',
  retrogradeColumn: 'Retrograde',
  sinceColumn: 'Years since previous',
  none: '—',
  cyclesLink: 'Planetary cycles',
};

const nl: typeof en = {
  heading: 'Planetaire cycli',
  hint: 'Wanneer twee bewegende hemellichamen een exact aspect maken, berekend uit alleen de efemeriden — zonder geboortehoroscoop. Elk exact aspect wordt hieronder op de dierenriem uitgezet en met het volgende verbonden, zodat een cyclus als patroon verschijnt: de onderste conjuncties van Venus met de Zon sluiten in acht jaar tot een vijfpuntige ster.',
  presetLabel: 'Cyclus',
  presetCustom: 'Eigen keuze',
  presets: {
    'jupiter-saturn': 'Jupiter–Saturnus-conjuncties (de grote conjunctie, ~20 jaar)',
    'saturn-uranus': 'Saturnus–Uranus-conjuncties (~45 jaar)',
    'saturn-neptune': 'Saturnus–Neptunus-conjuncties (~36 jaar)',
    'saturn-pluto': 'Saturnus–Pluto-conjuncties (~33 jaar)',
    'venus-pentagram': 'Venus–Zon onderste conjuncties (het pentagram, 8 jaar)',
  },
  bodyALabel: 'Eerste hemellichaam',
  bodyBLabel: 'Tweede hemellichaam',
  aspectLabel: 'Aspect',
  motionLabel: 'Beweging van het eerste lichaam',
  motionAll: 'Willekeurig',
  motionRetrograde: 'Alleen retrograde (bijv. de onderste conjuncties van Venus)',
  motionDirect: 'Alleen directe beweging (bijv. de bovenste conjuncties van Venus)',
  fromYearLabel: 'Vanaf jaar',
  toYearLabel: 'Tot jaar',
  findButton: 'Zoeken',
  finding: 'Zoeken…',
  needsTwoBodies: 'Kies twee verschillende hemellichamen.',
  badYear: (min: number, max: number) => `Voer hele jaartallen in tussen ${String(min)} en ${String(max)}.`,
  yearsReversed: 'Het “tot”-jaar mag niet vóór het “vanaf”-jaar liggen.',
  error: (message: string) => `De zoekopdracht kon niet worden voltooid. ${message}`,
  noEvents: 'Geen exact aspect van die soort in dit bereik.',
  summary: (count: number, a: string, b: string, from: number, to: number) =>
    `${String(count)} exacte ${count === 1 ? 'aspect' : 'aspecten'} van ${a} en ${b}, ${String(from)}–${String(to)} (UTC).`,
  diagramCaption:
    'Elk punt is waar het eerste lichaam staat bij een exact aspect, op volgorde genummerd; lijnen verbinden elk punt met het volgende.',
  tableCaption: 'Exacte aspecten',
  stepColumn: 'Stap',
  showStep: (step) => `Toon stap ${String(step)} op het diagram`,
  selectionHint:
    'Klik op een punt in het diagram, of op een stapnummer in de tabel, om ze te koppelen; klik nogmaals om te wissen.',
  stepSelected: (step, total) => `Stap ${String(step)} van ${String(total)} is gemarkeerd.`,
  dateColumn: 'Datum (UTC)',
  aspectColumn: 'Aspect',
  positionColumn: 'Positie',
  retrogradeColumn: 'Retrograde',
  sinceColumn: 'Jaren sinds vorige',
  none: '—',
  cyclesLink: 'Planetaire cycli',
};

export const cyclesViewMessages = { en, nl };
