import { describe, expect, it } from 'vitest';
import type { Aspect } from '../src/astrology/aspects.js';
import { bodyByKey } from '../src/astrology/bodies.js';
import type { EssentialDignities } from '../src/astrology/dignities.js';
import type { ChartData } from '../src/domain/chart-compute.js';
import {
  almutenOfAscendant,
  angleRows,
  antisciaRows,
  aspectRows,
  chartShapeOf,
  chartSheetInput,
  chartSheetMetaLines,
  chartWheelRing,
  conditionRows,
  crossAspectRows,
  declinationContactRows,
  degreeParts,
  derivedPointRows,
  dignityRows,
  dispositorRows,
  emphasisRows,
  fixedStarRows,
  houseCuspRows,
  positionRows,
  receptionRows,
} from '../src/domain/chart-tables.js';
import type { BodyId, BodyPosition, HousePositions } from '../src/ephemeris/types.js';
import type { BirthMomentInput } from '../src/time/types.js';

function idOf(key: string): BodyId {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`test fixture bug: no body keyed "${key}"`);
  return body.id;
}

const SUN = idOf('sun');
const MOON = idOf('moon');
const MARS = idOf('mars');
const CHIRON = idOf('chiron');

function position(body: BodyId, longitude: number, longitudeSpeed = 1): BodyPosition {
  return {
    body,
    longitude,
    latitude: 0,
    distance: 1,
    longitudeSpeed,
    latitudeSpeed: 0,
    distanceSpeed: 0,
    retrograde: longitudeSpeed < 0,
  };
}

const HOUSES: HousePositions = {
  // Whole-sign-ish cusps for a chart with a 10-degree Aries Ascendant, purely for row-shape testing.
  cusps: [0, 10, 40, 70, 100, 130, 160, 190, 220, 250, 280, 310, 340],
  ascendant: 10,
  midheaven: 280,
  armc: 278,
  vertex: 200,
  equatorialAscendant: 12,
  coAscendantKoch: 14,
  coAscendantMunkasey: 16,
  polarAscendant: 18,
  system: 'P',
};

describe('degreeParts (#44)', () => {
  it('splits an ordinary longitude into sign, degree, minute and second', () => {
    // 37.5 degrees is 7 degrees 30 minutes into Taurus (30-60).
    expect(degreeParts(37.5)).toEqual({ sign: 'Taurus', degree: 7, minute: 30, second: 0 });
  });

  it('snaps to the sign boundary before splitting, rather than carrying a rounded second into the next sign', () => {
    // 29 degrees 59 minutes 59.6 seconds of Aries rounds to exactly 30 Aries (0 Taurus at the second), not
    // 30 Aries with a nonexistent 60th second while the sign lookup still says Aries.
    const almostThirty = 29 + 59 / 60 + 59.6 / 3600;
    expect(degreeParts(almostThirty)).toEqual({ sign: 'Taurus', degree: 0, minute: 0, second: 0 });
  });

  it('wraps a longitude outside [0, 360) before splitting', () => {
    expect(degreeParts(370)).toEqual(degreeParts(10));
  });
});

