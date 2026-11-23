/**
 * The hyleg and alcocoden decision table (#1799), one test per row, on synthetic inputs. Bonatti, Liber astronomiae, Tr. 9,
 * part 2, chs. 1-2, with the owner's answers of 2026-11-22: the Moon needs a feminine sign, a night chart starts from the
 * Moon, whole-sign aspects with no orb, whole-sign houses.
 *
 * Every chart has the Ascendant at 10 Aries, so a sign is its own house: Aries 1st, Taurus 2nd, Gemini 3rd, Cancer 4th,
 * Leo 5th, Virgo 6th, Libra 7th, Scorpio 8th, Sagittarius 9th, Capricorn 10th, Aquarius 11th, Pisces 12th. Longitudes
 * are written as sign start + degree. Lords are the traditional domicile, exaltation, Egyptian bound and sect triplicity.
 */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { pickAlcocoden, findHyleg, type AlcocodenCandidate, type HylegInput } from '../src/domain/hyleg.js';
import type { PrenatalSyzygy } from '../src/domain/prenatal-syzygy.js';
import type { BodyId } from '../src/ephemeris/types.js';

const ARIES = 0;
const TAURUS = 30;
const GEMINI = 60;
const CANCER = 90;
const LEO = 120;
const VIRGO = 150;
const LIBRA = 180;
const SCORPIO = 210;
const CAPRICORN = 270;
const PISCES = 330;

const ASC = ARIES + 10;

function id(key: string): BodyId {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`no body ${key}`);
  return body.id;
}

const KEYS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const;
type Key = (typeof KEYS)[number];

function syzygy(kind: 'conjunction' | 'prevention', degree: number | undefined): PrenatalSyzygy {
  return { kind, jd: 2_440_000, sunLongitude: 0, moonLongitude: 0, degree };
}

/** A chart with every planet at `rest` unless given. The Part of Fortune is in the cadent 3rd unless given. */
function chart(
  sect: 'day' | 'night',
  placed: Partial<Record<Key, number>>,
  rest: number,
  extra: Partial<HylegInput> = {},
): HylegInput {
  return {
    sect,
    positions: KEYS.map((key) => ({ body: id(key), longitude: placed[key] ?? rest })),
    ascendant: ASC,
    partOfFortune: GEMINI + 15,
    syzygy: undefined,
    ...extra,
  };
}

describe('the Sun, in a day chart (ch. 1)', () => {
  it('row 1: the Sun in the 10th in a feminine sign, aspected by a lord of its degree, is the hyleg', () => {
    // Capricorn 5: Saturn (domicile) in Aries squares it; Mars (exaltation), Mercury (bound), Venus (triplicity) sit in Gemini, which does not aspect Capricorn.
    const result = findHyleg(chart('day', { sun: CAPRICORN + 5, saturn: ARIES + 10 }, GEMINI + 15));
    expect(result.hyleg).toEqual({ point: 'sun', longitude: CAPRICORN + 5, rule: 'sun-houses-1-10-11' });
    expect(result.alcocoden).toEqual({ planet: id('saturn'), rule: 'only-aspecting' });
  });

  it('row 2: the Sun in the 7th in a masculine sign is the hyleg', () => {
    // Libra 10 (masculine, 7th): Saturn (exaltation and day triplicity) in Aries opposes it. The rest sit in Scorpio, which does not aspect Libra.
    const result = findHyleg(chart('day', { sun: LIBRA + 10, saturn: ARIES + 10 }, SCORPIO + 15));
    expect(result.hyleg).toEqual({ point: 'sun', longitude: LIBRA + 10, rule: 'sun-houses-7-8-9-masculine' });
  });

  it('row 3: the Sun in the 8th in a feminine sign is not fit, so the Moon is taken', () => {
    // Sun Scorpio 5 (8th, feminine). Moon Taurus 15 (2nd, feminine): Venus (domicile and triplicity) in Cancer sextiles it.
    const result = findHyleg(chart('day', { sun: SCORPIO + 5, moon: TAURUS + 15, venus: CANCER + 10 }, GEMINI + 15));
    expect(result.hyleg).toEqual({ point: 'moon', longitude: TAURUS + 15, rule: 'moon-angular-succeedent-feminine' });
  });

  it('row 4: a Sun in a fit house with no lord of its degree aspecting it is skipped, and the Moon is taken', () => {
    // Sun Capricorn 5 (10th): Saturn, Mars, Mercury and Venus all in Gemini, which does not aspect Capricorn. Moon Taurus 15: Jupiter (bound) in Pisces sextiles it, and sextiles the Sun's sign too, but is no lord of the Sun's degree.
    const result = findHyleg(
      chart('day', { sun: CAPRICORN + 5, moon: TAURUS + 15, jupiter: PISCES + 15 }, GEMINI + 15),
    );
    expect(result.hyleg?.point).toBe('moon');
    expect(result.alcocoden).toEqual({ planet: id('jupiter'), rule: 'only-aspecting' });
  });
});

