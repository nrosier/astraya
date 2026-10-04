/**
 * The two non-drawn ways to write a symbol (#419): its Unicode astrological character, and a
 * three-letter text code. Every body, sign and aspect the glyph registry draws has both, and
 * `test/chart-symbol-classes.test.ts` fails if one is added to the registry without them.
 *
 * The codes are the English abbreviations an ephemeris prints (SUN, MOO, MER …); they are the same
 * in every interface language, which keeps a wheel readable as a picture and a screen reader's
 * accessible names (which come from the translated tables, not from these) untouched.
 *
 * Signs append U+FE0E, the text-presentation selector: without it Apple and some Android systems
 * draw ♈ as a colour emoji, which is the unpredictability this setting exists to let a reader avoid
 * when they pick the Unicode class.
 */
export type SymbolKind = 'body' | 'sign' | 'aspect';

const TEXT_PRESENTATION = '︎';

export const BODY_UNICODE: Readonly<Record<string, string>> = {
  sun: '☉',
  moon: '☽',
  mercury: '☿',
  venus: '♀',
  mars: '♂',
  jupiter: '♃',
  saturn: '♄',
  uranus: '♅',
  neptune: '♆',
  pluto: '♇',
  meanNode: '☊',
  trueNode: '☊',
  southNode: '☋',
  meanLilith: '⚸',
  osculatingLilith: '⚸',
  interpolatedLilith: '⚸',
  chiron: '⚷',
  ceres: '⚳',
  pallas: '⚴',
  juno: '⚵',
  vesta: '⚶',
};

export const SIGN_UNICODE: Readonly<Record<string, string>> = {
  Aries: '♈',
  Taurus: '♉',
  Gemini: '♊',
  Cancer: '♋',
  Leo: '♌',
  Virgo: '♍',
  Libra: '♎',
  Scorpio: '♏',
  Sagittarius: '♐',
  Capricorn: '♑',
  Aquarius: '♒',
  Pisces: '♓',
};

/** There is no standard character for the quintile series, so those two are the letters astrologers write. */
export const ASPECT_UNICODE: Readonly<Record<string, string>> = {
  conjunction: '☌',
  semisextile: '⚺',
  semisquare: '∠',
  sextile: '⚹',
  quintile: 'Q',
  square: '□',
  trine: '△',
  sesquiquadrate: '⚼',
  biquintile: 'bQ',
  quincunx: '⚻',
  opposition: '☍',
};

export const BODY_CODES: Readonly<Record<string, string>> = {
  sun: 'SUN',
  moon: 'MOO',
  mercury: 'MER',
  venus: 'VEN',
  mars: 'MAR',
  jupiter: 'JUP',
  saturn: 'SAT',
  uranus: 'URA',
  neptune: 'NEP',
  pluto: 'PLU',
  meanNode: 'MNO',
  trueNode: 'TNO',
  southNode: 'SNO',
  meanLilith: 'MLI',
  osculatingLilith: 'OLI',
  interpolatedLilith: 'ILI',
  chiron: 'CHI',
  ceres: 'CER',
  pallas: 'PAL',
  juno: 'JUN',
  vesta: 'VES',
};

export const SIGN_CODES: Readonly<Record<string, string>> = {
  Aries: 'ARI',
  Taurus: 'TAU',
  Gemini: 'GEM',
  Cancer: 'CAN',
  Leo: 'LEO',
  Virgo: 'VIR',
  Libra: 'LIB',
  Scorpio: 'SCO',
  Sagittarius: 'SAG',
  Capricorn: 'CAP',
  Aquarius: 'AQU',
  Pisces: 'PIS',
};

export const ASPECT_CODES: Readonly<Record<string, string>> = {
  conjunction: 'CNJ',
  semisextile: 'SSX',
  semisquare: 'SSQ',
  sextile: 'SXT',
  quintile: 'QNT',
  square: 'SQR',
  trine: 'TRI',
  sesquiquadrate: 'SQQ',
  biquintile: 'BQN',
  quincunx: 'QNX',
  opposition: 'OPP',
};

/** The Unicode character for a symbol, or `undefined` for one this module does not know. */
export function unicodeSymbol(kind: SymbolKind, key: string): string | undefined {
  if (kind === 'body') return BODY_UNICODE[key];
  if (kind === 'sign') {
    const sign = SIGN_UNICODE[key];
    return sign === undefined ? undefined : sign + TEXT_PRESENTATION;
  }
  return ASPECT_UNICODE[key];
}

/** The three-letter code for a symbol, or `undefined` for one this module does not know. */
export function textSymbol(kind: SymbolKind, key: string): string | undefined {
  if (kind === 'body') return BODY_CODES[key];
  if (kind === 'sign') return SIGN_CODES[key];
  return ASPECT_CODES[key];
}
