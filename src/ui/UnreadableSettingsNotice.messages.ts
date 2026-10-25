/** Message catalogue for `UnreadableSettingsNotice.tsx` (#806). */
/**
 * @module ui/UnreadableSettingsNotice.messages
 * @purpose English/Dutch strings for the notice shown instead of a chart when a person's saved calculation settings cannot be read.
 * @conventions Co-located i18n file exporting `{ en, nl }` with key parity, consumed via `useMessages()`.
 * @exports unreadableSettingsNoticeMessages
 */
const en = {
  notice: (name: string) =>
    `${name}'s saved chart settings were written by a newer version of Astraya, or are damaged, so this version cannot read them. No chart is drawn, because it would use settings nobody chose. Open this person in an up-to-date copy of the app, or choose new settings for them in Preferences.`,
};

const nl: typeof en = {
  notice: (name: string) =>
    `De opgeslagen horoscoopinstellingen van ${name} zijn gemaakt door een nieuwere versie van Astraya of zijn beschadigd, dus deze versie kan ze niet lezen. Er wordt geen horoscoop getekend, omdat die instellingen zou gebruiken die niemand heeft gekozen. Open deze persoon in een bijgewerkte versie van de app, of kies nieuwe instellingen voor deze persoon in Voorkeuren.`,
};

export const unreadableSettingsNoticeMessages = { en, nl };
