/**
 * Message catalogue for `About.tsx` (#158).
 */
/**
 * @module About.messages
 * @purpose English/Dutch i18n strings for the About screen (version, privacy, licence, acknowledgements, astrology primer).
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by About.tsx via `useMessages(aboutMessages)`; `nl` is typed as `typeof en` to keep both locales in parity.
 * @exports aboutMessages
 */
const en = {
  heading: 'About Astraya',

  versionHeading: 'Version',
  releaseLabel: 'Release',
  commitLabel: 'Commit',
  builtLabel: 'Built',
  swissEphemerisLabel: 'Swiss Ephemeris',
  notLoaded: 'not loaded',
  changelogLink: 'What changed in this release',

  yourDataHeading: 'Your data',
  yourDataParagraph1Before: 'Charts are calculated ',
  yourDataParagraph1Strong: 'entirely in your browser',
  yourDataParagraph1After:
    '. Birth data you enter is stored on this device, in its IndexedDB storage, and that copy is the authoritative one.',
  yourDataParagraph2Before: 'If you are not signed in, ',
  yourDataParagraph2Strong: 'almost nothing you enter leaves this device',
  yourDataParagraph2After:
    '. There is no analytics and no tracking. The one exception is opt-in: searching for a birth place by name sends the text you type to a geocoding service to find its coordinates. Nothing else leaves this device unless you choose to sign in.',
  yourDataParagraph3Before: 'If you sign in, your people and charts also sync to ',
  yourDataParagraph3Em: 'this server',
  yourDataParagraph3After:
    ' so they reach your other devices. They are not shared with anyone else and are never sent to a third party. They are encrypted at rest. This protects a stolen database file or backup, not someone who has compromised the server itself, because the server needs the key in order to run.',
  yourDataParagraph4:
    'You can delete any person, along with every chart derived from them, from the person list. Deleting clears the local copy and instructs the server to drop its copy.',
  yourDataParagraph5:
    'The interpretation shown by default is written ahead of release and shipped as part of the application. No AI service is contacted for it.',
  yourDataParagraph5b:
    'If you sign in and explicitly choose AI-customized interpretation, the chart facts and instructions you review beforehand are sent through this server to its configured AI provider, for that one request only. Nothing is sent unless you choose that option.',

  licenceHeading: 'Licence and source',
  licenceParagraphBefore: 'Astraya is free software under the ',
  licenceParagraphStrong: 'GNU Affero General Public License, version 3 or later',
  licenceParagraphAfter:
    '. You may use, study, modify and redistribute it under those terms. Because the AGPL covers use over a network, you are entitled to the source code of this running instance:',
  sourceCodeLink: 'Source code for this build',

  acknowledgementsHeading: 'Acknowledgements',
  acknowledgementsParagraph1Before: 'Positions are computed with the ',
  acknowledgementsParagraph1Strong: 'Swiss Ephemeris',
  acknowledgementsParagraph1After:
    ', copyright © 1997–2021 Astrodienst AG, Zürich, used under the AGPL. Swiss Ephemeris derives from the NASA JPL DE431 planetary ephemeris. Astrodienst asks that this credit be visible, and it is.',
  acknowledgementsParagraph2Before:
    'Reference positions used to test Astraya come from the NASA JPL Horizons system. A full list of third-party components and their licences is in ',
  acknowledgementsParagraph2After: '.',
  acknowledgementsGlyphs:
    'The planet, sign and aspect symbols are derived from the Kerykeion project (AGPL-3.0). The alternate forms of Uranus and Pluto, and the text and Unicode ways of writing each symbol, were made for Astraya under the same licence.',

  astrologyPrimerHeading: 'Astrology primer',
  primerIntro:
    'Astrology is the practice of understanding human experience through the apparent positions of the Sun, Moon and planets in the sky at a given moment and place. A natal chart is a snapshot of that sky at the moment of birth.',
  primerChart: 'The chart has three dimensions:',
  primerChartList:
    'The planets (the Sun, the Moon and the planets of our solar system), their positions and movement; the zodiac (12 signs organised in a circle); and the houses (12 angular divisions of the sky, calculated from the time and place of birth).',

  primerHistoryHeading: 'A brief history',
  primerHistoryPara:
    'Astrology is one of the oldest continuously practised traditions, with roots in Babylonian celestial omen-reading over three thousand years ago. The Hellenistic astrologers of Egypt and Greece (from roughly the 2nd century BCE) gave it the horoscope, the twelve houses, and much of the technical vocabulary still used today. It spread through the medieval Islamic world, which preserved and extended it, then into medieval and Renaissance Europe. The 20th century brought a split between a psychological, archetype-focused approach and the older, more predictive traditional methods — both of which this app draws on.',

  primerBodiesHeading: 'Planets',
  primerBodiesPara:
    'Astrology counts the Sun and Moon among its planets, though astronomically they are not planets. The personal planets (Mercury through Mars) move quickly. The social planets (Jupiter and Saturn) move more slowly. The outer planets (Uranus, Neptune, Pluto) move slowest.',

  primerSignsHeading: 'The zodiac and signs',
  primerSignsPara:
    'The 12 signs represent archetypal energies and qualities. The sign of a planet describes how that planet expresses itself. Your Sun sign is determined by your birth date (roughly March 21 to April 19 is Aries); your Moon sign and rising sign (the "first house") depend on your exact birth time and place.',

  primerHousesHeading: 'Houses',
  primerHousesPara:
    "The 12 houses divide the chart into life areas: the 1st house is identity and how you appear; the 7th house is partnerships and marriage; the 10th house is career and public life. A planet in a house colours that area of life with the planet's energy.",

  primerAspectsHeading: 'Aspects',
  primerAspectsPara:
    'An aspect is the angle between two planets. A 0° conjunction means they are allied and work together. A 180° opposition means they are in tension. A 90° square is dynamic friction.',

  primerDignityHeading: 'Dignity and rulership',
  primerDignityPara:
    'Each sign has a natural ruler, the planet most at home there. The app includes both traditional (classical) rulers and modern ones (Uranus, Neptune, Pluto).',

  primerResources:
    'For more, read conventional astrology introductions or explore the interpretations throughout this app.',
};

