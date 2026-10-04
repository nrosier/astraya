/**
 * Message catalogue for `AppNav.tsx` (#158, #421): the per-tab labels for `person-nav.ts`'s
 * `PERSON_TABS` and the tools menu's labels for `tools-nav.ts` (those modules have no access to
 * the current locale, so `AppNav.tsx` looks labels up here by key).
 */
import type { PersonTabFamilyKey, PersonTabKey } from './person-nav.js';
import type { ToolKey } from './tools-nav.js';

const en = {
  mainNavAriaLabel: 'Main',
  menuButton: 'Menu',
  menuButtonClose: 'Close menu',
  personChipLabel: (name: string) => `Chart of ${name}`,
  adminTabLabel: 'Admin',
  toolsLabel: 'Tools',
  toolLabels: {
    cycles: 'Planetary cycles',
    eclipses: 'Eclipses',
    horary: 'Horary chart',
    electional: 'Electional search',
    rectification: 'Birth-time rectification',
  } satisfies Record<ToolKey, string>,
  disabledTabSuffix: (label: string) => `${label} — complete the birth record first`,
  completeBirthRecordHint: 'Complete the birth record to unlock the other tabs.',
  subtabsAriaLabel: (familyLabel: string) => `${familyLabel} subtabs`,

  tabLabels: {
    'birth-record': 'Birth record',
    chart: 'Natal chart',
    report: 'Interpretation',
    profections: 'Profections',
    progressions: 'Progressions',
    'solar-arc': 'Solar Arc',
    transit: 'Transits',
    synastry: 'Synastry',
    composite: 'Composite',
    harmonic: 'Harmonic',
    draconic: 'Draconic',
    'periodic-transit': 'Forecast',
    astrocartography: 'Astrocartography',
  } satisfies Record<PersonTabKey, string>,

  familyLabels: {
    'transits-forecast': 'Transits & Forecast',
    'progressions-directions': 'Progressions & Directions',
    'relationship-charts': 'Relationship Charts',
    'chart-variants': 'Chart Variants',
  } satisfies Record<PersonTabFamilyKey, string>,
};

const nl: typeof en = {
  mainNavAriaLabel: 'Hoofdmenu',
  menuButton: 'Menu',
  menuButtonClose: 'Menu sluiten',
  personChipLabel: (name: string) => `Horoscoop van ${name}`,
  adminTabLabel: 'Beheer',
  toolsLabel: 'Hulpmiddelen',
  toolLabels: {
    cycles: 'Planetaire cycli',
    eclipses: 'Verduisteringen',
    horary: 'Horoscoop voor een vraag',
    electional: 'Electieve zoektocht',
    rectification: 'Geboortetijd-rectificatie',
  } satisfies Record<ToolKey, string>,
  disabledTabSuffix: (label: string) => `${label} — voltooi eerst de geboortegegevens`,
  completeBirthRecordHint: 'Vul de geboortegegevens in om de overige tabs te ontgrendelen.',
  subtabsAriaLabel: (familyLabel: string) => `Subtabs van ${familyLabel}`,

  tabLabels: {
    'birth-record': 'Geboortegegevens',
    chart: 'Horoscoop',
    report: 'Interpretatie',
    profections: 'Profecties',
    progressions: 'Progressies',
    'solar-arc': 'Solar Arc',
    transit: 'Transits',
    synastry: 'Synastrie',
    composite: 'Composiet',
    harmonic: 'Harmonisch',
    draconic: 'Draconisch',
    'periodic-transit': 'Prognose',
    astrocartography: 'Astrocartografie',
  } satisfies Record<PersonTabKey, string>,

  familyLabels: {
    'transits-forecast': 'Transits & prognose',
    'progressions-directions': 'Progressies & directies',
    'relationship-charts': 'Relatiehoroscopen',
    'chart-variants': 'Horoscoopvarianten',
  } satisfies Record<PersonTabFamilyKey, string>,
};

export const appNavMessages = { en, nl };