describe('positionRows (#44)', () => {
  const data: ChartData = {
    positions: [position(SUN, 10), position(MOON, 100, -0.5)],
    houses: HOUSES,
    aspects: [],
    dignities: new Map(),
    sect: 'day',
    partOfFortune: 0,
    partOfSpirit: 0,
  };

  it('resolves each position to its body name, glyph, degree parts, house and retrograde flag', () => {
    const rows = positionRows(data);
    expect(rows).toEqual([
      {
        bodyKey: 'sun',
        bodyName: 'Sun',
        glyph: '☉',
        longitude: 10,
        speed: 1,
        retrograde: false,
        house: 1,
        sign: 'Aries',
        degree: 10,
        minute: 0,
        second: 0,
        anaretic: false,
      },
      {
        bodyKey: 'moon',
        bodyName: 'Moon',
        glyph: '☽',
        longitude: 100,
        speed: -0.5,
        retrograde: true,
        house: 4,
        sign: 'Cancer',
        degree: 10,
        minute: 0,
        second: 0,
        anaretic: false,
      },
    ]);
  });

  it('keeps Chiron by default but drops it when chironVisible is false', () => {
    const withChiron: ChartData = { ...data, positions: [...data.positions, position(CHIRON, 50)] };
    expect(positionRows(withChiron).map((row) => row.bodyKey)).toEqual(['sun', 'moon', 'chiron']);
    expect(positionRows(withChiron, { chironVisible: false }).map((row) => row.bodyKey)).toEqual(['sun', 'moon']);
  });

  it('appends the Ascendant and Midheaven when includeAngles is true, with no house/speed/retrograde', () => {
    const rows = positionRows(data, {}, true);
    expect(rows.map((row) => row.bodyKey)).toEqual(['sun', 'moon', 'asc', 'mc']);
    expect(rows[2]).toEqual({
      bodyKey: 'asc',
      bodyName: 'Ascendant',
      glyph: 'AC',
      longitude: 10,
      sign: 'Aries',
      degree: 10,
      minute: 0,
      second: 0,
      anaretic: false,
    });
    expect(rows[3]).toEqual({
      bodyKey: 'mc',
      bodyName: 'Midheaven',
      glyph: 'MC',
      longitude: 280,
      sign: 'Capricorn',
      degree: 10,
      minute: 0,
      second: 0,
      anaretic: false,
    });
  });

  it('omits the Ascendant and Midheaven when includeAngles is false (the default)', () => {
    expect(positionRows(data).map((row) => row.bodyKey)).toEqual(['sun', 'moon']);
    expect(positionRows(data, {}, false).map((row) => row.bodyKey)).toEqual(['sun', 'moon']);
  });

  it('omits house (not NaN, not undefined-but-present) instead of throwing when houses have no valid solution (#378)', () => {
    const degenerateHouses: HousePositions = { ...HOUSES, cusps: HOUSES.cusps.map(() => Number.NaN) };
    const degenerate: ChartData = { ...data, houses: degenerateHouses };

    expect(() => positionRows(degenerate)).not.toThrow();
    const rows = positionRows(degenerate);
    expect(rows.map((row) => row.bodyKey)).toEqual(['sun', 'moon']);
    for (const row of rows) {
      expect('house' in row).toBe(false);
    }
  });
});

