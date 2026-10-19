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
  isStationWindowK,
  isWithinStationWindow,
  MEAN_DAILY_SPEED,
  meanDailySpeedOf,
  motionOf,
  motionScoreOf,
  NOCTURNAL_PLANETS,
  sectAlignmentOf,
  STATION_WINDOW_DEFAULT_K,
  stationTypeOf,
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

/** Degrees, minutes, seconds of arc to decimal degrees, written independently of the module's own helper. */
function arc(degrees: number, minutes: number, seconds: number): number {
  return degrees + minutes / 60 + seconds / 3600;
}

/** The id of a body that is always in BODIES, by key; throws on a typo rather than guessing. */
function idOfKey(key: string): number {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`fixture bug: no body "${key}"`);
  return body.id;
}

describe('MEAN_DAILY_SPEED (#724, Avelar & Ribeiro 2010, pp. 59-60)', () => {
  it('converts the printed table exactly from degrees, minutes and seconds', () => {
    expect(meanDailySpeedOf(idOfKey('sun'))).toBeCloseTo(arc(0, 59, 8), 12);
    expect(meanDailySpeedOf(idOfKey('moon'))).toBeCloseTo(arc(13, 10, 36), 12);
    expect(meanDailySpeedOf(idOfKey('mercury'))).toBeCloseTo(arc(0, 59, 8), 12);
    expect(meanDailySpeedOf(idOfKey('venus'))).toBeCloseTo(arc(0, 59, 8), 12);
    expect(meanDailySpeedOf(idOfKey('mars'))).toBeCloseTo(arc(0, 31, 27), 12);
    expect(meanDailySpeedOf(idOfKey('jupiter'))).toBeCloseTo(arc(0, 4, 59), 12);
    expect(meanDailySpeedOf(idOfKey('saturn'))).toBeCloseTo(arc(0, 2, 1), 12);
  });

  it('gives Uranus, Neptune and Pluto a modern figure of 360 over the sidereal period, and no figure for other bodies', () => {
    expect(MEAN_DAILY_SPEED.uranus).toBeCloseTo(360 / 30688.5, 12);
    expect(MEAN_DAILY_SPEED.neptune).toBeCloseTo(360 / 60182, 12);
    expect(MEAN_DAILY_SPEED.pluto).toBeCloseTo(360 / 90560, 12);
    expect(meanDailySpeedOf(idOfKey('chiron'))).toBeUndefined();
    expect(meanDailySpeedOf(idOfKey('meanNode'))).toBeUndefined();
  });
});

