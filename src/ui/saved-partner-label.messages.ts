/**
 * @module ui/saved-partner-label.messages
 * @purpose en/nl wording that names the other person of a saved two-person interpretation in its history entry (#1852).
 * @conventions Each phrase starts with a space and the middle dot so it appends to a description or a kind; en and nl keep parity.
 * @exports savedPartnerLabelMessages
 */
const en = {
  /** Appended to the description (or the kind when there is none): `Short and warm · with Max Born`. */
  with: (name: string) => ` · with ${name}`,
  /** Open question for the owner (#1852): the wording shown when the partner is no longer in the people list. */
  gone: ' · with someone no longer in your list',
};

const nl: typeof en = {
  with: (name) => ` · met ${name}`,
  gone: ' · met iemand die niet meer in je lijst staat',
};

export const savedPartnerLabelMessages = { en, nl };
