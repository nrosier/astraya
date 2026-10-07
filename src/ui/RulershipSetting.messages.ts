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
  hint: 'Only Scorpio, Aquarius and Pisces differ: modern gives them to Pluto, Uranus and Neptune, traditional to Mars, Saturn and Jupiter, and both lists the two as co-rulers. It sets the chart ruler, the houses a planet rules, dispositors, essential dignities, profections and the AI interpretation, and is kept on this device.',
};

const nl: typeof en = {
  label: 'Heersende planeten',
  options: {
    modern: 'Modern (Pluto, Uranus en Neptunus heersen)',
    traditional: 'Traditioneel (de zeven klassieke planeten)',
    both: 'Beide (mede-heersers)',
  },
  hint: 'Alleen Schorpioen, Waterman en Vissen verschillen: modern geeft ze aan Pluto, Uranus en Neptunus, traditioneel aan Mars, Saturnus en Jupiter, en beide noemt de twee als mede-heersers. Het bepaalt de horoscoopheerser, de huizen die een planeet regeert, dispositors, essentiële waardigheden, profecties en de AI-interpretatie, en wordt op dit apparaat bewaard.',
};

export const rulershipSettingMessages = { en, nl };