describe('the Moon (ch. 1, owner answers 1 and 2)', () => {
  it('row 5: the Moon in an angle or a succeedent in a masculine sign is not the hyleg (owner answer 1: ch. 1, not ch. 2)', () => {
    // Day chart, Sun in the 6th (not fit). Moon Libra 10 (7th, masculine): Saturn in Aries opposes it. No syzygy to fall back on.
    const result = findHyleg(chart('day', { sun: VIRGO + 5, moon: LIBRA + 10, saturn: ARIES + 10 }, SCORPIO + 15));
    expect(result).toEqual({ hyleg: undefined, alcocoden: undefined });
  });

  it('row 6: the Moon in a cadent house is not the hyleg even in a feminine sign', () => {
    // Day chart, Sun in the 6th (not fit). Moon Pisces 15 (12th, cadent, feminine); Jupiter, her domicile lord, is in her own sign.
    const result = findHyleg(chart('day', { sun: VIRGO + 5, moon: PISCES + 15, jupiter: PISCES + 20 }, VIRGO + 5));
    expect(result).toEqual({ hyleg: undefined, alcocoden: undefined });
  });

  it('row 7: in a night chart the search starts from the Moon, where a day chart takes the Sun', () => {
    // Moon Taurus 15 (2nd, feminine) and Sun Capricorn 5 (10th) are both fit and aspected. Venus in Cancer sextiles the Moon; Saturn in Aries squares the Sun.
    const placed = { sun: CAPRICORN + 5, moon: TAURUS + 15, venus: CANCER + 10, saturn: ARIES + 10 };
    expect(findHyleg(chart('night', placed, GEMINI + 15)).hyleg?.point).toBe('moon');
    expect(findHyleg(chart('day', placed, GEMINI + 15)).hyleg?.point).toBe('sun');
  });

  it('row 8: in a night chart the Sun is next when the Moon is not fit', () => {
    const result = findHyleg(
      chart('night', { sun: CAPRICORN + 5, moon: GEMINI + 15, saturn: ARIES + 10 }, GEMINI + 15),
    );
    expect(result.hyleg).toEqual({ point: 'sun', longitude: CAPRICORN + 5, rule: 'sun-houses-1-10-11' });
  });
});

