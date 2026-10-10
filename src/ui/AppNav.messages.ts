/**
 * Message catalogue for `AppNav.tsx` (#158, #421): the per-tab labels for `person-nav.ts`'s
 * `PERSON_TABS` and the tools menu's labels for `tools-nav.ts` (those modules have no access to
 * the current locale, so `AppNav.tsx` looks labels up here by key).
 */
/**
 * @module AppNav.messages
 * @purpose English/Dutch i18n strings for the header navigation: person tabs, chart-type/tool/export menu labels, and export status text.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by AppNav.tsx via `useMessages(appNavMessages)`; `nl` is typed as `typeof en`. Looks up labels by key for `person-nav.ts`'s `PersonTabKey`/`PersonTabFamilyKey` and `tools-nav.ts`'s `ToolKey`/`ToolGroupKey` since those pure modules have no access to the current locale.
 * @exports appNavMessages
 */
import type { PersonTabFamilyKey, PersonTabKey } from './person-nav.js';
import type { ToolGroupKey, ToolKey } from './tools-nav.js';

const en = {
  mainNavAriaLabel: 'Main',
  menuButton: 'Menu',
  menuButtonClose: 'Close menu',
  unnamedPerson: 'Unnamed',
  exportPdfBuilder: 'Build custom PDF…',
  exportPdfBuilderHint: 'Choose what goes into one PDF document, with each section’s own options.',
  toolsLabel: 'Tools',
  toolLabels: {
    cycles: 'Planetary cycles',
    eclipses: 'Eclipses',
    horary: 'Horary chart',
    electional: 'Electional search',
    rectification: 'Birth-time rectification',
  } satisfies Record<ToolKey, string>,
  toolGroupLabels: {
    'sky-cycles': 'Sky & cycles',
    'questions-planning': 'Questions & planning',
    'birth-data': 'Birth data',
  } satisfies Record<ToolGroupKey, string>,
  disabledTabSuffix: (label: string) => `${label} — complete the birth record first`,
  completeBirthRecordHint: 'Complete the birth record to unlock the other tabs.',
  subtabsAriaLabel: (familyLabel: string) => `${familyLabel} subtabs`,

  tabLabels: {
    overview: 'Overview',
    'birth-record': 'Birth record',
    chart: 'Charts',
    report: 'Interpretation',
    profections: 'Profections',
    progressions: 'Progressions',
    'solar-arc': 'Solar Arc',
    'primary-directions': 'Primary Directions',
    transit: 'Transits',
    synastry: 'Synastry',
    composite: 'Composite',
    'periodic-transit': 'Forecast',
    astrocartography: 'Astrocartography',
  } satisfies Record<PersonTabKey, string>,

  familyLabels: {
    'transits-forecast': 'Transits & Forecast',
    'progressions-directions': 'Progressions & Directions',
    'relationship-charts': 'Relationship Charts',
  } satisfies Record<PersonTabFamilyKey, string>,
};

const nl: typeof en = {
  mainNavAriaLabel: 'Hoofdmenu',
  menuButton: 'Menu',
  menuButtonClose: 'Menu sluiten',
  unnamedPerson: 'Naamloos',
  exportPdfBuilder: 'PDF samenstellen…',
  exportPdfBuilderHint: 'Kies wat in één PDF-document komt, met de eigen opties van elk onderdeel.',
  toolsLabel: 'Hulpmiddelen',
  toolLabels: {
    cycles: 'Planetaire cycli',
    eclipses: 'Verduisteringen',
    horary: 'Horoscoop voor een vraag',
    electional: 'Electieve zoektocht',
    rectification: 'Geboortetijd-rectificatie',
  } satisfies Record<ToolKey, string>,
  toolGroupLabels: {
    'sky-cycles': 'Hemel & cycli',
    'questions-planning': 'Vragen & planning',
    'birth-data': 'Geboortegegevens',
  } satisfies Record<ToolGroupKey, string>,
  disabledTabSuffix: (label: string) => `${label} — voltooi eerst de geboortegegevens`,
  completeBirthRecordHint: 'Vul de geboortegegevens in om de overige tabs te ontgrendelen.',
  subtabsAriaLabel: (familyLabel: string) => `Subtabs van ${familyLabel}`,

  tabLabels: {
    overview: 'Overzicht',
    'birth-record': 'Geboortegegevens',
    chart: 'Horoscopen',
    report: 'Interpretatie',
    profections: 'Profecties',
    progressions: 'Progressies',
    'solar-arc': 'Solar Arc',
    'primary-directions': 'Primaire directies',
    transit: 'Transits',
    synastry: 'Synastrie',
    composite: 'Composiet',
    'periodic-transit': 'Prognose',
    astrocartography: 'Astrocartografie',
  } satisfies Record<PersonTabKey, string>,

  familyLabels: {
    'transits-forecast': 'Transits & prognose',
    'progressions-directions': 'Progressies & directies',
    'relationship-charts': 'Relatiehoroscopen',
  } satisfies Record<PersonTabFamilyKey, string>,
};

export const appNavMessages = { en, nl };
