/**
 * @module ui/MapSettingsDialog.messages
 * @purpose English/Dutch wording for the Astrocartography Map settings dialog and its applied-state summary.
 * @conventions Co-located `{ en, nl }` catalogue read through `useMessages()`; the line-type and body names come from the screen's own messages and the shared astrological names, not repeated here.
 * @exports mapSettingsDialogMessages
 */
const en = {
  trigger: 'Map settings',
  heading: 'Map settings',
  closeLabel: 'Close without applying',
  apply: 'Apply',
  applyNothing: 'Apply — nothing has changed',
  cancel: 'Cancel',
  lineTypesLegend: 'Line types',
  primaryBodiesLegend: 'Primary bodies',
  additionalBodiesLegend: 'Additional bodies',
  localSpaceLegend: 'Local Space',
  showLocalSpaceLines: 'Show Local Space lines for the checked bodies',
  relocationLegend: 'Relocation (optional)',
  relocationHint: 'Recomputes the Ascendant/Midheaven for another place, without changing any line.',
  latitudeLabel: 'Latitude',
  longitudeLabel: 'Longitude',
  errorRange: (min: string, max: string) => `Enter a number from ${min} to ${max}.`,
  errorBoth: 'Enter both latitude and longitude, or leave both empty.',
  appliesOnApply: 'Nothing changes on the map until you choose Apply.',
  summary: (lineTypes: number, bodies: number, localSpace: boolean, relocated: boolean) =>
    [
      `${String(lineTypes)} ${lineTypes === 1 ? 'line type' : 'line types'}`,
      `${String(bodies)} ${bodies === 1 ? 'body' : 'bodies'}`,
      `Local Space ${localSpace ? 'on' : 'off'}`,
      ...(relocated ? ['relocated'] : []),
    ].join(' · '),
};

const nl: typeof en = {
  trigger: 'Kaartinstellingen',
  heading: 'Kaartinstellingen',
  closeLabel: 'Sluiten zonder toe te passen',
  apply: 'Toepassen',
  applyNothing: 'Toepassen — niets gewijzigd',
  cancel: 'Annuleren',
  lineTypesLegend: 'Lijntypen',
  primaryBodiesLegend: 'Hoofdlichamen',
  additionalBodiesLegend: 'Aanvullende hemellichamen',
  localSpaceLegend: 'Local Space',
  showLocalSpaceLines: 'Toon Local Space-lijnen voor de aangevinkte hemellichamen',
  relocationLegend: 'Relocatie (optioneel)',
  relocationHint: 'Berekent de Ascendant/Midheaven voor een andere plaats, zonder een lijn te wijzigen.',
  latitudeLabel: 'Breedtegraad',
  longitudeLabel: 'Lengtegraad',
  errorRange: (min: string, max: string) => `Voer een getal in van ${min} tot ${max}.`,
  errorBoth: 'Voer zowel breedte- als lengtegraad in, of laat beide leeg.',
  appliesOnApply: 'Er verandert niets aan de kaart tot je Toepassen kiest.',
  summary: (lineTypes: number, bodies: number, localSpace: boolean, relocated: boolean) =>
    [
      `${String(lineTypes)} ${lineTypes === 1 ? 'lijntype' : 'lijntypen'}`,
      `${String(bodies)} ${bodies === 1 ? 'hemellichaam' : 'hemellichamen'}`,
      `Local Space ${localSpace ? 'aan' : 'uit'}`,
      ...(relocated ? ['gerelocateerd'] : []),
    ].join(' · '),
};

export const mapSettingsDialogMessages = { en, nl };
