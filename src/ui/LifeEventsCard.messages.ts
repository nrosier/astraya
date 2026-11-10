/** Message catalogue for `LifeEventsCard.tsx` (#1439). */
/**
 * @module ui/LifeEventsCard.messages
 * @purpose English/Dutch strings for the Life events summary card on the birth record.
 * @conventions Co-located i18n file exporting `{ en, nl }` with key parity, consumed via `useMessages()`.
 * @exports lifeEventsCardMessages
 */
const en = {
  manage: (count: number) => `Manage (${String(count)})`,
  manageButton: 'Manage Life Events',
  previewLabel: 'Most recent life events',
  showing: (count: number, max: number) => `Showing ${String(count)} of ${String(max)} events`,
  empty: 'No life events yet.',
};

const nl: typeof en = {
  manage: (count: number) => `Beheren (${String(count)})`,
  manageButton: 'Levensgebeurtenissen beheren',
  previewLabel: 'Meest recente levensgebeurtenissen',
  showing: (count: number, max: number) => `${String(count)} van ${String(max)} gebeurtenissen`,
  empty: 'Nog geen levensgebeurtenissen.',
};

export const lifeEventsCardMessages = { en, nl };
