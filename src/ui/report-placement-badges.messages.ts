/**
 * @module report-placement-badges.messages
 * @purpose English/Dutch words for the placement badges (house word and the retrograde label) shown under each placement title in the report (#802).
 * @conventions Co-located i18n file exporting `{ en, nl }` with identical keys; the house badge is `ordinal` + `houseWord` (e.g. "9th house", "9e huis").
 * @exports reportPlacementBadgeMessages
 */
const en = {
  houseWord: 'house',
  retrograde: 'Retrograde',
};

const nl: typeof en = {
  houseWord: 'huis',
  retrograde: 'Retrograad',
};

export const reportPlacementBadgeMessages = { en, nl };
