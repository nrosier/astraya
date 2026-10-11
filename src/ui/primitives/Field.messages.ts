/**
 * @module ui/primitives/Field.messages
 * @purpose English/Dutch wording the shared Field wrapper adds around a control's own label.
 * @conventions Co-located `{ en, nl }` catalogue read through `useMessages()`; only what the primitive itself says, never a screen's labels.
 * @exports fieldMessages
 */
const en = { optional: 'optional' };
const nl: typeof en = { optional: 'optioneel' };

export const fieldMessages = { en, nl };