describe('the syzygy branch (ch. 1 and ch. 2)', () => {
  // Day chart, Sun in the 6th and Moon in the 3rd: neither is fit. Fortune in the 10th (Capricorn 5), the Ascendant at 10 Aries.
  // Mars (domicile of the Ascendant, exaltation of Capricorn) in Libra opposes the Ascendant and squares Capricorn.
  const fallback = {
    sun: VIRGO + 5,
    moon: GEMINI + 15,
    mars: LIBRA + 10,
    jupiter: GEMINI + 15,
  };
  const base = chart('day', fallback, GEMINI + 15, { partOfFortune: CAPRICORN + 5 });

  it('row 9: a preventional nativity takes the Part of Fortune before the Ascendant', () => {
    const result = findHyleg({ ...base, syzygy: syzygy('prevention', 100) });
    expect(result.hyleg).toEqual({ point: 'fortune', longitude: CAPRICORN + 5, rule: 'fortune-angular-succeedent' });
    expect(result.alcocoden).toEqual({ planet: id('mars'), rule: 'only-aspecting' });
  });

  it('row 10: a conjunctional nativity takes the Ascendant before the Part of Fortune', () => {
    const result = findHyleg({ ...base, syzygy: syzygy('conjunction', 100) });
    expect(result.hyleg).toEqual({ point: 'ascendant', longitude: ASC, rule: 'ascendant' });
    // Mars (domicile) opposes exactly; Venus (bound, 6-12 of Aries) in Gemini 15 is 5 degrees from the exact sextile. Each holds one dignity, so closeness decides.
    expect(result.alcocoden).toEqual({ planet: id('mars'), rule: 'closest-aspect' });
  });

  it('row 11: the Part of Fortune in a cadent house is skipped, and the Ascendant is taken in a prevention', () => {
    const result = findHyleg({ ...base, partOfFortune: GEMINI + 15, syzygy: syzygy('prevention', 100) });
    expect(result.hyleg?.point).toBe('ascendant');
  });

  it('row 12: an unaspected Ascendant and Fortune fall to the degree of the syzygy', () => {
    // Mars, Jupiter in Taurus and Sun in Virgo do not aspect Aries; the Part of Fortune is cadent. Leo 15: Saturn (bound) in Aries trines it.
    const result = findHyleg(
      chart(
        'day',
        { sun: VIRGO + 5, moon: GEMINI + 15, mars: TAURUS + 15, jupiter: TAURUS + 15, saturn: ARIES + 10 },
        TAURUS + 15,
        {
          syzygy: syzygy('conjunction', LEO + 15),
        },
      ),
    );
    expect(result.hyleg).toEqual({ point: 'syzygy', longitude: LEO + 15, rule: 'syzygy-degree' });
    expect(result.alcocoden).toEqual({ planet: id('saturn'), rule: 'only-aspecting' });
  });

  it('row 12b: a syzygy degree in a cadent house is skipped, in any sign (ch. 2)', () => {
    // Gemini 15 is the 3rd house. Mercury, its domicile lord, in Aries sextiles it, so only the cadent house excludes it.
    const result = findHyleg(
      chart(
        'day',
        { sun: VIRGO + 5, moon: GEMINI + 15, mars: TAURUS + 15, jupiter: TAURUS + 15, mercury: ARIES + 10 },
        TAURUS + 15,
        { syzygy: syzygy('conjunction', GEMINI + 15) },
      ),
    );
    expect(result).toEqual({ hyleg: undefined, alcocoden: undefined });
  });

  it('row 13: nothing fits, so there is no hyleg ("the hilaj will be made useless")', () => {
    const result = findHyleg(
      chart(
        'day',
        { sun: VIRGO + 5, moon: GEMINI + 15, mars: TAURUS + 15, jupiter: TAURUS + 15, saturn: VIRGO + 15 },
        TAURUS + 15,
        {
          syzygy: syzygy('conjunction', LEO + 15),
        },
      ),
    );
    expect(result).toEqual({ hyleg: undefined, alcocoden: undefined });
  });

  it('row 14: without a syzygy the Fortune, Ascendant and degree steps are skipped, though both would fit', () => {
    expect(findHyleg(base).hyleg).toBeUndefined();
  });

  it('row 15: a syzygy with no degree skips only the degree step', () => {
    // The lords of 10 Aries are Mars (domicile), the Sun (exaltation and day triplicity) and Venus (bound); none aspects Aries here.
    const noMars = chart('day', { sun: VIRGO + 5, moon: GEMINI + 15 }, TAURUS + 15, {
      partOfFortune: GEMINI + 15,
      syzygy: syzygy('conjunction', undefined),
    });
    expect(findHyleg(noMars).hyleg).toBeUndefined();
  });
});

