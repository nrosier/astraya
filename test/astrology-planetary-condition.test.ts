/**
 * Unit tests for the traditional planetary-condition classifiers (#547) — pure, no engine needed.
 */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { DEFAULT_ORB_CONFIG } from '../src/astrology/aspects.js';
import {
  angularityOfHouse,
  DIURNAL_PLANETS,
  isBesieged,
  isInHayz,
  motionOf,
  NOCTURNAL_PLANETS,
  sectAlignmentOf,
} from '../src/astrology/planetary-condition.js';

const sun = bodyByKey('sun');
const moon = bodyByKey('moon');
const mercury = bodyByKey('mercury');
const jupiter = bodyByKey('jupiter');
const saturn = bodyByKey('saturn');
const venus = bodyByKey('venus');
const mars = bodyByKey('mars');
if (
  sun === undefined ||
  moon === undefined ||
  mercury === undefined ||
  jupiter === undefined ||
  saturn === undefined ||
  venus === undefined ||
  mars === undefined
) {
  throw new Error('fixture bug: a traditional planet is missing from BODIES');
}

describe('DIURNAL_PLANETS / NOCTURNAL_PLANETS / sectAlignmentOf (#547)', () => {
  it('lists exactly the three diurnal and three nocturnal planets, no overlap, Mercury in neither', () => {
    expect(DIURNAL_PLANETS).toHaveLength(3);
    expect(NOCTURNAL_PLANETS).toHaveLength(3);
    expect(DIURNAL_PLANETS.some((id) => NOCTURNAL_PLANETS.includes(id))).toBe(false);
    expect(DIURNAL_PLANETS.includes(mercury.id)).toBe(false);
    expect(NOCTURNAL_PLANETS.includes(mercury.id)).toBe(false);
  });

  it('a diurnal planet is of sect in a day chart, contrary in a night chart', () => {
    expect(sectAlignmentOf(jupiter.id, 'day')).toBe('ofSect');
    expect(sectAlignmentOf(jupiter.id, 'night')).toBe('contraSect');
  });

  it('a nocturnal planet is of sect in a night chart, contrary in a day chart', () => {
    expect(sectAlignmentOf(venus.id, 'night')).toBe('ofSect');
    expect(sectAlignmentOf(venus.id, 'day')).toBe('contraSect');
  });

  it('Mercury is sect-neutral under either sect', () => {
    expect(sectAlignmentOf(mercury.id, 'day')).toBe('neutral');
    expect(sectAlignmentOf(mercury.id, 'night')).toBe('neutral');
  });
});

describe('angularityOfHouse (#547)', () => {
  it('classifies all twelve houses correctly', () => {
    expect([1, 4, 7, 10].map(angularityOfHouse)).toEqual(['angular', 'angular', 'angular', 'angular']);
    expect([2, 5, 8, 11].map(angularityOfHouse)).toEqual(['succedent', 'succedent', 'succedent', 'succedent']);
    expect([3, 6, 9, 12].map(angularityOfHouse)).toEqual(['cadent', 'cadent', 'cadent', 'cadent']);
  });
});

describe('motionOf (#547)', () => {
  it('direct for positive speed, retrograde for negative, stationary only at exactly zero', () => {
    expect(motionOf(1)).toBe('direct');
    expect(motionOf(-1)).toBe('retrograde');
    expect(motionOf(0)).toBe('stationary');
  });
});

describe('isInHayz (#547)', () => {
  it('a diurnal planet above the horizon in a day chart, in a masculine sign, is in hayz', () => {
    // Ascendant at 0° Aries; longitude 100° (Cancer) is above horizon (180-360° past the ASC... wait
    // test with a longitude clearly in the above-horizon half and a masculine sign: 200° = 20° Libra (air, masculine).
    expect(isInHayz(jupiter.id, 200, 0, 'day')).toBe(true);
  });

  it('fails hayz when the sect alignment itself is wrong', () => {
    expect(isInHayz(jupiter.id, 200, 0, 'night')).toBe(false);
  });

  it('fails hayz when the horizon position is wrong even if the sect alignment is right', () => {
    // Same diurnal planet, same day chart, but below the horizon (longitude 20°, Ascendant 0°).
    expect(isInHayz(jupiter.id, 20, 0, 'day')).toBe(false);
  });

  it('fails hayz when the sign gender is wrong even if sect and horizon are right', () => {
    // Above horizon (200°) but in a feminine sign: use Ascendant placed so 200° lands in Taurus (earth).
    // Ascendant 170°: 200° is 30° past it (above-horizon half starts at ASC+180, so this is NOT above horizon
    // with that ASC) — instead, keep ASC at 0° (so 200° is above horizon) and shift the test sign by picking
    // a longitude in a feminine sign that is still above horizon: 220° = 10° Scorpio (water, feminine).
    expect(isInHayz(jupiter.id, 220, 0, 'day')).toBe(false);
  });

  it('Mercury is never in hayz, under either sect', () => {
    expect(isInHayz(mercury.id, 200, 0, 'day')).toBe(false);
    expect(isInHayz(mercury.id, 200, 0, 'night')).toBe(false);
  });
});

describe('isBesieged (#547)', () => {
  it('is besieged when Mars and Saturn are both within conjunction orb, one on each side', () => {
    // Planet at 100°, Mars at 95° (behind), Saturn at 105° (ahead) — both within the standard major orb.
    expect(isBesieged(100, 95, 105, DEFAULT_ORB_CONFIG)).toBe(true);
  });

  it('is not besieged when both malefics are bunched on the same side', () => {
    expect(isBesieged(100, 95, 94, DEFAULT_ORB_CONFIG)).toBe(false);
  });

  it('is not besieged when one malefic is out of orb', () => {
    expect(isBesieged(100, 95, 150, DEFAULT_ORB_CONFIG)).toBe(false);
  });
});
