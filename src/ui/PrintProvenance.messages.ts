/**
 * Message catalogue for `PrintProvenance.tsx` (#564).
 */
/**
 * @module PrintProvenance.messages
 * @purpose English/Dutch i18n strings for the printed-page provenance footer: which calculation settings produced the chart on this page.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by PrintProvenance.tsx via `useMessages(printProvenanceMessages)`; `nl` is typed as `typeof en`.
 * @exports printProvenanceMessages
 */
const en = {
  summary: (houseSystem: string, zodiac: string, rulership: string, snapshotIdentity: string, generatedAt: string) =>
    `Astraya — ${houseSystem} houses, ${zodiac} zodiac, ${rulership} rulers, snapshot ${snapshotIdentity} — printed ${generatedAt}`,
};

const nl: typeof en = {
  summary: (houseSystem: string, zodiac: string, rulership: string, snapshotIdentity: string, generatedAt: string) =>
    `Astraya — ${houseSystem}-huizen, ${zodiac} dierenriem, ${rulership} heersers, snapshot ${snapshotIdentity} — afgedrukt op ${generatedAt}`,
};

export const printProvenanceMessages = { en, nl };
