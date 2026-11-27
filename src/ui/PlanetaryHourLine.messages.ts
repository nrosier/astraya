/**
 * @module PlanetaryHourLine.messages
 * @purpose English/Dutch strings for the planetary day and hour line on the Horary and Timing timeline screens (#2019).
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by PlanetaryHourLine.tsx via `useMessages()`; `nl` is typed as `typeof en`. Planet names come from astro-names.messages.ts.
 * @exports planetaryHourLineMessages
 */
const en = {
  /** The day's planet and the hour's planet, with the hour's place in the day or the night. */
  line: (day: string, hour: string, part: string, number: number) =>
    `Planetary day of ${day}, hour of ${hour} (${part} hour ${String(number)} of 12, Lilly).`,
  /** The same, for a stated moment (the Timing timeline reads it at 12:00 UT on the centre date). */
  lineAt: (when: string, day: string, hour: string, part: string, number: number) =>
    `Planetary day of ${day}; at ${when}, hour of ${hour} (${part} hour ${String(number)} of 12, Lilly).`,
  parts: { day: 'day', night: 'night' },
  noSunrise: 'No planetary hours here on this day: the Sun does not both rise and set at this place.',
};

const nl: typeof en = {
  line: (day, hour, part, number) =>
    `Planetaire dag van ${day}, uur van ${hour} (${part}uur ${String(number)} van 12, Lilly).`,
  lineAt: (when, day, hour, part, number) =>
    `Planetaire dag van ${day}; om ${when} het uur van ${hour} (${part}uur ${String(number)} van 12, Lilly).`,
  parts: { day: 'dag', night: 'nacht' },
  noSunrise: 'Geen planetaire uren op deze dag: de Zon komt hier niet zowel op als onder.',
};

export const planetaryHourLineMessages = { en, nl };
