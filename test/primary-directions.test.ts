/**
 * Verification gate for primary directions (#407). The issue makes this non-waivable: the arc of
 * direction to the Ascendant and to the Midheaven must reproduce published worked examples to
 * within one arcminute, or the technique does not ship.
 *
 * Gansten's own book (*Primary Directions: Astrology's Old Master Technique*, Wessex, 2009) was
 * not available to check against — only its first chapter, which the author publishes online and
 * which works its two example charts in whole degrees with the birth data withheld. The gate uses
 * two other published worked examples instead, each read from the document itself:
 *
 * 1. **Henry II of France**, from John Gadbury, *A Collection of Nativities* (1661), pp. 23–24, as
 *    reproduced and recomputed step by step in Deborah Houlding, "An Easy Introduction to Primary
 *    Directions" (Skyscript, 2005, updated 2009; www.skyscript.co.uk/directions.html), pp. 2 and
 *    8–14. Gadbury: "The Oblique Ascension of Mars 76.16 / The Oblique Ascension of the Ascendant
 *    35.58 / The Arc of Direction 40.18 [deg. mins] / Time of Direction according to Naibod's
 *    Instruction: 40. 324. 7 [years. days. hours]". Inputs per Houlding: Ascendant 3° Gemini, Mars
 *    13°03′ Cancer, latitude 48°N, obliquity 23°30′. Mars is taken by "the declination of the
 *    degree" — its zodiacal place at latitude 0, this module's own convention.
 * 2. **Prince Charles**, from Bob Makransky, *Primary Directions: A Primer of Calculation* (1988;
 *    scan at archive.org, item bob-makransky-primary-directions-a-primer-of-calculations-i):
 *    14 November 1948, 21h14m39s GMT, London, φ = 51°30′N, ε = 23.4459, RAMC = 12.37, all in
 *    decimal degrees. Ch. II "Zodiacal directions to the MC and IC" and "... to the Ascendant and
 *    Descendant"; ch. III (Naibod); ch. VII "The correct Placidus method". Longitudes are the
 *    ch. VII Placidus speculum's. (The ch. I speculum prints Pluto as 135.56, a misprint for the
 *    136.56 of ch. VII: it contradicts its own "16 LE 34", and only 136.56 gives the RA 139.02 and
 *    declination 15.88 the book works with.)
 *
 * The gate feeds each example's own published inputs to the engine rather than a fresh Swiss
 * Ephemeris chart. For Prince Charles the book's RAMC is 12.37°; Swiss Ephemeris's ARMC for the
 * same instant and place is 12.40° (the book's sidereal time is about 8 s of time earlier) — a 2′
 * difference that would swamp a 1′ tolerance and test a 1988 sidereal-time calculation rather
 * than the direction math. The Swiss Ephemeris tests further down then hold the same math to the
 * real ephemeris (via `engine-harness.ts`, no mocks): its Placidus cusps must be this engine's
 * mundane positions 0°, 30° … 330° to the arcsecond, and the published arcs must come back once
 * each source's own RAMC is accounted for.
 */
import { describe, expect, it } from 'vitest';
import {
  ANGLE_MUNDANE_POSITIONS,
  DIRECTION_ASPECT_OFFSETS,
  TIME_KEY_DEGREES_PER_YEAR,
  ascendantLongitude,
  calculatePrimaryDirections,
  directArc,
  directedLongitude,
  eclipticPointAtMundanePosition,
  eclipticToEquatorial,
  hourAngleAtMundanePosition,
  isDefinedAtLatitude,
  midheavenLongitude,
  placidianMundanePosition,
  semiArcs,
  significatorMundanePosition,
  type SphereFrame,
} from '../src/astrology/primary-directions.js';
import { TROPICAL_YEAR_DAYS } from '../src/astrology/progressions.js';
import {
  DEFAULT_MAX_AGE_YEARS,
  PrimaryDirectionKey,
  activeDirections,
  ageToArc,
  arcToAge,
  directedChartAt,
  generatePrimaryDirections,
  isDirectionActive,
} from '../src/domain/primary-directions.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { arcsecondsBetween, getEngine } from './engine-harness.js';

