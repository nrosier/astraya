/**
 * Message catalogue for pinned event-search results (#1061).
 */
/**
 * @module EventPins.messages
 * @purpose English/Dutch UI text for pinning event-search results and listing, unpinning and restoring pins.
 * @conventions Co-located `{ en, nl }` catalogue consumed through `useMessages()`; `nl` is typed as `typeof en`; refusal codes from the store are mapped to wording here, never shown raw.
 * @exports eventPinsMessages
 */
const en = {
  heading: 'Pinned events',
  scopeNote: 'Pinned in your account. They sync when you are signed in and stay on this device when you are not.',
  unavailable: 'Pins are not available yet. The store is still opening.',
  empty: 'No pinned events yet. Use Pin on a result to keep it here.',
  pinColumn: 'Pin',
  pin: 'Pin',
  unpin: 'Unpin',
  pinLabel: (event: string) => `Pin ${event}`,
  unpinLabel: (event: string) => `Unpin ${event}`,
  unpinned: (event: string) => `Unpinned “${event}”.`,
  undo: 'Undo',
  pinFailed: 'That did not save.',
  invalidPin: 'This result cannot be pinned.',
  unreadable: {
    'future-version': 'Pinned by a newer version of Astraya, so this version cannot show it. It is kept.',
    'unknown-tool': 'Pinned from a tool this version does not know. It is kept.',
    invalid: 'The pinned details are not valid here, so it cannot be shown. It is kept.',
  },
  unreadablePin: 'Unreadable pin',
};

const nl: typeof en = {
  heading: 'Vastgezette gebeurtenissen',
  scopeNote:
    'Vastgezet in je account. Ze synchroniseren als je bent aangemeld en blijven op dit apparaat als je dat niet bent.',
  unavailable: 'Vastzetten is nog niet beschikbaar. De opslag wordt nog geopend.',
  empty: 'Nog geen vastgezette gebeurtenissen. Gebruik Vastzetten bij een resultaat om het hier te bewaren.',
  pinColumn: 'Vastzetten',
  pin: 'Vastzetten',
  unpin: 'Losmaken',
  pinLabel: (event: string) => `${event} vastzetten`,
  unpinLabel: (event: string) => `${event} losmaken`,
  unpinned: (event: string) => `“${event}” losgemaakt.`,
  undo: 'Ongedaan maken',
  pinFailed: 'Dat is niet opgeslagen.',
  invalidPin: 'Dit resultaat kan niet worden vastgezet.',
  unreadable: {
    'future-version':
      'Vastgezet door een nieuwere versie van Astraya, dus deze versie kan het niet tonen. Het blijft bewaard.',
    'unknown-tool': 'Vastgezet vanuit een hulpmiddel dat deze versie niet kent. Het blijft bewaard.',
    invalid: 'De vastgezette gegevens zijn hier niet geldig, dus ze kunnen niet worden getoond. Ze blijven bewaard.',
  },
  unreadablePin: 'Onleesbare pin',
};

export const eventPinsMessages = { en, nl };
