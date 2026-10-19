/**
 * Message catalogue for `HarmonicView.tsx` (#158).
 */
/**
 * @module HarmonicView.messages
 * @purpose English/Dutch i18n strings for the Harmonic & Varga charts screen, including the divisional-chart preset picker.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by HarmonicView.tsx via `useMessages(harmonicViewMessages)`; `nl` is typed as `typeof en`. `d10Note` is also read by the PDF plan (#725), so the D10 caveat is worded once.
 * @exports harmonicViewMessages
 */
/**
 * The D10 convention caveat (#725), one sentence shared by the preset's description on screen and by the PDF export,
 * so a reader of either sees the same limit. `src/astrology/harmonics.ts` holds the same fact for the JSON export.
 */
const d10CaveatEn =
  'This chart uses one continuous rule for every division (longitude × 10, wrapped into the zodiac), not the classical odd/even sign restart that several Vedic sources apply to D10. Treat this D10 as an approximation and check which convention your source follows.';
const d10CaveatNl =
  'Deze horoscoop gebruikt voor elke indeling één doorlopende regel (lengtegraad × 10, teruggevouwen in de dierenriem), niet de klassieke herstart van de tekenstelling bij oneven/even tekens die verschillende Vedische bronnen op D10 toepassen. Beschouw deze D10 als een benadering en controleer welke conventie jouw bron volgt.';

const en = {
  personFallback: 'Person',
  thisPerson: 'This person',
  harmonicChartsFallback: 'Harmonic & Varga charts',
  needsCompleteRecord: (name: string) =>
    `A harmonic chart needs a real Ascendant to build its own houses from, so it needs a complete birth record with a known time. ${name}’s does not have one yet. Fill in or correct it on the`,
  personPageLink: 'person page',

  heading: (name: string) => `${name}’s harmonic chart`,
  headingFallback: 'Harmonic chart',
  hint: 'Every longitude multiplied by a whole number and wrapped back into the zodiac, with whole-sign houses built from the multiplied Ascendant — the general mechanism behind both harmonic charts and Vedic Varga (divisional) charts. See the named presets’ own note on which Varga convention each one follows. This screen computes divisional-chart positions only — it has no Vimshottari dasha timing or planetary-yoga detection, so it is not a full Jyotish toolkit.',

  presetDescriptions: {
    D1: 'The natal chart itself; the trivial harmonic.',
    D9: 'Marriage and inner strength. This module’s continuous rule matches the classical Parashari result exactly.',
    D10: `Career and public life. ${d10CaveatEn}`,
  } as Readonly<Record<string, string>>,
  d10Note: d10CaveatEn,

  divisionalChartLabel: 'Divisional chart',
  customHarmonicOption: 'Custom harmonic…',
  harmonicNumberLabel: 'Harmonic number',
  harmonicLabel: (n: string) => `Harmonic ${n}`,
  invalidHarmonicNumber: 'Enter a whole number of 1 or more.',
  provenanceCaption: 'Radix → harmonic provenance',
  provenanceHint: (n: string) =>
    `Each row preserves the radix longitude used to calculate this Harmonic ${n} position (radix longitude × ${n}, wrapped into 0°–360°).`,
  bodyLabel: 'Body',
  radixLongitudeLabel: 'Radix longitude',
  harmonicLongitudeLabel: (n: string) => `Harmonic ${n} longitude`,
  housesUndefined:
    'The underlying natal chart’s houses have no valid solution — this person’s birth place falls at a latitude the chosen house system can’t resolve. Try a different house system in Extended settings on their chart page, or a location further from the poles.',
};

const nl: typeof en = {
  personFallback: 'Persoon',
  thisPerson: 'Deze persoon',
  harmonicChartsFallback: 'Harmonische & Varga-horoscopen',
  needsCompleteRecord: (name: string) =>
    `Een harmonische horoscoop heeft een echte Ascendant nodig om zijn eigen huizen op te bouwen, dus is een volledig geboorterecord met een bekende tijd vereist. Dat van ${name} is nog niet compleet. Vul het aan of corrigeer het op de`,
  personPageLink: 'persoonspagina',

  heading: (name: string) => `Harmonische horoscoop van ${name}`,
  headingFallback: 'Harmonische horoscoop',
  hint: 'Elke lengtegraad vermenigvuldigd met een geheel getal en teruggevouwen in de dierenriem, met huizen-per-heel-teken opgebouwd uit de vermenigvuldigde Ascendant — het algemene mechanisme achter zowel harmonische horoscopen als Vedische Varga (divisionele) horoscopen. Zie de eigen toelichting van de benoemde presets over welke Varga-conventie elke preset volgt. Dit scherm berekent alleen divisionele posities — er is geen Vimshottari-dasha-timing of yoga-detectie, dus dit is geen volledig Jyotish-instrumentarium.',

  presetDescriptions: {
    D1: 'De geboortehoroscoop zelf; de triviale harmonische.',
    D9: 'Huwelijk en innerlijke kracht. De doorlopende regel van deze module komt exact overeen met het klassieke Parashari-resultaat.',
    D10: `Loopbaan en openbaar leven. ${d10CaveatNl}`,
  },
  d10Note: d10CaveatNl,

  divisionalChartLabel: 'Divisionele horoscoop',
  customHarmonicOption: 'Aangepast harmonisch getal…',
  harmonicNumberLabel: 'Harmonisch getal',
  harmonicLabel: (n: string) => `Harmonisch ${n}`,
  invalidHarmonicNumber: 'Voer een geheel getal van 1 of meer in.',
  provenanceCaption: 'Radix → harmonische herkomst',
  provenanceHint: (n: string) =>
    `Elke rij bewaart de radixlengtegraad waarmee deze Harmonisch ${n}-positie is berekend (radixlengtegraad × ${n}, teruggevouwen naar 0°–360°).`,
  bodyLabel: 'Lichaam',
  radixLongitudeLabel: 'Radixlengtegraad',
  harmonicLongitudeLabel: (n: string) => `Harmonisch ${n}-lengtegraad`,
  housesUndefined:
    'De huizen van de onderliggende natale horoscoop hebben geen geldige oplossing — de geboorteplaats van deze persoon valt op een breedtegraad die het gekozen huizensysteem niet kan oplossen. Probeer een ander huizensysteem bij Uitgebreide instellingen op de horoscooppagina, of een locatie verder van de polen.',
};

export const harmonicViewMessages = { en, nl };