describe('whole-sign aspects have no orb (owner answer 3)', () => {
  it('a lord in the same sign aspects, however many degrees away', () => {
    // Sun Capricorn 5; Saturn at Capricorn 29 is in the same sign, 24 degrees away.
    const result = findHyleg(chart('day', { sun: CAPRICORN + 5, saturn: CAPRICORN + 29 }, GEMINI + 15));
    expect(result.hyleg?.point).toBe('sun');
  });

  it('a lord one degree short of a whole-sign sextile, in the next sign, does not aspect', () => {
    // Sun Capricorn 29; Saturn at Aquarius 1 is 2 degrees ahead, but Aquarius is the next sign: no aspect by sign.
    const result = findHyleg(chart('day', { sun: CAPRICORN + 29, saturn: CAPRICORN + 32 }, GEMINI + 15));
    expect(result.hyleg).toBeUndefined();
  });
});

describe('the alcocoden tie-breaks (ch. 1, ch. 2), on hand-made rows', () => {
  const row = (body: string, over: Partial<AlcocodenCandidate> = {}): AlcocodenCandidate => ({
    body: id(body),
    deviation: 0,
    dignities: 1,
    angularOrSucceedent: true,
    cuspDistance: 10,
    ownDignities: 1,
    oriental: true,
    combust: false,
    sunSeparation: 40,
    order: 0,
    ...over,
  });

  it('no candidates: no alcocoden', () => {
    expect(pickAlcocoden([])).toBeUndefined();
  });

  it('one aspecting lord: that lord, with the only-aspecting rule', () => {
    expect(pickAlcocoden([row('mars')])).toEqual({ planet: id('mars'), rule: 'only-aspecting' });
  });

  it('equal dignities: closer to an exact aspect wins', () => {
    expect(pickAlcocoden([row('mars', { deviation: 4 }), row('venus', { deviation: 1 })])).toEqual({
      planet: id('venus'),
      rule: 'closest-aspect',
    });
  });

  it('more dignities in the hyleg degree wins first, as ch. 1 orders', () => {
    expect(pickAlcocoden([row('mars'), row('venus', { dignities: 2 })])).toEqual({
      planet: id('venus'),
      rule: 'more-dignities',
    });
  });

  it('a lord farther away with more dignities beats a closer lord with fewer (ch. 1)', () => {
    expect(pickAlcocoden([row('mars', { deviation: 1 }), row('venus', { deviation: 9, dignities: 2 })])).toEqual({
      planet: id('venus'),
      rule: 'more-dignities',
    });
  });

  it('equal so far: in an angle or a succeedent wins over cadent', () => {
    expect(pickAlcocoden([row('mars', { angularOrSucceedent: false }), row('venus')])).toEqual({
      planet: id('venus'),
      rule: 'angular-or-succeedent',
    });
  });

  it('equal so far: closer to the cusp wins', () => {
    expect(pickAlcocoden([row('mars', { cuspDistance: 20 }), row('venus', { cuspDistance: 3 })])).toEqual({
      planet: id('venus'),
      rule: 'closer-to-cusp',
    });
  });

  it('equal so far: in a dignity of its own wins over peregrine', () => {
    expect(pickAlcocoden([row('mars', { ownDignities: 0 }), row('venus')])).toEqual({
      planet: id('venus'),
      rule: 'own-dignity',
    });
  });

  it('equal so far: oriental wins', () => {
    expect(pickAlcocoden([row('mars', { oriental: false }), row('venus')])).toEqual({
      planet: id('venus'),
      rule: 'oriental',
    });
  });

  it('equal so far: closer to the Sun wins, but not when combust', () => {
    expect(pickAlcocoden([row('mars', { sunSeparation: 20 }), row('venus', { sunSeparation: 9 })])).toEqual({
      planet: id('venus'),
      rule: 'closer-to-sun',
    });
    expect(
      pickAlcocoden([row('mars', { sunSeparation: 20 }), row('venus', { sunSeparation: 3, combust: true })]),
    ).toEqual({ planet: id('mars'), rule: 'closer-to-sun' });
  });

  it('equal in everything: the first lord in ch. 2 order (bound, domicile, exaltation, triplicity)', () => {
    expect(pickAlcocoden([row('mars', { order: 1 }), row('venus', { order: 0 })])).toEqual({
      planet: id('venus'),
      rule: 'lord-order',
    });
  });
});
