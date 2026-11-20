/**
 * @module ui/engine-error.messages
 * @purpose English/Dutch text for an ephemeris engine restart (#1856): the sentence a calculation screen shows instead of the raw Emscripten abort.
 * @conventions Co-located i18n file exporting `{ en, nl }`, read by `engine-error.ts` through `useMessages()` at the call site; `nl` is typed as `typeof en`.
 * @exports engineErrorMessages
 */
const en = {
  restarted: 'The calculation engine stopped unexpectedly and has been restarted. Try again.',
};

const nl: typeof en = {
  restarted: 'De rekenmotor stopte onverwacht en is opnieuw gestart. Probeer het nog eens.',
};

export const engineErrorMessages = { en, nl };
