/**
 * Message catalogue for `AccountPreferencesNotices.tsx` (#1066).
 */
/**
 * @module AccountPreferencesNotices.messages
 * @purpose English/Dutch strings for the account-preferences reconcile prompt, the failed-save message and the unreadable-setting notice.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages(accountPreferencesNoticesMessages)`; `nl` is typed as `typeof en`.
 * @exports accountPreferencesNoticesMessages
 */
const en = {
  fieldNames: {
    locale: 'Language',
    defaultRulership: 'Default rulership',
    defaultCalculationProfile: 'Default calculation profile',
    orbLibrary: 'Orb library',
    orbContextSource: 'Orb profile per chart type',
    transitFilterDaily: 'Default transit filter (Transits)',
    transitFilterYearly: 'Default transit filter (Forecast)',
  },
  orbProfileCount: (count: number, names: string) =>
    count === 1 ? `1 orb profile (${names})` : `${String(count)} orb profiles (${names})`,
  orbContextNames: { transit: 'Transits', synastry: 'Synastry', natal: 'Natal' },
  orbCardSource: 'the chart’s own orbs',
  transitPresetNames: { important: 'Important', outer: 'Outer', personal: 'Personal', all: 'All' },
  transitCustom: 'Custom filter',
  rulershipNames: { modern: 'Modern', traditional: 'Traditional', both: 'Both' },
  profileNames: {
    custom: 'Custom',
    'modern-western-v1': 'Modern Western',
    'traditional-western-v1': 'Traditional Western',
    'sidereal-lahiri-v1': 'Sidereal (Lahiri)',
  },
  defaultValue: 'Astraya default',
  unreadableValue: 'saved by a newer version of Astraya',

  reconcileHeading: 'Which settings should you keep?',
  reconcileIntroAccount:
    'This device has settings that differ from the ones saved in your account. Choose which to keep for each. Your choice syncs to your other devices.',
  reconcileIntroDevice:
    'This device has settings saved by an earlier version of Astraya that differ from the current ones. Choose which to keep for each.',
  useDeviceAccount: (value: string) => `This device: ${value}`,
  useAccountAccount: (value: string) => `Your account: ${value}`,
  useDeviceLocal: (value: string) => `Saved earlier: ${value}`,
  useAccountLocal: (value: string) => `Current: ${value}`,
  saveChoices: 'Keep these settings',
  saving: 'Saving…',
  keepAccount: 'Keep my account’s settings',
  keepCurrent: 'Keep the current settings',
  reconcileFailed: (message: string) => `That did not go through, so nothing has changed. ${message}`,

  saveFailed: (message: string) => `Your setting could not be saved, so it is back to what it was. ${message}`,
  dismiss: 'Dismiss',
  unreadable: (names: string) =>
    `${names}: saved by a newer version of Astraya, which this version cannot read. Astraya’s default is used here until you choose a new value.`,
};

const nl: typeof en = {
  fieldNames: {
    locale: 'Taal',
    defaultRulership: 'Standaard heersende planeten',
    defaultCalculationProfile: 'Standaard berekeningsprofiel',
    orbLibrary: 'Orbenbibliotheek',
    orbContextSource: 'Orbenprofiel per horoscoopsoort',
    transitFilterDaily: 'Standaard transitfilter (Transits)',
    transitFilterYearly: 'Standaard transitfilter (Prognose)',
  },
  orbProfileCount: (count: number, names: string) =>
    count === 1 ? `1 orbenprofiel (${names})` : `${String(count)} orbenprofielen (${names})`,
  orbContextNames: { transit: 'Transits', synastry: 'Synastrie', natal: 'Geboortehoroscoop' },
  orbCardSource: 'de eigen orben van de horoscoop',
  transitPresetNames: { important: 'Belangrijk', outer: 'Buiten', personal: 'Persoonlijk', all: 'Alle' },
  transitCustom: 'Aangepast filter',
  rulershipNames: { modern: 'Modern', traditional: 'Traditioneel', both: 'Beide' },
  profileNames: {
    custom: 'Aangepast',
    'modern-western-v1': 'Modern westers',
    'traditional-western-v1': 'Traditioneel westers',
    'sidereal-lahiri-v1': 'Siderisch (Lahiri)',
  },
  defaultValue: 'Standaard van Astraya',
  unreadableValue: 'bewaard door een nieuwere versie van Astraya',

  reconcileHeading: 'Welke instellingen wil je houden?',
  reconcileIntroAccount:
    'Dit apparaat heeft instellingen die verschillen van die in je account. Kies per instelling welke je houdt. Je keuze wordt naar je andere apparaten gesynchroniseerd.',
  reconcileIntroDevice:
    'Dit apparaat heeft instellingen van een eerdere versie van Astraya die verschillen van de huidige. Kies per instelling welke je houdt.',
  useDeviceAccount: (value: string) => `Dit apparaat: ${value}`,
  useAccountAccount: (value: string) => `Je account: ${value}`,
  useDeviceLocal: (value: string) => `Eerder opgeslagen: ${value}`,
  useAccountLocal: (value: string) => `Huidig: ${value}`,
  saveChoices: 'Deze instellingen houden',
  saving: 'Opslaan…',
  keepAccount: 'De instellingen van mijn account houden',
  keepCurrent: 'De huidige instellingen houden',
  reconcileFailed: (message: string) => `Dat is niet gelukt, er is dus niets veranderd. ${message}`,

  saveFailed: (message: string) => `Je instelling kon niet worden opgeslagen en staat weer op wat ze was. ${message}`,
  dismiss: 'Sluiten',
  unreadable: (names: string) =>
    `${names}: opgeslagen door een nieuwere versie van Astraya, die deze versie niet kan lezen. Hier wordt de standaard van Astraya gebruikt tot je een nieuwe waarde kiest.`,
};

export const accountPreferencesNoticesMessages = { en, nl };
