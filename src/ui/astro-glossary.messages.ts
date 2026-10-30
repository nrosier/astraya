/**
 * The one catalogue of astrology terms that carry a short plain-language definition (#456, #513).
 */
/**
 * @module astro-glossary.messages
 * @purpose English/Dutch name and one-to-three-sentence definition for each astrology term a screen may explain through `GlossaryTerm`, so a term reads the same wherever it appears; optional per-locale `matches` lists the word forms the automatic body-text tooltips (#902) look for.
 * @conventions Co-located i18n file exporting `{ en, nl }`; `nl` is typed as `typeof en`, so both locales carry every term. Definitions explain the idea and why it matters; they state no orbs, numbers or conventions beyond what the app itself uses. `matches` entries are lower-case word forms of the term (plurals, variants), never the display name itself.
 * @exports astroGlossaryMessages, GlossaryTermId, GLOSSARY_TERM_IDS
 */
const en = {
  ascendant: {
    name: 'Ascendant',
    definition:
      'The sign rising on the eastern horizon at the moment of birth. It marks the start of the first house and is read as how a person meets the world.',
  },
  midheaven: {
    name: 'Midheaven',
    definition:
      'The point where the zodiac crosses the meridian above the horizon. It marks the start of the tenth house and is read as vocation and public standing.',
  },
  houses: {
    name: 'Houses',
    definition:
      'Twelve divisions of the sky by place and time of birth, each tied to an area of life. Different house systems cut them differently.',
    matches: ['house'],
  },
  aspect: {
    name: 'Aspect',
    definition:
      'A particular angle between two bodies, such as a conjunction, square or trine. Aspects are read as how the two bodies interact.',
    matches: ['aspects'],
  },
  orb: {
    name: 'Orb',
    definition: 'How far an angle may be from exact and still count as an aspect.',
    matches: ['orbs'],
  },
  applying: {
    name: 'Applying / separating',
    definition:
      'An aspect is applying while the bodies are moving toward exact and separating once they are moving away from it. Applying contacts are traditionally read as stronger.',
  },
  retrograde: {
    name: 'Retrograde',
    definition:
      'A body that appears to move backwards against the zodiac as seen from Earth. Traditionally read as turning its themes inward or revisiting them.',
  },
  dignity: {
    name: 'Essential dignity',
    definition:
      'How well a planet is placed by sign: strongest in its own sign (rulership) and its exaltation, weakened in detriment and fall.',
    matches: ['dignities'],
  },
  dispositor: {
    name: 'Dispositor',
    definition:
      'The planet that rules the sign another planet is in. Following dispositors from planet to planet shows which planet “runs” the others.',
    matches: ['dispositors'],
  },
  chartRuler: {
    name: 'Chart ruler',
    definition: 'The planet that rules the sign on the Ascendant, read as the planet that stands for the whole chart.',
    matches: ['chart rulers'],
  },
  declination: {
    name: 'Declination',
    definition:
      'How far a body stands north or south of the celestial equator. Two bodies at the same declination are in parallel, at opposite declinations in contraparallel.',
    matches: ['declinations'],
  },
  antiscia: {
    name: 'Antiscia',
    definition:
      'Mirror points across the solstice axis: two places in the zodiac that rise and set together, and so are read as quietly connected.',
  },
  derivedPoint: {
    name: 'Derived point',
    definition: 'A sensitive point worked out from other positions rather than a body in the sky, such as a midpoint.',
    matches: ['derived points'],
  },
  // Source for wholeSign: docs/ASTROLOGY_TERMS.md, "Whole Sign Houses" (entry 103). Draft pending owner approval (#902).
  wholeSign: {
    name: 'Whole Sign houses',
    definition:
      'A house system in which the whole sign containing the Ascendant becomes the 1st house, and each following sign forms a full house.',
    matches: ['whole sign'],
  },
  sabianSymbol: {
    name: 'Sabian symbol',
    definition:
      'A traditional image and quality attached to one exact zodiac degree, independent of which planet or point stands there. Astraya shows it as an optional, secondary note next to a placement that falls on that degree.',
  },
  ayanamsa: {
    name: 'Ayanamsa',
    definition:
      'The angle between the tropical zodiac (fixed to the seasons) and the sidereal zodiac (fixed to the stars). Sidereal charts subtract it from tropical longitudes.',
  },
  transit: {
    name: 'Transit',
    definition: 'Where a planet is in the sky on a given day, compared with the positions in a birth chart.',
    matches: ['transits'],
  },
  progression: {
    name: 'Secondary progression',
    definition:
      'A symbolic forecast that lets each day after birth stand for one year of life, then reads the chart of that day.',
    matches: ['progressions'],
  },
  solarArc: {
    name: 'Solar arc',
    definition:
      'A symbolic forecast that moves every point forward by the distance the progressed Sun has travelled since birth.',
    matches: ['solar arcs'],
  },
  primaryDirection: {
    name: 'Primary direction',
    definition:
      'A traditional forecast that turns the sky by the Earth’s rotation to bring one point to another, then converts that turning to years of life with a time key.',
    matches: ['primary directions'],
  },
  profection: {
    name: 'Profection',
    definition:
      'A traditional yearly technique: each year of life advances the Ascendant by one sign, and the planet that rules it is the “lord of the year”.',
    matches: ['profections'],
  },
  solarReturn: {
    name: 'Solar and lunar returns',
    definition:
      'The chart for the moment the Sun (or Moon) comes back to its exact birth position, read for the year (or month) ahead.',
    matches: ['solar return', 'lunar return'],
  },
  synastry: {
    name: 'Synastry',
    definition: 'Comparing two birth charts by laying one over the other and reading the aspects between them.',
  },
  composite: {
    name: 'Composite chart',
    definition: 'One chart for a relationship, built from the midpoints between two people’s positions.',
    matches: ['composite charts'],
  },
  draconic: {
    name: 'Draconic chart',
    definition: 'The chart rotated so the Moon’s North Node sits at 0° Aries, read as the soul’s underlying purpose.',
    matches: ['draconic charts'],
  },
  harmonic: {
    name: 'Harmonic chart',
    definition:
      'A chart whose longitudes are multiplied by a whole number and wrapped around the zodiac, bringing out one kind of angular relationship.',
    matches: ['harmonic charts'],
  },
  eclipse: {
    name: 'Eclipse',
    definition:
      'A New or Full Moon on the Moon’s nodes. Eclipses are read as turning points when they touch a birth chart.',
    matches: ['eclipses'],
  },
  rectification: {
    name: 'Rectification',
    definition: 'Working out an uncertain birth time by testing which times best fit the events of a life.',
  },
  horary: {
    name: 'Horary',
    definition: 'Answering a question from the chart of the moment it was asked.',
  },
  electional: {
    name: 'Electional astrology',
    definition: 'Choosing a good moment to begin something by searching for a favourable chart.',
  },
  astrocartography: {
    name: 'Astrocartography',
    definition:
      'A world map of the lines where each body was rising, setting, culminating or at the lowest point at birth, read as how places may feel.',
  },
  localSpace: {
    name: 'Local Space',
    definition: 'Lines radiating from a place in the compass direction of each body at birth.',
  },
  cycle: {
    name: 'Planetary cycle',
    definition:
      'The recurring pattern of a planet returning to or aspecting its own birth position, such as the Saturn return.',
    matches: ['planetary cycles'],
  },
} as const;