const nl: typeof en = {
  heading: 'Over Astraya',

  versionHeading: 'Versie',
  releaseLabel: 'Release',
  commitLabel: 'Commit',
  builtLabel: 'Gebouwd',
  swissEphemerisLabel: 'Swiss Ephemeris',
  notLoaded: 'niet geladen',
  changelogLink: 'Wat er veranderd is in deze release',

  yourDataHeading: 'Jouw gegevens',
  yourDataParagraph1Before: 'Horoscopen worden ',
  yourDataParagraph1Strong: 'volledig in je browser',
  yourDataParagraph1After:
    ' berekend. Geboortegegevens die je invoert worden op dit apparaat opgeslagen, in de IndexedDB-opslag, en die kopie is de gezaghebbende.',
  yourDataParagraph2Before: 'Als je niet bent ingelogd, ',
  yourDataParagraph2Strong: 'verlaat bijna niets wat je invoert dit apparaat',
  yourDataParagraph2After:
    '. Er is geen analytics en geen tracking. De enige uitzondering is optioneel: het zoeken naar een geboorteplaats op naam stuurt de tekst die je typt naar een geocoderingsdienst om de coördinaten te vinden. Er verlaat niets anders dit apparaat, tenzij je inlogt.',
  yourDataParagraph3Before: 'Als je inlogt, synchroniseren je personen en horoscopen ook naar ',
  yourDataParagraph3Em: 'deze server',
  yourDataParagraph3After:
    ' zodat ze je andere apparaten bereiken. Ze worden met niemand anders gedeeld en nooit naar derden verzonden. Ze zijn versleuteld opgeslagen. Dit beschermt tegen een gestolen databasebestand of backup, niet tegen iemand die de server zelf heeft gecompromitteerd, omdat de server de sleutel nodig heeft om te draaien.',
  yourDataParagraph4:
    'Je kunt elke persoon, samen met elke horoscoop die daarvan is afgeleid, verwijderen vanuit de personenlijst. Verwijderen wist de lokale kopie en instrueert de server om zijn kopie te laten vallen.',
  yourDataParagraph5:
    'De interpretatie die standaard wordt getoond, is voorafgaand aan de release geschreven en meegeleverd als onderdeel van de applicatie. Daarvoor wordt geen AI-dienst benaderd.',
  yourDataParagraph5b:
    'Als je inlogt en expliciet kiest voor AI-aangepaste interpretatie, worden de chartfeiten en instructies die je vooraf bekijkt voor dat ene verzoek via deze server naar de geconfigureerde AI-provider gestuurd. Er wordt niets verzonden, tenzij je voor die optie kiest.',

  licenceHeading: 'Licentie en broncode',
  licenceParagraphBefore: 'Astraya is vrije software onder de ',
  licenceParagraphStrong: 'GNU Affero General Public License, versie 3 of later',
  licenceParagraphAfter:
    '. Je mag het gebruiken, bestuderen, aanpassen en verspreiden onder die voorwaarden. Omdat de AGPL gebruik via een netwerk dekt, heb je recht op de broncode van deze draaiende instantie:',
  sourceCodeLink: 'Broncode voor deze build',

  acknowledgementsHeading: 'Dankwoord',
  acknowledgementsParagraph1Before: 'Posities worden berekend met de ',
  acknowledgementsParagraph1Strong: 'Swiss Ephemeris',
  acknowledgementsParagraph1After:
    ', copyright © 1997–2021 Astrodienst AG, Zürich, gebruikt onder de AGPL. Swiss Ephemeris is afgeleid van de NASA JPL DE431 planetaire ephemeris. Astrodienst vraagt dat deze credit zichtbaar is, en dat is hij.',
  acknowledgementsParagraph2Before:
    'Referentieposities die worden gebruikt om Astraya te testen komen van het NASA JPL Horizons-systeem. Een volledige lijst van externe componenten en hun licenties staat in ',
  acknowledgementsParagraph2After: '.',
  acknowledgementsGlyphs:
    'De symbolen voor planeten, tekens en aspecten zijn afgeleid van het Kerykeion-project (AGPL-3.0). De alternatieve vormen van Uranus en Pluto, en de tekst- en Unicode-weergave van elk symbool, zijn voor Astraya gemaakt onder dezelfde licentie.',

  astrologyPrimerHeading: 'Astrologie-primer',
  primerIntro:
    'Astrologie is de praktijk om menselijke ervaring te begrijpen door de schijnbare posities van de Zon, Maan en planeten aan de hemel op een gegeven moment en plaats. Een geboortechart is een momentopname van die hemel op het moment van geboorte.',
  primerChart: 'De kaart heeft drie dimensies:',
  primerChartList:
    'De planeten (de Zon, de Maan en de planeten van ons zonnestelsel), hun positie en beweging; de dierenriem (12 tekens georganiseerd in een cirkel); en de huizen (12 hoekige afdelingen van de hemel, berekend uit het tijdstip en de plaats van geboorte).',

  primerHistoryHeading: 'Een korte geschiedenis',
  primerHistoryPara:
    'Astrologie is een van de oudste doorlopend beoefende tradities, met wortels in Babylonische hemelse voortekens van ruim drieduizend jaar geleden. De hellenistische astrologen van Egypte en Griekenland (vanaf ongeveer de 2e eeuw v.Chr.) gaven haar de horoscoop, de twaalf huizen en een groot deel van de technische terminologie die nog steeds wordt gebruikt. Ze verspreidde zich via de middeleeuwse islamitische wereld, die haar bewaarde en uitbreidde, en vervolgens naar middeleeuws en renaissance-Europa. De 20e eeuw bracht een splitsing tussen een psychologische, op archetypes gerichte benadering en de oudere, meer voorspellende traditionele methoden — deze app put uit beide.',

  primerBodiesHeading: 'Planeten',
  primerBodiesPara:
    'De astrologie rekent de Zon en de Maan tot haar planeten, hoewel ze astronomisch geen planeten zijn. De persoonlijke planeten (Mercurius tot en met Mars) bewegen snel. De sociale planeten (Jupiter en Saturnus) bewegen langzamer. De buitenplaneten (Uranus, Neptunus, Pluto) bewegen het langzaamst.',

  primerSignsHeading: 'De dierenriem en tekens',
  primerSignsPara:
    'De 12 tekens vertegenwoordigen archetypische energieën en kwaliteiten. Het teken van een planeet beschrijft hoe die planeet zich uit. Je Zonneteken wordt bepaald door je geboortedatum (ruwweg 21 maart tot 19 april is Ram); je Maanteken en rijzend teken (het "eerste huis") hangen af van je exacte geboortemoment en -plaats.',

  primerHousesHeading: 'Huizen',
  primerHousesPara:
    'De 12 huizen verdelen de kaart in levensgebieden: het 1e huis is identiteit en hoe je eruitziet; het 7e huis is partnerschappen en huwelijk; het 10e huis is carrière en openbare leven. Een planeet in een huis kleurt dat gebied van het leven in met de energie van de planeet.',

  primerAspectsHeading: 'Aspecten',
  primerAspectsPara:
    'Een aspect is de hoek tussen twee planeten. Een 0° conjunctie betekent dat ze verbonden zijn en samenwerken. Een 180° oppositie betekent dat ze in spanning staan. Een 90° kwadraat is dynamische wrijving.',

  primerDignityHeading: 'Waardigheid en heerschappij',
  primerDignityPara:
    'Elk teken heeft een natuurlijke heerser, de planeet die daar het meest thuis is. De app bevat zowel traditionele (klassieke) heersers als moderne (Uranus, Neptunus, Pluto).',

  primerResources:
    'Voor meer informatie kun je conventionele astrologie-introducties lezen of de interpretaties in deze app verkennen.',
};

export const aboutMessages = { en, nl };
