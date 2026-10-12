/**
 * Message catalogue for `DegreeSymbolSetting.tsx` (#527).
 */
/**
 * @module DegreeSymbolSetting.messages
 * @purpose English/Dutch message catalogue for the degree-symbol (Sabian symbol) visibility preference control.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `DegreeSymbolSetting.tsx`.
 * @exports degreeSymbolSettingMessages
 */
const en = {
  label: 'Sabian symbols',
  explanation:
    'A traditional image and quality attached to one exact zodiac degree, independent of which planet or point stands there. When a placement in the report falls on that degree, its note appears alongside the regular interpretation.',
  toggle: 'Show Sabian symbol notes',
  hint: 'Hides the Sabian-symbol note under each placement. Kept on this device only.',
};

const nl: typeof en = {
  label: 'Sabian-symbolen',
  explanation:
    'Een traditioneel beeld en kwaliteit die bij precies één graad van de dierenriem horen, los van welke planeet of punt daar staat. Als een plaatsing in het rapport op die graad valt, verschijnt die notitie naast de gewone interpretatie.',
  toggle: 'Sabian-symboolnotities tonen',
  hint: 'Verbergt de Sabian-symboolnotitie onder elke plaatsing. Alleen op dit apparaat.',
};

export const degreeSymbolSettingMessages = { en, nl };