/** One arcminute, the gate's tolerance, in degrees. */
const ARCMINUTE = 1 / 60;

/** Degrees and minutes to decimal degrees. */
function dm(degrees: number, minutes: number): number {
  return degrees + minutes / 60;
}

function arcminutesBetween(a: number, b: number): number {
  return arcsecondsBetween(a, b) / 60;
}

describe('verification gate: Henry II of France (Gadbury 1661, via Houlding 2009)', () => {
  const obliquity = dm(23, 30);
  const geoLatitude = 48;
  const ascendant = 63; // 3° Gemini
  const mars = dm(103, 3); // 13°03′ Cancer

  /** Oblique ascension, OA = RA − AD with AD = DSA − 90°, of an ecliptic degree at 48°N. */
  function obliqueAscension(longitude: number): number {
    const point = eclipticToEquatorial(longitude, 0, obliquity);
    return point.rightAscension - (semiArcs(point.declination, geoLatitude).diurnal - 90);
  }

  it('reproduces the oblique ascensions of the Ascendant (35°58′) and of Mars (76°16′) to the arcminute', () => {
    expect(arcminutesBetween(obliqueAscension(ascendant), dm(35, 58))).toBeLessThan(1);
    expect(arcminutesBetween(obliqueAscension(mars), dm(76, 16))).toBeLessThan(1);
  });

  it('directs Mars to the Ascendant by an arc of 40°18′, to the arcminute', () => {
    // The Ascendant's own oblique ascension is RAMC + 90°, which fixes the RAMC of a chart with
    // 3° Gemini rising at 48°N.
    const frame: SphereFrame = { ramc: obliqueAscension(ascendant) - 90, obliquity, geoLatitude };
    expect(arcminutesBetween(ascendantLongitude(frame), ascendant)).toBeLessThan(0.01);

    const result = calculatePrimaryDirections(
      { key: 'asc', longitude: ascendant, angle: 'asc' },
      { key: 'mars', longitude: mars },
      frame,
    );
    expect(arcminutesBetween(result.arcRA, dm(40, 18))).toBeLessThan(1);
  });

  it('converts Gadbury’s 40°18′ by Naibod’s key to his 40 years 324 days', () => {
    const age = arcToAge(dm(40, 18), PrimaryDirectionKey.NAIBOD);
    expect(Math.floor(age)).toBe(40);
    // Gadbury: 324 days 7 hours, read from Naibod's printed table.
    expect(Math.abs((age - 40) * TROPICAL_YEAR_DAYS - (324 + 7 / 24))).toBeLessThan(1);
  });
});