describe('isStationWindowK (#724)', () => {
  it('accepts finite fractions greater than zero and at most one, and rejects everything else', () => {
    expect(isStationWindowK(STATION_WINDOW_DEFAULT_K)).toBe(true);
    expect(isStationWindowK(1)).toBe(true);
    expect(isStationWindowK(0.0001)).toBe(true);
    expect(isStationWindowK(0)).toBe(false);
    expect(isStationWindowK(-0.05)).toBe(false);
    expect(isStationWindowK(1.0001)).toBe(false);
    expect(isStationWindowK(Number.NaN)).toBe(false);
    expect(isStationWindowK(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isStationWindowK('0.05')).toBe(false);
    expect(isStationWindowK(undefined)).toBe(false);
  });

  it('defaults to 0.05', () => {
    expect(STATION_WINDOW_DEFAULT_K).toBe(0.05);
  });
});

describe('isWithinStationWindow (#724): |speed| <= k * mean, inclusive at the boundary', () => {
  const k = 0.05;
  const mercury = idOfKey('mercury');
  const mean = arc(0, 59, 8);
  const edge = k * mean;

  it('is inside exactly at the boundary, and outside a hair beyond it, for each eligible planet', () => {
    const eligible = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'] as const;
    for (const key of eligible) {
      const id = bodyByKey(key)?.id ?? -1;
      const boundary = k * (MEAN_DAILY_SPEED[key] ?? Number.NaN);
      expect(isWithinStationWindow(id, boundary, k), `${key} at the boundary`).toBe(true);
      expect(isWithinStationWindow(id, -boundary, k), `${key} at the negative boundary`).toBe(true);
      expect(isWithinStationWindow(id, boundary * (1 + 1e-9), k), `${key} just outside`).toBe(false);
      expect(isWithinStationWindow(id, 0, k), `${key} at rest`).toBe(true);
    }
  });

  it('uses the body mean, so the same fraction gives a different edge for Mercury and for Saturn', () => {
    expect(isWithinStationWindow(mercury, edge, k)).toBe(true);
    expect(isWithinStationWindow(mercury, edge * 1.001, k)).toBe(false);
    const saturn = idOfKey('saturn');
    expect(isWithinStationWindow(saturn, edge, k)).toBe(false);
    expect(isWithinStationWindow(saturn, arc(0, 2, 1) * k, k)).toBe(true);
  });

  it('never applies to the Sun, the Moon, nodes, Lilith, Chiron or the asteroids', () => {
    for (const key of ['sun', 'moon', 'meanNode', 'trueNode', 'meanLilith', 'chiron', 'ceres']) {
      const id = bodyByKey(key)?.id ?? -1;
      expect(isWithinStationWindow(id, 0, 1), key).toBe(false);
    }
  });
});

describe('stationTypeOf (#724): the sign of the longitude acceleration', () => {
  it('is first when the speed falls through zero (negative acceleration), second when it rises (positive)', () => {
    expect(stationTypeOf(-0.001)).toBe('first');
    expect(stationTypeOf(0.001)).toBe('second');
  });

  it('is undefined at exactly zero acceleration, so no station type is guessed', () => {
    expect(stationTypeOf(0)).toBeUndefined();
  });
});

describe('motionScoreOf (#724, A&R p. 197)', () => {
  const mercury = idOfKey('mercury');
  const venus = idOfKey('venus');
  const mercuryMean = MEAN_DAILY_SPEED.mercury ?? Number.NaN;

  it('scores a direct planet +4 and a retrograde one -5, before the velocity points', () => {
    // Speed well above the mean (fast, +2): direct +4 +2, retrograde -5 +2.
    expect(motionScoreOf(mercury, 2, false, undefined)).toBe(6);
    expect(motionScoreOf(mercury, -2, false, undefined)).toBe(-3);
  });

  it('gives the velocity points against the mean speed, +2 fast and -2 slow', () => {
    expect(motionScoreOf(mercury, mercuryMean * 1.5, false, undefined)).toBe(4 + 2);
    expect(motionScoreOf(mercury, mercuryMean * 0.5, false, undefined)).toBe(4 - 2);
    expect(motionScoreOf(mercury, -mercuryMean * 1.5, false, undefined)).toBe(-5 + 2);
    expect(motionScoreOf(mercury, -mercuryMean * 0.5, false, undefined)).toBe(-5 - 2);
  });

  it('scores no velocity points for a planet exactly at its mean speed', () => {
    expect(motionScoreOf(mercury, mercuryMean, false, undefined)).toBe(4);
    expect(motionScoreOf(mercury, -mercuryMean, false, undefined)).toBe(-5);
  });

  it('scores a first station as retrograde (-5) and a second station as direct (+4), with its own velocity points', () => {
    // Stationary, so the speed is inside the window: slow (-2) relative to the mean.
    expect(motionScoreOf(mercury, 0, true, 'first')).toBe(-5 - 2);
    expect(motionScoreOf(mercury, 0, true, 'second')).toBe(4 - 2);
  });

  it('gives no score for a stationary planet whose station type is unknown, rather than guessing one', () => {
    expect(motionScoreOf(mercury, 0, true, undefined)).toBeUndefined();
  });

  it('gives the Sun and Moon the velocity points only, never a direction score (the user decided)', () => {
    const sun = idOfKey('sun');
    const moon = idOfKey('moon');
    const sunMean = MEAN_DAILY_SPEED.sun ?? Number.NaN;
    const moonMean = MEAN_DAILY_SPEED.moon ?? Number.NaN;
    expect(motionScoreOf(sun, sunMean * 1.2, false, undefined)).toBe(2);
    expect(motionScoreOf(sun, sunMean * 0.8, false, undefined)).toBe(-2);
    expect(motionScoreOf(moon, moonMean * 1.2, false, undefined)).toBe(2);
  });

  it('gives no score at all to Uranus, Neptune or Pluto, which show station state only', () => {
    for (const key of ['uranus', 'neptune', 'pluto']) {
      const id = bodyByKey(key)?.id ?? -1;
      expect(motionScoreOf(id, 1, false, undefined), key).toBeUndefined();
      expect(motionScoreOf(id, 0, true, 'first'), key).toBeUndefined();
    }
  });

  it('gives no score to a body outside the seven traditional planets', () => {
    expect(motionScoreOf(idOfKey('chiron'), 1, false, undefined)).toBeUndefined();
  });

  it('gives no score to a non-stationary planet whose speed is exactly zero (the window off, at rest)', () => {
    expect(motionScoreOf(venus, 0, false, undefined)).toBeUndefined();
  });
});
