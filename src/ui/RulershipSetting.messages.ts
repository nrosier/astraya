/**
 * Message catalogue for `RulershipSetting.tsx` (#426).
 */
/**
 * @module RulershipSetting.messages
 * @purpose English/Dutch message catalogue for the planetary-rulers (modern/traditional/both) preference control.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `RulershipSetting.tsx`.
 * @exports rulershipSettingMessages
 */
const en = {
  label: 'Planetary rulers',
  options: {
    modern: 'Modern (Pluto, Uranus and Neptune rule)',
    traditional: 'Traditional (the seven classical planets)',
    both: 'Both (co-rulers)',
  },
  titles: { modern: 'Modern', traditional: 'Traditional', both: 'Both' },
  consequences: {
    modern: 'Scorpio, Aquarius and Pisces go to Pluto, Uranus and Neptune.',
    traditional: 'Scorpio, Aquarius and Pisces go to Mars, Saturn and Jupiter.',
    both: 'Each of those signs lists both planets as co-rulers.',
  },
  hint: 'Only Scorpio, Aquarius and Pisces differ: modern gives them to Pluto, Uranus and Neptune, traditional to Mars, Saturn and Jupiter, and both lists the two as co-rulers. It sets the chart ruler, the houses a planet rules, dispositors, essential dignities, profections and the AI interpretation.',
  saveFailed: (message: string) => `That did not save, so the rulers were not changed. ${message}`,
};

const nl: typeof en = {
  label: 'Heersende planeten',
  options: {
    modern: 'Modern (Pluto, Uranus en Neptunus heersen)',
    traditional: 'Traditioneel (de zeven klassieke planeten)',
    both: 'Beide (mede-heersers)',
  },
  titles: { modern: 'Modern', traditional: 'Traditioneel', both: 'Beide' },
  consequences: {
    modern: 'Schorpioen, Waterman en Vissen gaan naar Pluto, Uranus en Neptunus.',
    traditional: 'Schorpioen, Waterman en Vissen gaan naar Mars, Saturnus en Jupiter.',
    both: 'Elk van die tekens noemt beide planeten als mede-heersers.',
  },
  hint: 'Alleen Schorpioen, Waterman en Vissen verschillen: modern geeft ze aan Pluto, Uranus en Neptunus, traditioneel aan Mars, Saturnus en Jupiter, en beide noemt de twee als mede-heersers. Het bepaalt de horoscoopheerser, de huizen die een planeet regeert, dispositors, essentiële waardigheden, profecties en de AI-interpretatie.',
  saveFailed: (message: string) => `Dat is niet opgeslagen, dus de heersers zijn niet gewijzigd. ${message}`,
};

export const rulershipSettingMessages = { en, nl };