describe('verification gate: Prince Charles (Makransky 1988)', () => {
  const frame: SphereFrame = { ramc: 12.37, obliquity: 23.4459, geoLatitude: 51.5 };
  const longitudes = { sun: 232.42, moon: 30.44, jupiter: 269.89, pluto: 136.56 };

  it('MO CONJ MC zod d: arc 15.95, to the arcminute (MC: arc = RA − RAMC)', () => {
    const result = calculatePrimaryDirections(
      { key: 'mc', longitude: 13.44, angle: 'mc' },
      { key: 'moon', longitude: longitudes.moon },
      frame,
    );
    expect(arcminutesBetween(result.arcRA, 15.95)).toBeLessThan(1);
    // The book's own intermediate: the RA of 0 TA 26 is 28.32.
    expect(
      arcminutesBetween(eclipticToEquatorial(longitudes.moon, 0, frame.obliquity).rightAscension, 28.32),
    ).toBeLessThan(1);
  });

  it('PL CONJ ASC zod d: arc 15.70, to the arcminute (ASC: arc = OA − OA of the Ascendant)', () => {
    const result = calculatePrimaryDirections(
      { key: 'asc', longitude: 125.5, angle: 'asc' },
      { key: 'pluto', longitude: longitudes.pluto },
      frame,
    );
    expect(arcminutesBetween(result.arcRA, 15.7)).toBeLessThan(1);
  });

  it('SU CONJ IC zod d: arc 37.64, to the arcminute', () => {
    const result = calculatePrimaryDirections(
      { key: 'ic', longitude: 193.44, angle: 'ic' },
      { key: 'sun', longitude: longitudes.sun },
      frame,
    );
    expect(arcminutesBetween(result.arcRA, 37.64)).toBeLessThan(1);
  });

  it('JU CONJ DESC zod c (−45.54) is the same rotation this engine measures forward, 360° − 45.54°', () => {
    const result = calculatePrimaryDirections(
      { key: 'dsc', longitude: 305.5, angle: 'dsc' },
      { key: 'jupiter', longitude: longitudes.jupiter },
      frame,
    );
    expect(arcminutesBetween(result.arcRA, 360 - 45.54)).toBeLessThan(1);
  });

  it('SU CONJ ME Plac mund d: 12.85 to a significator off the angles, by proportional semi-arc', () => {
    // Mercury: 2nd quadrant, MD / SA = .21612 (ch. VII speculum) — mundane position 90 + 90 × .21612.
    // The Sun has no latitude, so its mundane and zodiacal places coincide.
    const sun = eclipticToEquatorial(longitudes.sun, 0, frame.obliquity);
    expect(arcminutesBetween(directArc(sun, 90 + 90 * 0.21612, frame), 12.85)).toBeLessThan(1);
  });

  it('reproduces the book’s RA 152.50, declination 11.32 and AD 14.58 for the Moon’s trine point', () => {
    const point = eclipticToEquatorial(longitudes.moon + 120, 0, frame.obliquity);
    expect(arcminutesBetween(point.rightAscension, 152.5)).toBeLessThan(1);
    expect(Math.abs(point.declination - 11.32)).toBeLessThan(ARCMINUTE);
    expect(Math.abs(semiArcs(point.declination, frame.geoLatitude).diurnal - 90 - 14.58)).toBeLessThan(ARCMINUTE);
  });
});

describe('time keys', () => {
  it('Naibod is 0°59′08.33″ a year and Ptolemy 1°', () => {
    expect(Math.abs(TIME_KEY_DEGREES_PER_YEAR.naibod - (59 + 8.33 / 60) / 60) * 3600).toBeLessThan(0.01);
    expect(TIME_KEY_DEGREES_PER_YEAR.ptolemy).toBe(1);
  });

  it('gives different ages for the same arc, matching Makransky’s 16.10° = 16.335 years by Naibod', () => {
    const naibod = arcToAge(16.1, PrimaryDirectionKey.NAIBOD);
    const ptolemy = arcToAge(16.1, PrimaryDirectionKey.PTOLEMY);
    expect(ptolemy).toBe(16.1);
    expect(naibod).toBeGreaterThan(ptolemy);
    expect(Math.abs(naibod - 16.335)).toBeLessThan(0.002);
    expect(ageToArc(naibod, PrimaryDirectionKey.NAIBOD)).toBeCloseTo(16.1, 12);
  });

  it('carries the key through calculatePrimaryDirections: same arc, different age', () => {
    const frame: SphereFrame = { ramc: 12.37, obliquity: 23.4459, geoLatitude: 51.5 };
    const significator = { key: 'mc', longitude: 13.44, angle: 'mc' } as const;
    const promissor = { key: 'moon', longitude: 30.44 };
    const naibod = calculatePrimaryDirections(significator, promissor, frame, { key: 'naibod' });
    const ptolemy = calculatePrimaryDirections(significator, promissor, frame, { key: 'ptolemy' });
    expect(naibod.arcRA).toBe(ptolemy.arcRA);
    expect(ptolemy.ageYears).toBe(ptolemy.arcRA);
    expect(naibod.ageYears).toBeCloseTo(naibod.arcRA / TIME_KEY_DEGREES_PER_YEAR.naibod, 12);
  });
});