interface Entry {
  readonly name: string;
  readonly definition: string;
  /** Lower-case word forms a body-text match looks for in this locale, besides `name`. */
  readonly matches?: readonly string[];
}

/** One locale's catalogue: every term id, each with the shared `Entry` shape (both locales use this type). */
type Catalog = { readonly [K in keyof typeof en]: Entry };

const nl: Catalog = {
  ascendant: {
    name: 'Ascendant',
    definition:
      'Het teken dat op het moment van de geboorte aan de oostelijke horizon opkomt. Het is het begin van het eerste huis en wordt gelezen als hoe iemand de wereld tegemoet treedt.',
  },
  midheaven: {
    name: 'Midheaven',
    definition:
      'Het punt waar de dierenriem de meridiaan boven de horizon snijdt. Het is het begin van het tiende huis en staat voor roeping en publieke positie.',
  },
  houses: {
    name: 'Huizen',
    definition:
      'Twaalf indelingen van de hemel op plaats en tijd van geboorte, elk verbonden met een levensgebied. Verschillende huizensystemen snijden ze anders.',
    matches: ['huis'],
  },
  aspect: {
    name: 'Aspect',
    definition:
      'Een bepaalde hoek tussen twee hemellichamen, zoals een conjunctie, vierkant of driehoek. Aspecten worden gelezen als de wisselwerking tussen die twee.',
    matches: ['aspecten'],
  },
  orb: {
    name: 'Orb',
    definition: 'Hoever een hoek van exact mag afwijken en toch als aspect geldt.',
    matches: ['orbs'],
  },
  applying: {
    name: 'Toenemend / afnemend',
    definition:
      'Een aspect is toenemend zolang de lichamen naar exact toe bewegen en afnemend zodra ze er vanaf bewegen. Toenemende contacten gelden traditioneel als sterker.',
  },
  retrograde: {
    name: 'Retrograde',
    definition:
      'Een hemellichaam dat vanaf de aarde gezien achteruit lijkt te lopen langs de dierenriem. Traditioneel gelezen als naar binnen gekeerd of een thema opnieuw bezoekend.',
  },
  dignity: {
    name: 'Essentiële waardigheid',
    definition:
      'Hoe goed een planeet naar teken staat: het sterkst in het eigen teken (heerschap) en in zijn verheffing, verzwakt in verbanning (detriment) en val.',
    matches: ['waardigheden'],
  },
  dispositor: {
    name: 'Dispositor',
    definition:
      'De planeet die het teken regeert waarin een andere planeet staat. Door dispositors van planeet naar planeet te volgen zie je welke planeet de andere “aanstuurt”.',
    // nl: check — plural of the loanword 'dispositor'.
    matches: ['dispositors'],
  },
  chartRuler: {
    name: 'Horoscoopheerser',
    definition: 'De planeet die het teken van de Ascendant regeert; zij staat voor het hele horoscoopbeeld.',
    // nl: check — plural of the compound 'horoscoopheerser'.
    matches: ['horoscoopheersers'],
  },
  declination: {
    name: 'Declinatie',
    definition:
      'Hoever een hemellichaam ten noorden of zuiden van de hemelevenaar staat. Twee lichamen met dezelfde declinatie staan in parallel, met tegengestelde declinatie in contraparallel.',
    matches: ['declinaties'],
  },
  antiscia: {
    name: 'Antiscia',
    definition:
      'Spiegelpunten over de zonnewendeas: twee plaatsen in de dierenriem die samen opkomen en ondergaan en daarom als stil verbonden gelden.',
  },
  derivedPoint: {
    name: 'Afgeleid punt',
    definition:
      'Een gevoelig punt dat uit andere posities wordt berekend in plaats van een lichaam aan de hemel te zijn, zoals een middelpunt.',
    matches: ['afgeleide punten'],
  },
  // nl: draft from docs/ASTROLOGY_TERMS.md entry 103 ("Whole Sign Houses"); owner to approve before merge (#902).
  wholeSign: {
    name: 'Whole Sign-huizen',
    definition:
      'Een huizensysteem waarin het hele teken dat de Ascendant bevat het 1e huis wordt, en elk volgend teken een compleet huis vormt.',
    matches: ['whole sign'],
  },
  sabianSymbol: {
    name: 'Sabian-symbool',
    definition:
      'Een traditioneel beeld en kwaliteit die bij precies één graad van de dierenriem horen, los van welke planeet of punt daar staat. Astraya toont dit als een optionele, secundaire aantekening naast een plaatsing die op die graad valt.',
  },
  ayanamsa: {
    name: 'Ayanamsa',
    definition:
      'De hoek tussen de tropische dierenriem (vast aan de seizoenen) en de siderische dierenriem (vast aan de sterren). Siderische horoscopen trekken hem af van tropische lengtes.',
  },
  transit: {
    name: 'Transit',
    definition:
      'Waar een planeet op een bepaalde dag aan de hemel staat, vergeleken met de posities in een geboortehoroscoop.',
    // nl: check — plural of the loanword 'transit'.
    matches: ['transits'],
  },
  progression: {
    name: 'Secundaire progressie',
    definition:
      'Een symbolische voorspelling waarin elke dag na de geboorte één levensjaar voorstelt; daarna lees je de horoscoop van die dag.',
    // nl: check — plural of 'secundaire progressie'.
    matches: ['secundaire progressies'],
  },
  solarArc: {
    name: 'Zonneboog',
    definition:
      'Een symbolische voorspelling die elk punt vooruit schuift over de afstand die de geprogresseerde Zon sinds de geboorte heeft afgelegd.',
    matches: ['zonnebogen'],
  },
  primaryDirection: {
    name: 'Primaire directie',
    definition:
      'Een traditionele voorspelling die de hemel met de aardrotatie draait om het ene punt bij het andere te brengen en die draaiing met een tijdsleutel omzet in levensjaren.',
    // nl: check — plural of 'primaire directie'.
    matches: ['primaire directies'],
  },
  profection: {
    name: 'Profectie',
    definition:
      'Een traditionele jaartechniek: elk levensjaar schuift de Ascendant één teken op, en de heerser daarvan is de “heer van het jaar”.',
    matches: ['profecties'],
  },
  solarReturn: {
    name: 'Zonne- en maanterugkeer',
    definition:
      'De horoscoop van het moment waarop de Zon (of Maan) terugkeert op haar exacte geboorteplaats, gelezen voor het komende jaar (of de komende maand).',
    // nl: check — 'zonneterugkeer' and 'maanterugkeer' are the Dutch word forms of the English aliases.
    matches: ['zonneterugkeer', 'maanterugkeer'],
  },
  synastry: {
    name: 'Synastrie',
    definition: 'Twee geboortehoroscopen vergelijken door ze over elkaar te leggen en de aspecten ertussen te lezen.',
  },
  composite: {
    name: 'Composiethoroscoop',
    definition: 'Eén horoscoop voor een relatie, opgebouwd uit de middelpunten tussen de posities van twee mensen.',
    matches: ['composiethoroscopen'],
  },
  draconic: {
    name: 'Draconische horoscoop',
    definition:
      'De horoscoop gedraaid zodat de Noordknoop van de Maan op 0° Ram staat, gelezen als het onderliggende zielsdoel.',
    matches: ['draconische horoscopen'],
  },
  harmonic: {
    name: 'Harmonische horoscoop',
    definition:
      'Een horoscoop waarvan de lengtes met een geheel getal worden vermenigvuldigd en om de dierenriem gewikkeld, waardoor één soort hoekverhouding naar voren komt.',
    matches: ['harmonische horoscopen'],
  },
  eclipse: {
    name: 'Eclips',
    definition:
      'Een Nieuwe of Volle Maan op de knopen van de Maan. Eclipsen gelden als keerpunten wanneer ze een geboortehoroscoop raken.',
    matches: ['eclipsen'],
  },
  rectification: {
    name: 'Rectificatie',
    definition:
      'Een onzekere geboortetijd bepalen door te toetsen welke tijden het best bij de gebeurtenissen van een leven passen.',
  },
  horary: {
    name: 'Horaire astrologie',
    definition: 'Een vraag beantwoorden uit de horoscoop van het moment waarop ze werd gesteld.',
  },
  electional: {
    name: 'Electieve astrologie',
    definition: 'Een gunstig moment kiezen om iets te beginnen door een gunstige horoscoop te zoeken.',
  },
  astrocartography: {
    name: 'Astrocartografie',
    definition:
      'Een wereldkaart met de lijnen waar elk hemellichaam bij de geboorte opkwam, onderging, culmineerde of op het laagste punt stond, gelezen als hoe plaatsen kunnen aanvoelen.',
  },
  localSpace: {
    name: 'Local Space',
    definition: 'Lijnen die vanaf een plaats uitwaaieren in de kompasrichting van elk hemellichaam bij de geboorte.',
  },
  cycle: {
    name: 'Planetaire cyclus',
    definition:
      'Het terugkerende patroon waarin een planeet terugkeert naar of aspecteert met zijn eigen geboorteplaats, zoals de Saturnusterugkeer.',
    // nl: check — plural of 'planetaire cyclus'.
    matches: ['planetaire cycli'],
  },
};

export type GlossaryTermId = keyof typeof en;
export const GLOSSARY_TERM_IDS = Object.keys(en) as readonly GlossaryTermId[];
export const astroGlossaryMessages: { readonly en: Catalog; readonly nl: Catalog } = { en, nl };
