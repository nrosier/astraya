/** Aspect configurations (#640), on aspects the real aspect finder produces from constructed positions. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_ORB_CONFIG, findAspects, fixedSubjects, type OrbConfig } from '../src/astrology/aspects.js';
import { findAspectPatterns, PATTERN_BODY_KEYS, type AspectPattern } from '../src/astrology/aspect-patterns.js';
import { bodyById, bodyByKey } from '../src/astrology/bodies.js';

const id = (key: string): number => {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`fixture bug: ${key}`);
  return body.id;
};
const PLANETS = PATTERN_BODY_KEYS.map(id);

/** The patterns among the planets placed at these longitudes (the others are absent). */
function patternsAt(
  placed: Readonly<Record<string, number>>,
  config: OrbConfig = DEFAULT_ORB_CONFIG,
): readonly AspectPattern[] {
  const positions = Object.entries(placed).map(([key, longitude]) => ({
    body: id(key),
    longitude,
    latitude: 0,
    distance: 1,
    longitudeSpeed: 1,
    latitudeSpeed: 0,
    distanceSpeed: 0,
    retrograde: false,
  }));
  const aspects = findAspects(
    fixedSubjects(positions, (body) => bodyById(body)?.category ?? 'planet'),
    config,
  );
  return findAspectPatterns(aspects, PLANETS);
}
const kinds = (patterns: readonly AspectPattern[]): string[] => patterns.map((pattern) => pattern.kind).sort();
const keys = (pattern: AspectPattern | undefined): string[] =>
  (pattern?.bodies ?? []).map((body) => bodyById(body)?.key ?? '');

describe('findAspectPatterns (#640)', () => {
  it('finds a Grand Trine, and nothing when one trine is out of orb', () => {
    expect(kinds(patternsAt({ sun: 10, moon: 130, mars: 250 }))).toEqual(['grand-trine']);
    expect(kinds(patternsAt({ sun: 10, moon: 130, mars: 265 }))).toEqual([]);
  });

  it('finds a T-Square with its apex first', () => {
    const [pattern] = patternsAt({ sun: 0, moon: 180, saturn: 90 });
    expect(pattern?.kind).toBe('t-square');
    expect(keys(pattern)[0]).toBe('saturn');
  });

  it('lists a Grand Cross once, not as its four T-Squares too', () => {
    expect(kinds(patternsAt({ sun: 0, moon: 90, mars: 180, saturn: 270 }))).toEqual(['grand-cross']);
  });

  it('finds a Yod only when the quincunx is enabled', () => {
    const yod = { sun: 0, moon: 60, pluto: 210 };
    expect(kinds(patternsAt(yod))).toEqual([]);
    const withQuincunx = { ...DEFAULT_ORB_CONFIG, enabledMinorAspects: ['quincunx'] };
    const [pattern] = patternsAt(yod, withQuincunx);
    expect(pattern?.kind).toBe('yod');
    expect(keys(pattern)[0]).toBe('pluto');
  });

  it('finds a four-body stellium once, without the three-body stelliums inside it', () => {
    expect(kinds(patternsAt({ sun: 100, mercury: 102, venus: 104, mars: 101 }))).toEqual(['stellium']);
    expect(patternsAt({ sun: 100, mercury: 102, venus: 104, mars: 101 })[0]?.bodies).toHaveLength(4);
  });

  it('does not chain a stellium: A–B and B–C conjunct but A–C apart is no stellium', () => {
    expect(kinds(patternsAt({ sun: 100, mercury: 107, venus: 114 }))).toEqual([]);
  });

  it('finds a Cradle: three sextiles in a chain half way round, ends in opposition', () => {
    const patterns = patternsAt({ sun: 0, moon: 60, mars: 120, jupiter: 180 });
    expect(kinds(patterns)).toContain('cradle');
    expect(keys(patterns.find((pattern) => pattern.kind === 'cradle'))).toEqual(['sun', 'moon', 'mars', 'jupiter']);
  });

  it('finds a Mystic Rectangle: two trines, two sextiles, two oppositions', () => {
    expect(kinds(patternsAt({ sun: 0, moon: 60, mars: 180, jupiter: 240 }))).toContain('mystic-rectangle');
  });

  it('ignores bodies outside the given set', () => {
    const positions = [
      { body: id('sun'), longitude: 10 },
      { body: id('moon'), longitude: 130 },
      { body: id('chiron'), longitude: 250 },
    ].map((position) => ({
      ...position,
      latitude: 0,
      distance: 1,
      longitudeSpeed: 1,
      latitudeSpeed: 0,
      distanceSpeed: 0,
      retrograde: false,
    }));
    const aspects = findAspects(fixedSubjects(positions, (body) => bodyById(body)?.category ?? 'planet'));
    expect(findAspectPatterns(aspects, PLANETS)).toEqual([]);
  });
});

describe('Kite (#741)', () => {
  const kitesAt = (placed: Readonly<Record<string, number>>, config: OrbConfig = DEFAULT_ORB_CONFIG): AspectPattern[] =>
    patternsAt(placed, config).filter((pattern) => pattern.kind === 'kite');

  it('finds a Kite: a Grand Trine with a focal body opposed to one vertex and sextile to the other two', () => {
    // Sun 0, Moon 120, Mars 240 are a Grand Trine. Venus at 60 is sextile Sun (5.5 orb, luminary) and Moon (5.5),
    // and opposed Mars at 180 (7 orb). Focal first, then the opposed vertex, then the other two.
    const kites = kitesAt({ sun: 0, moon: 120, mars: 240, venus: 60 });
    expect(kites).toHaveLength(1);
    expect(kites[0]?.kind).toBe('kite');
    expect(keys(kites[0])).toEqual(['venus', 'mars', 'sun', 'moon']);
  });

  it('is not a Kite when the focal body is just outside the sextile orb', () => {
    // Venus at 66.5 is 6.5 from the sextile to Sun, past the 5.5 luminary orb. (65 would still be inside it.)
    expect(kitesAt({ sun: 0, moon: 120, mars: 240, venus: 66.5 })).toEqual([]);
  });

  it('needs every leg in orb: one sextile pushed out of orb yields no Kite', () => {
    // Saturn 0, Jupiter 125, Mars 240: a Grand Trine (both trines within 7). Venus at 60 is sextile Saturn (4 orb)
    // but 65 from Jupiter, outside it. Control: Jupiter at 120 makes the same layout a Kite.
    expect(kitesAt({ saturn: 0, jupiter: 125, mars: 240, venus: 60 })).toEqual([]);
    const control = kitesAt({ saturn: 0, jupiter: 120, mars: 240, venus: 60 });
    expect(control).toHaveLength(1);
    expect(keys(control[0])).toEqual(['venus', 'mars', 'jupiter', 'saturn']);
  });
});