describe('Placidian mundane position', () => {
  const frame: SphereFrame = { ramc: 12.37, obliquity: 23.4459, geoLatitude: 51.5 };

  it('puts the angles at 0 / 90 / 180 / 270', () => {
    const mc = midheavenLongitude(frame.ramc, frame.obliquity);
    const asc = ascendantLongitude(frame);
    const at = (longitude: number): number =>
      placidianMundanePosition(eclipticToEquatorial(longitude, 0, frame.obliquity), frame);
    expect(arcsecondsBetween(at(mc), ANGLE_MUNDANE_POSITIONS.mc)).toBeLessThan(0.01);
    expect(arcsecondsBetween(at(mc + 180), ANGLE_MUNDANE_POSITIONS.ic)).toBeLessThan(0.01);
    expect(arcsecondsBetween(at(asc), ANGLE_MUNDANE_POSITIONS.asc)).toBeLessThan(0.01);
    expect(arcsecondsBetween(at(asc + 180), ANGLE_MUNDANE_POSITIONS.dsc)).toBeLessThan(0.01);
  });

  it('inverts exactly: the hour angle for a point’s own mundane position is its hour angle', () => {
    for (let ra = 0; ra < 360; ra += 17) {
      for (const declination of [-23, -10, 0, 12, 23]) {
        const position = placidianMundanePosition({ rightAscension: ra, declination }, frame);
        const hour = hourAngleAtMundanePosition(position, semiArcs(declination, frame.geoLatitude));
        expect(arcsecondsBetween(hour, frame.ramc - ra)).toBeLessThan(1e-6);
      }
    }
  });

  it('is the brief’s RA difference for the MC and the oblique-ascension difference for the Ascendant', () => {
    for (let longitude = 0; longitude < 360; longitude += 23) {
      const point = eclipticToEquatorial(longitude, 0, frame.obliquity);
      const toMc = directArc(point, ANGLE_MUNDANE_POSITIONS.mc, frame);
      expect(arcsecondsBetween(toMc, point.rightAscension - frame.ramc)).toBeLessThan(1e-6);

      const ad = semiArcs(point.declination, frame.geoLatitude).diurnal - 90;
      const toAsc = directArc(point, ANGLE_MUNDANE_POSITIONS.asc, frame);
      expect(arcsecondsBetween(toAsc, point.rightAscension - ad - (frame.ramc + 90))).toBeLessThan(1e-6);
    }
  });

  it('brings every directed significator exactly onto the promissor point at the hit’s arc', () => {
    const significators = [
      { key: 'asc', longitude: 125.5, angle: 'asc' as const },
      { key: 'mc', longitude: 13.44, angle: 'mc' as const },
      { key: 'sun', longitude: 232.42 },
      { key: 'moon', longitude: 30.44 },
    ];
    for (const significator of significators) {
      const position = significatorMundanePosition(significator, frame);
      for (const promissor of [155.27, 260.95, 89.93]) {
        const { directions } = calculatePrimaryDirections(significator, { key: 'p', longitude: promissor }, frame);
        for (const hit of directions) {
          expect(arcsecondsBetween(directedLongitude(position, hit.arcRA, frame), hit.promissorPoint)).toBeLessThan(
            0.01,
          );
        }
      }
    }
  });

  it('directs the five Ptolemaic aspects, both sides of the three that have two', () => {
    expect(DIRECTION_ASPECT_OFFSETS.map((entry) => entry.offset).sort((a, b) => a - b)).toEqual([
      -120, -90, -60, 0, 60, 90, 120, 180,
    ]);
  });

  it('refuses circumpolar points instead of inventing an arc', () => {
    expect(isDefinedAtLatitude(66, 23.44)).toBe(true);
    expect(isDefinedAtLatitude(-66, 23.44)).toBe(true);
    expect(isDefinedAtLatitude(66.6, 23.44)).toBe(false);
    expect(isDefinedAtLatitude(-70, 23.44)).toBe(false);
    expect(() => semiArcs(23, 70)).toThrow(RangeError);
  });
});

