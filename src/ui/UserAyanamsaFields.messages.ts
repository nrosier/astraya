/**
 * @module ui/UserAyanamsaFields.messages
 * @purpose English/Dutch wording for the user-defined ayanamsa fields in Extended settings (#1407).
 * @conventions Co-located with `UserAyanamsaFields.tsx`; both locales keep the same keys.
 * @exports userAyanamsaFieldsMessages
 */
import type { Locale } from '../interpretation/schema.js';

const en = {
  legend: 'User-defined ayanamsa',
  referenceDate: 'Reference date',
  referenceDateHelp: 'Taken at 0h UT. The ayanamsa moves with precession from this date.',
  degrees: 'Degrees',
  minutes: 'Minutes',
  valueHelp: 'The ayanamsa at the reference date.',
  invalidDate: 'Enter a date.',
  invalidValue: 'Enter whole degrees from 0 to 359 and minutes from 0 up to 60.',
};

const nl: typeof en = {
  legend: 'Zelf bepaalde ayanamsa',
  referenceDate: 'Referentiedatum',
  referenceDateHelp: 'Genomen om 0u UT. De ayanamsa verschuift vanaf deze datum met de precessie.',
  degrees: 'Graden',
  minutes: 'Minuten',
  valueHelp: 'De ayanamsa op de referentiedatum.',
  invalidDate: 'Vul een datum in.',
  invalidValue: 'Vul hele graden van 0 tot 359 in en minuten van 0 tot 60.',
};

export const userAyanamsaFieldsMessages: Record<Locale, typeof en> = { en, nl };
