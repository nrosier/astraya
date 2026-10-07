/**
 * Message catalogue for `people-list.ts`'s `summary()` (#158).
 */
/**
 * @module ui/people-list.messages
 * @purpose en/nl message catalogue for people-list.ts's `summary()` function, describing what birth data is or isn't on record for a person row.
 * @conventions Co-located i18n file exporting `{ en, nl }`, read directly by people-list.ts (not via useMessages, since summary() is a plain function, not a component).
 * @exports peopleListMessages
 */
const en = {
  noChartYet: (missing: string) => `No chart yet — still needed: ${missing}`,
  birthData: 'birth data',
  timeUnknown: 'time unknown',
  placeNotRecorded: 'place not recorded',
};

const nl: typeof en = {
  noChartYet: (missing: string) => `Nog geen horoscoop — nog nodig: ${missing}`,
  birthData: 'geboortegegevens',
  timeUnknown: 'tijd onbekend',
  placeNotRecorded: 'plaats niet geregistreerd',
};

export const peopleListMessages = { en, nl };