const PRINCE_CHARLES: BirthMomentInput = {
  civil: { year: 1948, month: 11, day: 14, hour: 21, minute: 14, second: 39 },
  coordinates: { latitude: 51.5, longitude: -(8 / 60) },
  offsetOverrideMinutes: 0,
};

describe('against the real Swiss Ephemeris', () => {
  it('its Placidus cusps are this engine’s mundane positions 0°, 30° … 330°, to the arcsecond', async () => {
    const engine = await getEngine();
    const jd = await engine.julianDayFromUtc(1948, 11, 14, 21, 14, 39);
    const obliquity = await engine.obliquity(jd);
    for (const latitude of [51.5, -40, 0, 60]) {
      const houses = await engine.houses(jd, { latitude, longitude: -(8 / 60), altitude: 0 }, 'P');
      const frame: SphereFrame = { ramc: houses.armc, obliquity, geoLatitude: latitude };
      for (let house = 1; house <= 12; house++) {
        const cusp = houses.cusps[house];
        if (cusp === undefined) throw new Error(`no cusp ${String(house)}`);
        expect(arcsecondsBetween(eclipticPointAtMundanePosition((house - 1) * 30, frame), cusp)).toBeLessThan(1);
        const position = placidianMundanePosition(eclipticToEquatorial(cusp, 0, obliquity), frame);
        expect(arcsecondsBetween(position, (house - 1) * 30)).toBeLessThan(1);
      }
    }
  });

  it('reproduces Makransky’s MC and Ascendant arcs once each source’s own RAMC is taken out', async () => {
    const engine = await getEngine();
    const data = await generatePrimaryDirections(PRINCE_CHARLES, engine, PrimaryDirectionKey.NAIBOD);
    expect(data.defined).toBe(true);

    const find = (significator: string, promissor: string) => {
      const hit = data.hits.find(
        (candidate) =>
          candidate.significator === significator && candidate.promissor === promissor && candidate.aspectOffset === 0,
      );
      if (hit === undefined) throw new Error(`no ${promissor} to ${significator}`);
      return hit;
    };
    // Both arcs are "a right or oblique ascension minus the RAMC", so arc + RAMC is the same
    // quantity in either source; what remains is the two ephemerides' positions and obliquity.
    const published = 12.37;
    expect(arcminutesBetween(find('mc', 'moon').arcRA + data.frame.ramc, 15.95 + published)).toBeLessThan(1);
    expect(arcminutesBetween(find('asc', 'pluto').arcRA + data.frame.ramc, 15.7 + published)).toBeLessThan(1);
  });

  it('lists every direction once, ascending by arc, within the lifetime window, never a body to itself', async () => {
    const engine = await getEngine();
    const data = await generatePrimaryDirections(PRINCE_CHARLES, engine, PrimaryDirectionKey.PTOLEMY);
    expect(data.hits.length).toBeGreaterThan(0);
    const maxArc = ageToArc(DEFAULT_MAX_AGE_YEARS, PrimaryDirectionKey.PTOLEMY);
    const seen = new Set<string>();
    let previous = 0;
    for (const hit of data.hits) {
      expect(hit.arcRA).toBeGreaterThan(0);
      expect(hit.arcRA).toBeLessThanOrEqual(maxArc);
      expect(hit.arcRA).toBeGreaterThanOrEqual(previous);
      expect(hit.ageYears).toBe(hit.arcRA); // Ptolemy: one degree, one year
      expect(hit.promissor).not.toBe(hit.significator);
      expect(hit.exactJd).toBeCloseTo(data.natalJd + hit.ageYears * TROPICAL_YEAR_DAYS, 6);
      const id = `${hit.significator}-${hit.promissor}-${String(hit.aspectOffset)}`;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      previous = hit.arcRA;
    }
    expect(new Set(data.hits.map((hit) => hit.significator))).toEqual(new Set(['asc', 'mc', 'sun', 'moon']));
  });

  it('marks a direction active within ±orb of arc of its own, and only there (orb filtering)', async () => {
    const engine = await getEngine();
    const data = await generatePrimaryDirections(PRINCE_CHARLES, engine, PrimaryDirectionKey.NAIBOD);
    const hit = data.hits.find((candidate) => candidate.significator === 'mc' && candidate.promissor === 'moon');
    if (hit === undefined) throw new Error('no Moon to MC');

    expect(hit.orb).toBe(1);
    expect(hit.activeFromAge).toBeCloseTo(arcToAge(hit.arcRA - 1, PrimaryDirectionKey.NAIBOD), 12);
    expect(hit.activeUntilAge).toBeCloseTo(arcToAge(hit.arcRA + 1, PrimaryDirectionKey.NAIBOD), 12);

    const yearsPerOrb = arcToAge(1, PrimaryDirectionKey.NAIBOD);
    expect(isDirectionActive(hit, hit.ageYears)).toBe(true);
    expect(isDirectionActive(hit, hit.ageYears - yearsPerOrb + 0.01)).toBe(true);
    expect(isDirectionActive(hit, hit.ageYears + yearsPerOrb - 0.01)).toBe(true);
    expect(isDirectionActive(hit, hit.ageYears - yearsPerOrb - 0.01)).toBe(false);
    expect(isDirectionActive(hit, hit.ageYears + yearsPerOrb + 0.01)).toBe(false);

    const active = activeDirections(data.hits, hit.ageYears);
    expect(active).toContain(hit);
    for (const other of active) expect(Math.abs(other.arcRA - hit.arcRA)).toBeLessThanOrEqual(2);

    // A narrower orb narrows the window.
    const narrow = await generatePrimaryDirections(PRINCE_CHARLES, engine, PrimaryDirectionKey.NAIBOD, 0.25);
    const narrowHit = narrow.hits.find(
      (candidate) => candidate.significator === 'mc' && candidate.promissor === 'moon',
    );
    if (narrowHit === undefined) throw new Error('no Moon to MC');
    expect(isDirectionActive(narrowHit, narrowHit.ageYears + 0.5)).toBe(false);
    expect(isDirectionActive(narrowHit, narrowHit.ageYears + 0.2)).toBe(true);
  });

  it('draws the directed chart so each direction perfects at its own age', async () => {
    const engine = await getEngine();
    const data = await generatePrimaryDirections(PRINCE_CHARLES, engine, PrimaryDirectionKey.NAIBOD);
    const samples = ['asc', 'mc', 'sun', 'moon'].map((significator) => {
      const hit = data.hits.find((candidate) => candidate.significator === significator);
      if (hit === undefined) throw new Error(`no direction to ${significator}`);
      return hit;
    });

    for (const hit of samples) {
      const chart = await directedChartAt(data, hit.ageYears, engine);
      expect(arcsecondsBetween(chart.arc, hit.arcRA)).toBeLessThan(1e-6);
      // The ephemeris's own houses for the turned sphere: RAMC advanced by exactly the arc.
      expect(arcsecondsBetween(chart.houses.armc, data.frame.ramc + hit.arcRA)).toBeLessThan(0.01);
      const directed =
        hit.significator === 'asc'
          ? chart.houses.ascendant
          : hit.significator === 'mc'
            ? chart.houses.midheaven
            : chart.positions.find((position) => position.key === hit.significator)?.longitude;
      if (directed === undefined) throw new Error(`no directed ${hit.significator}`);
      expect(arcsecondsBetween(directed, hit.promissorPoint)).toBeLessThan(1);
    }
  });

  it('declines to compute at or beyond the polar circles rather than skipping what it cannot measure', async () => {
    const engine = await getEngine();
    const tromso: BirthMomentInput = { ...PRINCE_CHARLES, coordinates: { latitude: 69.65, longitude: 18.96 } };
    const data = await generatePrimaryDirections(tromso, engine);
    expect(data.defined).toBe(false);
    expect(data.hits).toEqual([]);
  });
});