describe('houseCuspRows (#44)', () => {
  it('produces one row per house, skipping the unused index 0', () => {
    const data: ChartData = {
      positions: [],
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    const rows = houseCuspRows(data);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual({ house: 1, longitude: 10, ...degreeParts(10) });
    expect(rows[11]).toEqual({ house: 12, longitude: 340, ...degreeParts(340) });
  });
});

describe('angleRows (#44)', () => {
  it('lists five angles by default, omitting the Vertex', () => {
    const data: ChartData = {
      positions: [],
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    const rows = angleRows(data);
    expect(rows.map((row) => row.label)).toEqual([
      'ARMC',
      'Equatorial Ascendant',
      'Co-Ascendant (Koch)',
      'Co-Ascendant (Munkasey)',
      'Polar Ascendant',
    ]);
    expect(rows[0]).toMatchObject({ longitude: 278 });
  });

  it('includes the Vertex once vertexVisible is true', () => {
    const data: ChartData = {
      positions: [],
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    const rows = angleRows(data, { vertexVisible: true });
    expect(rows.map((row) => row.label)).toEqual([
      'ARMC',
      'Vertex',
      'Equatorial Ascendant',
      'Co-Ascendant (Koch)',
      'Co-Ascendant (Munkasey)',
      'Polar Ascendant',
    ]);
  });
});

describe('aspectRows (#44)', () => {
  it('resolves both bodies to names and carries the aspect through', () => {
    const aspect: Aspect = {
      bodyA: SUN,
      bodyB: MARS,
      aspect: { key: 'square', name: 'Square', angle: 90, family: 'major' },
      separation: 91,
      orb: 1,
      applying: true,
    };
    const data: ChartData = {
      positions: [],
      houses: HOUSES,
      aspects: [aspect],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    expect(aspectRows(data)).toEqual([
      {
        bodyAKey: 'sun',
        bodyAName: 'Sun',
        bodyBKey: 'mars',
        bodyBName: 'Mars',
        aspect: 'Square',
        aspectKey: 'square',
        angle: 90,
        separation: 91,
        orb: 1,
        applying: true,
      },
    ]);
  });
});

describe('crossAspectRows (#172)', () => {
  it('shapes a plain cross-chart aspect list the same way aspectRows shapes ChartData.aspects', () => {
    const aspect: Aspect = {
      bodyA: SUN,
      bodyB: MOON,
      aspect: { key: 'trine', name: 'Trine', angle: 120, family: 'major' },
      separation: 119,
      orb: 1,
      applying: false,
    };
    expect(crossAspectRows([aspect])).toEqual([
      {
        bodyAKey: 'sun',
        bodyAName: 'Sun',
        bodyBKey: 'moon',
        bodyBName: 'Moon',
        aspect: 'Trine',
        aspectKey: 'trine',
        angle: 120,
        separation: 119,
        orb: 1,
        applying: false,
      },
    ]);
  });
});

describe('dignityRows (#44)', () => {
  it('reads each dignity from the map, defaulting to false for a body missing from it', () => {
    const dignities = new Map<BodyId, EssentialDignities>([
      [SUN, { ruler: false, exalted: true, detriment: false, fall: false }],
    ]);
    const data: ChartData = {
      positions: [position(SUN, 10), position(MOON, 100)],
      houses: HOUSES,
      aspects: [],
      dignities,
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    expect(dignityRows(data)).toEqual([
      {
        bodyKey: 'sun',
        bodyName: 'Sun',
        ruler: false,
        exalted: true,
        detriment: false,
        fall: false,
        triplicity: true,
        bound: false,
        face: true,
        points: 8,
        peregrine: false,
      },
      {
        bodyKey: 'moon',
        bodyName: 'Moon',
        ruler: false,
        exalted: false,
        detriment: false,
        fall: false,
        triplicity: false,
        bound: false,
        face: false,
        points: 5,
        peregrine: false,
      },
    ]);
  });

  it('keeps Chiron by default but drops it when chironVisible is false', () => {
    const dignities = new Map<BodyId, EssentialDignities>();
    const data: ChartData = {
      positions: [position(SUN, 10), position(CHIRON, 50)],
      houses: HOUSES,
      aspects: [],
      dignities,
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    expect(dignityRows(data).map((row) => row.bodyKey)).toEqual(['sun', 'chiron']);
    expect(dignityRows(data, { chironVisible: false }).map((row) => row.bodyKey)).toEqual(['sun']);
  });
});

describe('almutenOfAscendant (#398)', () => {
  it('names whichever traditional planet holds the most essential dignity at the Ascendant', () => {
    const data: ChartData = {
      positions: [],
      // Ascendant at longitude 10 (10 Aries), day sect: Mars rules (5 points) but the Sun is
      // exalted there, holds day triplicity, and is the Chaldean face ruler too (4+3+1=8 points)
      // — the Sun outscores the sign's own ruler, which is exactly the kind of case an "Almuten
      // of the Ascendant" summary exists to surface.
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    const result = almutenOfAscendant(data);
    expect(result?.almutens).toEqual(['sun']);
  });

  it('reports every candidate’s own score breakdown, not only the winner’s name (#551)', () => {
    const data: ChartData = {
      positions: [],
      houses: HOUSES, // same 10 Aries day-chart Ascendant as above
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    const result = almutenOfAscendant(data);
    expect(result?.candidates).toHaveLength(7);
    const sun = result?.candidates.find((row) => row.bodyKey === 'sun');
    const mars = result?.candidates.find((row) => row.bodyKey === 'mars');
    const moon = result?.candidates.find((row) => row.bodyKey === 'moon');
    expect(sun).toEqual({
      bodyKey: 'sun',
      bodyName: 'Sun',
      ruler: false,
      exalted: true,
      triplicity: true,
      bound: false,
      face: true,
      points: 8,
      peregrine: false,
    });
    expect(mars?.ruler).toBe(true);
    expect(mars?.points).toBe(5);
    expect(moon?.peregrine).toBe(true);
    expect(moon?.points).toBe(0);
  });

  it('is undefined when houses have no valid solution (#378)', () => {
    const degenerateHouses: HousePositions = { ...HOUSES, cusps: HOUSES.cusps.map(() => Number.NaN) };
    const data: ChartData = {
      positions: [],
      houses: degenerateHouses,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    expect(almutenOfAscendant(data)).toBeUndefined();
  });
});

describe('dispositorRows (#398)', () => {
  it('terminates at a final dispositor when a body rules its own sign', () => {
    const data: ChartData = {
      positions: [position(MARS, 10)], // 10 Aries, Mars's own sign
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    const [row] = dispositorRows(data);
    expect(row).toMatchObject({
      bodyKey: 'mars',
      chain: ['mars'],
      finalDispositorKey: 'mars',
      cycle: false,
      mutualReception: false,
    });
  });

  it('flags mutual reception between two bodies each in the sign the other rules', () => {
    const mercury = idOf('mercury');
    const data: ChartData = {
      // Mars at 6 Gemini (Mercury's sign), Mercury at 5 Aries (Mars's sign) — the same pair
      // `isMutualReception`'s own test (#34) uses.
      positions: [position(MARS, 2 * 30 + 5), position(mercury, 5)],
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    const rows = dispositorRows(data);
    expect(rows.find((row) => row.bodyKey === 'mars')).toMatchObject({ mutualReception: true, cycle: true });
    expect(rows.find((row) => row.bodyKey === 'mercury')).toMatchObject({ mutualReception: true, cycle: true });
  });

  it('excludes asteroids, nodes, Lilith and Chiron — a dispositor chain is a planets-only concept', () => {
    const data: ChartData = {
      // Mars at 10 Aries (its own sign) so Sun's own chain (Aries is Sun-exalted but Mars-ruled)
      // has a position to resolve into — `dispositorChain` needs a placement for every ruler the
      // walk reaches (its own doc comment), which Chiron would never provide anyway.
      positions: [position(SUN, 10), position(MARS, 10), position(CHIRON, 50)],
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    expect(dispositorRows(data).map((row) => row.bodyKey)).toEqual(['sun', 'mars']);
  });
});

describe('declinationContactRows (#398)', () => {
  it('finds a parallel contact within the default 1° orb', () => {
    const data: ChartData = {
      positions: [position(SUN, 10), position(MOON, 100)],
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
      declinations: new Map([
        [SUN, 20],
        [MOON, 20.5],
      ]),
      obliquity: 23.4,
    };
    expect(declinationContactRows(data)).toEqual([
      { bodyAKey: 'sun', bodyAName: 'Sun', bodyBKey: 'moon', bodyBName: 'Moon', kind: 'parallel', orb: 0.5 },
    ]);
  });

  it('returns an empty list when declinations are unavailable (a composite/harmonic chart)', () => {
    const data: ChartData = {
      positions: [position(SUN, 10), position(MOON, 100)],
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    expect(declinationContactRows(data)).toEqual([]);
  });
});

describe('antisciaRows (#398)', () => {
  it('finds an antiscion contact within the default 1° orb, deduplicated to one row per pair', () => {
    const data: ChartData = {
      positions: [position(SUN, 15), position(MOON, 165.5)], // Sun's antiscion is 15 Virgo (165) — same pair antiscialContacts' own test (#31) uses.
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    const rows = antisciaRows(data);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'antiscion' });
    expect([rows[0]?.bodyKey, rows[0]?.contactKey].sort()).toEqual(['moon', 'sun']);
  });
});

describe('fixedStarRows (#398)', () => {
  it('finds a conjunction within the default 1° orb', () => {
    const data: ChartData = {
      positions: [position(SUN, 150.5)],
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
      fixedStars: new Map([['Regulus', 150.1]]),
    };
    const rows = fixedStarRows(data);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ star: 'Regulus', bodyKey: 'sun', bodyName: 'Sun' });
    expect(rows[0]?.orb).toBeCloseTo(0.4, 10);
  });

  it('returns an empty list when fixed stars are unavailable (a composite/harmonic chart)', () => {
    const data: ChartData = {
      positions: [position(SUN, 150.5)],
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    expect(fixedStarRows(data)).toEqual([]);
  });
});

describe('chartShapeOf (#398)', () => {
  it('identifies a bucket and its handle, the same fixture jonesShapeOf itself is tested against (#35)', () => {
    const mercury = idOf('mercury');
    const venus = idOf('venus');
    const data: ChartData = {
      positions: [
        position(SUN, 0),
        position(MOON, 50),
        position(mercury, 100),
        position(venus, 150),
        position(MARS, 255),
      ],
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    const result = chartShapeOf(data);
    expect(result?.shape).toBe('bucket');
    expect(result?.handle).toBe(MARS);
  });

  it('is undefined with fewer than two visible positions, rather than letting jonesShapeOf throw', () => {
    const data: ChartData = {
      positions: [position(SUN, 10)],
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    expect(chartShapeOf(data)).toBeUndefined();
  });
});

describe('derivedPointRows (#44)', () => {
  const data: ChartData = {
    positions: [position(SUN, 10), position(MOON, 100)],
    houses: HOUSES,
    aspects: [],
    dignities: new Map(),
    sect: 'night',
    partOfFortune: 45,
    partOfSpirit: 200,
  };

  it('lists nothing by default — Fortune, Spirit and the midpoints are all hidden until asked for (#542)', () => {
    expect(derivedPointRows(data)).toEqual([]);
  });

  it('includes Part of Fortune once fortuneVisible is true, independently of Spirit', () => {
    expect(derivedPointRows(data, { fortuneVisible: true })).toEqual([
      { pointKey: 'part-of-fortune', label: 'Part of Fortune', longitude: 45, ...degreeParts(45) },
    ]);
  });

  it('includes Part of Spirit once spiritVisible is true (#542) — it has its own flag now, like Fortune', () => {
    expect(derivedPointRows(data, { spiritVisible: true })).toEqual([
      { pointKey: 'part-of-spirit', label: 'Part of Spirit', longitude: 200, ...degreeParts(200) },
    ]);
  });

  it('adds the ASC/MC and Sun/Moon midpoints once midpointsVisible is true', () => {
    // ASC 10, MC 280: shorter arc midpoint is 325 (Aquarius 25). Sun 10, Moon 100: midpoint is 55 (Taurus 25).
    expect(derivedPointRows(data, { midpointsVisible: true })).toEqual([
      { label: 'ASC/MC Midpoint', longitude: 325, ...degreeParts(325) },
      { label: 'Sun/Moon Midpoint', longitude: 55, ...degreeParts(55) },
    ]);
  });
});

describe('chartWheelRing (#52)', () => {
  it('shapes positions, houses and aspects into a WheelRingInput, defaulting the label to Natal', () => {
    const aspect: Aspect = {
      bodyA: SUN,
      bodyB: MARS,
      aspect: { key: 'square', name: 'Square', angle: 90, family: 'major' },
      separation: 91,
      orb: 1,
      applying: true,
    };
    const data: ChartData = {
      positions: [position(SUN, 10), position(MOON, 100)],
      houses: HOUSES,
      aspects: [aspect],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    expect(chartWheelRing(data)).toEqual({
      label: 'Natal',
      houses: HOUSES,
      bodies: [
        { body: SUN, key: 'sun', longitude: 10, retrograde: false },
        { body: MOON, key: 'moon', longitude: 100, retrograde: false },
      ],
      aspects: [aspect],
    });
  });

  it('uses a given label instead of the default', () => {
    const data: ChartData = {
      positions: [],
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    expect(chartWheelRing(data, 'Transiting').label).toBe('Transiting');
  });

  it('drops minor aspects from the wheel, keeping only the five major ones', () => {
    const major: Aspect = {
      bodyA: SUN,
      bodyB: MARS,
      aspect: { key: 'square', name: 'Square', angle: 90, family: 'major' },
      separation: 91,
      orb: 1,
      applying: true,
    };
    const minor: Aspect = {
      bodyA: SUN,
      bodyB: MOON,
      aspect: { key: 'quincunx', name: 'Quincunx', angle: 150, family: 'minor' },
      separation: 149,
      orb: 1,
      applying: true,
    };
    const data: ChartData = {
      positions: [position(SUN, 10), position(MOON, 100), position(MARS, 101)],
      houses: HOUSES,
      aspects: [major, minor],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    expect(chartWheelRing(data).aspects).toEqual([major]);
  });

  it('keeps Chiron in the wheel bodies and its aspects by default, dropping both when chironVisible is false (#542)', () => {
    const aspect: Aspect = {
      bodyA: SUN,
      bodyB: CHIRON,
      aspect: { key: 'square', name: 'Square', angle: 90, family: 'major' },
      separation: 91,
      orb: 1,
      applying: true,
    };
    const data: ChartData = {
      positions: [position(SUN, 10), position(CHIRON, 100)],
      houses: HOUSES,
      aspects: [aspect],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    expect(chartWheelRing(data).bodies).toEqual([
      { body: SUN, key: 'sun', longitude: 10, retrograde: false },
      { body: CHIRON, key: 'chiron', longitude: 100, retrograde: false },
    ]);
    expect(chartWheelRing(data).aspects).toEqual([aspect]);
    expect(chartWheelRing(data, 'Natal', { chironVisible: false }).bodies).toEqual([
      { body: SUN, key: 'sun', longitude: 10, retrograde: false },
    ]);
    // #542: a hidden Chiron can no longer still "speak" through an aspect on the wheel either.
    expect(chartWheelRing(data, 'Natal', { chironVisible: false }).aspects).toEqual([]);
  });
});

describe('chartSheetInput', () => {
  const aspect: Aspect = {
    bodyA: SUN,
    bodyB: MARS,
    aspect: { key: 'square', name: 'Square', angle: 90, family: 'major' },
    separation: 91,
    orb: 1,
    applying: true,
  };
  const data: ChartData = {
    positions: [position(SUN, 10), position(MOON, 100), position(MARS, 101)],
    houses: HOUSES,
    aspects: [aspect],
    dignities: new Map(),
    sect: 'day',
    partOfFortune: 0,
    partOfSpirit: 0,
  };

  it('gives every panel the same bodies, in ChartData order, with the grid also carrying the two angles (#413)', () => {
    const input = chartSheetInput(data);
    expect(input.matrix.bodies.map((body) => body.key)).toEqual(['sun', 'moon', 'mars', 'asc', 'mc']);
    expect(input.emphasis.bodies.map((body) => body.key)).toEqual(['sun', 'moon', 'mars']);
    expect(input.strip.bodies.map((body) => body.key)).toEqual(['sun', 'moon', 'mars']);
  });

  it('describes each matrix row for the positions table: name, longitude, retrograde and house; the angles with no house (#413)', () => {
    const rows = chartSheetInput(data).matrix.bodies;
    expect(rows.slice(0, 3)).toEqual([
      { key: 'sun', label: 'Sun', name: 'Sun', longitude: 10, retrograde: false, house: 1 },
      { key: 'moon', label: 'Moon', name: 'Moon', longitude: 100, retrograde: false, house: 4 },
      { key: 'mars', label: 'Mars', name: 'Mars', longitude: 101, retrograde: false, house: 4 },
    ]);
    expect(rows.slice(3)).toEqual([
      { key: 'asc', label: 'AC', name: 'ASC', longitude: 10 },
      { key: 'mc', label: 'MC', name: 'MC', longitude: 280 },
    ]);
  });

  it('localizes the positions table name through the supplied lookup, but not the angles', () => {
    const rows = chartSheetInput(data, [], 'Natal', {}, (key) => `<${key}>`).matrix.bodies;
    expect(rows.map((row) => row.name)).toEqual(['<sun>', '<moon>', '<mars>', 'ASC', 'MC']);
  });

  it('passes the engine aspects through by key with their signed orb, never re-deriving which aspect it is', () => {
    // The fixture's square sits at separation 91 against an exact 90, one degree past it.
    expect(chartSheetInput(data).matrix.aspects).toEqual([
      { aKey: 'sun', bKey: 'mars', aspectKey: 'square', orb: 1, signedOrb: 1, applying: true },
    ]);
  });

  it('adds the chart’s angle aspects to the grid, keyed by the angle (#413)', () => {
    const withAngles: ChartData = {
      ...data,
      angleAspects: [
        {
          angle: 'asc',
          body: SUN,
          aspect: { key: 'sextile', name: 'Sextile', angle: 60, family: 'major' },
          separation: 58.5,
          orb: 1.5,
          applying: false,
        },
      ],
    };
    expect(chartSheetInput(withAngles).matrix.aspects).toContainEqual({
      aKey: 'asc',
      bKey: 'sun',
      aspectKey: 'sextile',
      orb: 1.5,
      signedOrb: -1.5,
      applying: false,
    });
  });

  it('wraps the chart as a single wheel ring, with the label it is given', () => {
    const input = chartSheetInput(data, [], 'Solar return');
    expect(input.rings).toHaveLength(1);
    expect(input.rings[0]?.label).toBe('Solar return');
    expect(input.rings[0]?.aspects).toEqual([aspect]);
  });

  it('carries the header lines through untouched, defaulting to none', () => {
    expect(chartSheetInput(data).metaLines).toEqual([]);
    expect(chartSheetInput(data, ['A', 'B']).metaLines).toEqual(['A', 'B']);
  });

  it('keeps Chiron in every panel by default, dropping it once chironVisible is false', () => {
    const withChiron: ChartData = { ...data, positions: [...data.positions, position(CHIRON, 200)] };
    const shown = chartSheetInput(withChiron);
    expect(shown.matrix.bodies.map((body) => body.key)).toEqual(['sun', 'moon', 'mars', 'chiron', 'asc', 'mc']);
    expect(shown.emphasis.bodies.map((body) => body.key)).toEqual(['sun', 'moon', 'mars', 'chiron']);
    expect(shown.strip.bodies.map((body) => body.key)).toEqual(['sun', 'moon', 'mars', 'chiron']);
    expect(shown.rings[0]?.bodies.map((body) => body.key)).toEqual(['sun', 'moon', 'mars', 'chiron']);

    const hidden = chartSheetInput(withChiron, [], 'Natal', { chironVisible: false });
    expect(hidden.matrix.bodies.map((body) => body.key)).toEqual(['sun', 'moon', 'mars', 'asc', 'mc']);
    expect(hidden.emphasis.bodies.map((body) => body.key)).toEqual(['sun', 'moon', 'mars']);
    expect(hidden.strip.bodies.map((body) => body.key)).toEqual(['sun', 'moon', 'mars']);
    expect(hidden.rings[0]?.bodies.map((body) => body.key)).toEqual(['sun', 'moon', 'mars']);
  });
});

describe('chartSheetMetaLines', () => {
  const moment: BirthMomentInput = {
    civil: { year: 1815, month: 12, day: 10, hour: 6, minute: 5, second: 0 },
    coordinates: { latitude: 51.5, longitude: -0.12 },
  };

  it('states the name, the civil date and time as entered, and the place', () => {
    expect(chartSheetMetaLines('Ada Lovelace', moment, 'en')).toEqual([
      'Ada Lovelace',
      '1815-12-10 06:05',
      '51.50°N 0.12°W',
    ]);
  });

  it('names the zone when the record overrides it', () => {
    expect(chartSheetMetaLines('Ada', { ...moment, zoneOverride: 'Europe/London' }, 'en')[1]).toBe(
      '1815-12-10 06:05 (Europe/London)',
    );
  });

  it('says so when the offset was stated rather than looked up', () => {
    expect(chartSheetMetaLines('Ada', { ...moment, offsetOverrideMinutes: -75 }, 'en')[1]).toBe(
      '1815-12-10 06:05 (stated offset)',
    );
  });

  it('marks a southern latitude and an eastern longitude by hemisphere', () => {
    expect(
      chartSheetMetaLines('Anon', { ...moment, coordinates: { latitude: -33.87, longitude: 151.21 } }, 'en')[2],
    ).toBe('33.87°S 151.21°E');
  });

  it('prints the coordinates with Dutch hemisphere letters and a comma decimal separator in nl', () => {
    expect(chartSheetMetaLines('Anon', moment, 'nl')[2]).toBe('51,50°N 0,12°W');
    expect(
      chartSheetMetaLines('Anon', { ...moment, coordinates: { latitude: -33.87, longitude: 151.21 } }, 'nl')[2],
    ).toBe('33,87°Z 151,21°O');
  });

  it('passes the name straight through, empty string included — a fallback is the caller’s job', () => {
    expect(chartSheetMetaLines('', moment, 'en')[0]).toBe('');
  });
});

describe('emphasisRows (#511)', () => {
  // Sun 10 Aries (fire cardinal), Moon 100 Cancer (water cardinal), Mars 101 Cancer, Chiron 50 Taurus (earth fixed).
  const data: ChartData = {
    positions: [position(SUN, 10), position(MOON, 100), position(MARS, 101), position(CHIRON, 50)],
    houses: HOUSES,
    aspects: [],
    dignities: new Map(),
    sect: 'day',
    partOfFortune: 0,
    partOfSpirit: 0,
  };

  it('lists each element warm to cold with the bodies in its cardinal, fixed and mutable signs, then a modality-totals row', () => {
    const rows = emphasisRows(data);
    expect(rows.map((row) => row.rowKey)).toEqual(['fire', 'earth', 'air', 'water', 'total']);
    expect(rows[0]?.bodies).toEqual({ cardinal: ['sun'], fixed: [], mutable: [] });
    expect(rows[1]?.bodies).toEqual({ cardinal: [], fixed: ['chiron'], mutable: [] });
    expect(rows[3]?.bodies).toEqual({ cardinal: ['moon', 'mars'], fixed: [], mutable: [] });
  });

  it('takes the margins from the balance functions: element totals on the right, modality totals on the last row', () => {
    const rows = emphasisRows(data);
    expect(rows.map((row) => row.total)).toEqual([1, 1, 0, 2, 4]);
    expect(rows[4]?.counts).toEqual({ cardinal: 3, fixed: 1, mutable: 0 });
    // Every body is counted exactly once across the four element rows.
    expect(rows.slice(0, 4).reduce((sum, row) => sum + row.total, 0)).toBe(rows[4]?.total);
  });

  it('leaves out a body the visibility options hide, as the grid and the other tables do', () => {
    const rows = emphasisRows(data, { chironVisible: false });
    expect(rows[1]?.bodies.fixed).toEqual([]);
    expect(rows[4]?.total).toBe(3);
  });
});

describe('conditionRows (#547)', () => {
  const SATURN = idOf('saturn');
  const JUPITER = idOf('jupiter');
  const VENUS = idOf('venus');
  const MERCURY = idOf('mercury');
  const URANUS = idOf('uranus');

  // Ascendant 10°: above-horizon half is longitude >= 190 or < 10.
  const DAY_HOUSES: HousePositions = { ...HOUSES, ascendant: 10 };

  const data: ChartData = {
    positions: [
      position(SUN, 0),
      position(MOON, 300),
      position(MERCURY, 50),
      position(VENUS, 95, -1), // retrograde, near Mars below for besiegement
      position(MARS, 90),
      position(JUPITER, 250), // Sagittarius (fire, masculine), above horizon: hayz candidate
      position(SATURN, 100), // the other besieging malefic for Venus (5° ahead, within the 7° major orb)
      position(URANUS, 15), // not a traditional planet — must be excluded
      position(CHIRON, 15), // not a traditional planet — must be excluded
    ],
    houses: DAY_HOUSES,
    aspects: [],
    dignities: new Map(),
    sect: 'day',
    partOfFortune: 0,
    partOfSpirit: 0,
  };

  it('has exactly one row per traditional planet, excluding Uranus/Chiron/every other body', () => {
    const rows = conditionRows(data);
    expect(rows.map((row) => row.bodyKey).sort()).toEqual(
      ['jupiter', 'mars', 'mercury', 'moon', 'saturn', 'sun', 'venus'].sort(),
    );
  });

  it('scores dignity the same way dignityRows does, for the same body', () => {
    const conditionRow = conditionRows(data).find((row) => row.bodyKey === 'jupiter');
    const dignityRow = dignityRows(data).find((row) => row.bodyKey === 'jupiter');
    expect(conditionRow?.points).toBe(dignityRow?.points);
    expect(conditionRow?.peregrine).toBe(dignityRow?.peregrine);
  });

  it('reports sect alignment correctly: Jupiter (diurnal) ofSect in this day chart, Venus (nocturnal) contraSect', () => {
    const rows = conditionRows(data);
    expect(rows.find((row) => row.bodyKey === 'jupiter')?.sectAlignment).toBe('ofSect');
    expect(rows.find((row) => row.bodyKey === 'venus')?.sectAlignment).toBe('contraSect');
    expect(rows.find((row) => row.bodyKey === 'mercury')?.sectAlignment).toBe('neutral');
  });

  it('reports motion from the position’s own speed, matching the retrograde flag', () => {
    const rows = conditionRows(data);
    expect(rows.find((row) => row.bodyKey === 'venus')?.motion).toBe('retrograde');
    expect(rows.find((row) => row.bodyKey === 'sun')?.motion).toBe('direct');
  });

  it('finds Jupiter in hayz: of sect, above the horizon, in a masculine sign', () => {
    expect(conditionRows(data).find((row) => row.bodyKey === 'jupiter')?.inHayz).toBe(true);
  });

  it('finds Venus besieged between Mars (behind) and Saturn (ahead), both within conjunction orb', () => {
    const row = conditionRows(data).find((row) => row.bodyKey === 'venus');
    expect(row?.besieged).toBe(true);
  });

  it('omits solar phase/condition for the Sun itself, reports it for every other body', () => {
    const rows = conditionRows(data);
    expect(rows.find((row) => row.bodyKey === 'sun')?.solarPhase).toBeUndefined();
    expect(rows.find((row) => row.bodyKey === 'sun')?.solarCondition).toBeUndefined();
    const mercuryRow = rows.find((row) => row.bodyKey === 'mercury');
    expect(mercuryRow?.solarPhase).toBeDefined();
    expect(mercuryRow?.solarCondition).toBeDefined();
  });

  it('omits angularity and hayz when houses are not usable', () => {
    const noHouses: ChartData = {
      ...data,
      houses: { ...DAY_HOUSES, cusps: DAY_HOUSES.cusps.map((c, i) => (i === 0 ? c : Number.NaN)) },
    };
    const rows = conditionRows(noHouses);
    expect(rows.every((row) => row.angularity === undefined)).toBe(true);
    expect(rows.every((row) => row.inHayz === undefined)).toBe(true);
  });
});

describe('receptionRows (#548)', () => {
  const JUPITER = idOf('jupiter');

  it('reports mutual reception by domicile for Mars in Cancer and Moon in Scorpio, aspect-linked when the aspect is present', () => {
    const linkedAspect: Aspect = {
      bodyA: MARS,
      bodyB: MOON,
      aspect: { key: 'opposition', name: 'Opposition', angle: 180, family: 'major' },
      separation: 120,
      orb: 10,
      applying: true,
    };
    const data: ChartData = {
      positions: [position(MARS, 100), position(MOON, 220)],
      houses: HOUSES,
      aspects: [linkedAspect],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    const rows = receptionRows(data);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.kind).toBe('mutual');
    expect(row?.sameDignityType).toBe(true);
    expect(row?.aFromBTypes).toContain('domicile');
    expect(row?.bFromATypes).toContain('domicile');
    expect(row?.aspectLinked).toBe(true);
  });

  it('is not aspect-linked when the two bodies have no aspect between them', () => {
    const data: ChartData = {
      positions: [position(MARS, 100), position(MOON, 220)],
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    expect(receptionRows(data)[0]?.aspectLinked).toBe(false);
  });

  it('omits a pair with no reception at all, rather than a zeroed-out row', () => {
    const data: ChartData = {
      positions: [position(JUPITER, 100), position(MARS, 15)],
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    expect(receptionRows(data)).toEqual([]);
  });

  it('ignores a traditional planet with no position in the chart', () => {
    const data: ChartData = {
      positions: [position(MARS, 100), position(MOON, 220)],
      houses: HOUSES,
      aspects: [],
      dignities: new Map(),
      sect: 'day',
      partOfFortune: 0,
      partOfSpirit: 0,
    };
    // Saturn/Jupiter have no positions here — must not throw or produce spurious rows for them.
    expect(() => receptionRows(data)).not.toThrow();
    const keys = receptionRows(data).flatMap((row) => [row.bodyAKey, row.bodyBKey]);
    expect(keys).not.toContain('saturn');
    expect(keys).not.toContain('jupiter');
  });
});
