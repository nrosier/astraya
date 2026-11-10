/** Message catalogue for `DateAnimationBar.tsx` (#1400). */
/**
 * @module ui/DateAnimationBar.messages
 * @purpose English/Dutch strings for the date and animation control bar on the Transits and Progressions screens.
 * @conventions Co-located i18n file exporting `{ en, nl }` with key parity, consumed via `useMessages()`.
 * @exports dateAnimationBarMessages
 */
const en = {
  groupLabel: 'Date and animation',
  play: 'Play',
  pause: 'Pause',
  stepBack: (interval: string) => `Step back one ${interval}`,
  stepForward: (interval: string) => `Step forward one ${interval}`,
  intervalLabel: 'Step interval',
  intervalNames: { day: 'day', month: 'month', year: 'year' },
  intervalOptions: { day: 'Day', month: 'Month', year: 'Year' },
  dateLabel: 'As of',
  speedLabel: 'Playback speed',
  sliderLabel: 'Date, scrub through 10 years',
  now: 'Now',
  hint: 'Speed multiplies the chosen interval: at Month, 1x advances one month per second. Space plays and pauses; the left and right arrow keys step back and forward by the chosen interval.',
};

const nl: typeof en = {
  groupLabel: 'Datum en animatie',
  play: 'Afspelen',
  pause: 'Pauzeren',
  stepBack: (interval: string) => `Een ${interval} terug`,
  stepForward: (interval: string) => `Een ${interval} vooruit`,
  intervalLabel: 'Stapgrootte',
  intervalNames: { day: 'dag', month: 'maand', year: 'jaar' },
  intervalOptions: { day: 'Dag', month: 'Maand', year: 'Jaar' },
  dateLabel: 'Vanaf',
  speedLabel: 'Afspeelsnelheid',
  sliderLabel: 'Datum, door 10 jaar schuiven',
  now: 'Nu',
  hint: 'De snelheid vermenigvuldigt de gekozen stap: bij Maand gaat 1x een maand per seconde vooruit. Spatie speelt af en pauzeert; de pijltjes links en rechts gaan een gekozen stap terug en vooruit.',
};

export const dateAnimationBarMessages = { en, nl };
