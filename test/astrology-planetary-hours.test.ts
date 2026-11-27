/**
 * #2019: the planetary day and hour follow Lilly (1659, printed p. 356): the first hour of each day belongs to that day's
 * planet, from sunrise, and each later hour goes to the next planet in the Chaldean order. The rule is tested on a
 * Sunday and on the Monday after it, with fixed sunrise and sunset times, so the expected planets are exact.
 */
import { describe, expect, it } from 'vitest';
import { CHALDEAN_HOUR_ORDER, planetaryHourAt } from '../src/astrology/planetary-hours.js';

// Fixed day: sunrise at JD 1000.0, sunset 0.5 day later (12 hours of day), next sunrise 0.5 day after that.
const SUNRISE = 1000;
const SUNSET = 1000.5;
const NEXT_SUNRISE = 1001;
const SUNDAY = 0;
const MONDAY = 1;

function hourAt(moment: number, weekday: number) {
  return planetaryHourAt({
    moment,
    sunrise: SUNRISE,
    sunset: SUNSET,
    nextSunrise: NEXT_SUNRISE,
    sunriseWeekday: weekday,
  });
}

describe('planetary hours from Lilly p. 356', () => {
  it("starts Sunday with the Sun, then Venus, Mercury, Moon, Saturn, Jupiter (Lilly's own example)", () => {
    const hourLength = (SUNSET - SUNRISE) / 12;
    const rulers = [0, 1, 2, 3, 4, 5].map((n) => hourAt(SUNRISE + (n + 0.5) * hourLength, SUNDAY)?.ruler);
    expect(rulers).toEqual(['sun', 'venus', 'mercury', 'moon', 'saturn', 'jupiter']);
  });

  it("starts Monday with the Moon, then Saturn, Jupiter, Mars (Lilly's own example)", () => {
    const hourLength = (SUNSET - SUNRISE) / 12;
    const rulers = [0, 1, 2, 3].map((n) => hourAt(SUNRISE + (n + 0.5) * hourLength, MONDAY)?.ruler);
    expect(rulers).toEqual(['moon', 'saturn', 'jupiter', 'mars']);
  });

  it('gives the planets in the Chaldean order, each day from the day ruler', () => {
    expect(CHALDEAN_HOUR_ORDER).toEqual(['saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon']);
  });

  it('marks the day hours and the night hours, twelve each', () => {
    const day = hourAt(SUNRISE + (SUNSET - SUNRISE) / 24, SUNDAY); // the middle of the first day hour
    const night = hourAt(SUNSET + (NEXT_SUNRISE - SUNSET) / 24, SUNDAY); // the middle of the first night hour
    expect(day?.isDay).toBe(true);
    expect(night?.isDay).toBe(false);
    expect(day?.hourOfPart).toBe(1);
    expect(night?.hourOfPart).toBe(1);
  });

  it('gives each hour a start and an end that cover the day with no gap', () => {
    const hours = Array.from({ length: 24 }, (_, i) => {
      const moment =
        i < 12
          ? SUNRISE + (i + 0.5) * ((SUNSET - SUNRISE) / 12)
          : SUNSET + (i - 12 + 0.5) * ((NEXT_SUNRISE - SUNSET) / 12);
      return hourAt(moment, SUNDAY);
    });
    expect(hours.every((h) => h !== undefined)).toBe(true);
    expect(hours[0]?.start).toBeCloseTo(SUNRISE, 10);
    expect(hours[23]?.end).toBeCloseTo(NEXT_SUNRISE, 10);
  });

  it('returns nothing before sunrise or at and after the next sunrise', () => {
    expect(hourAt(SUNRISE - 0.01, SUNDAY)).toBeUndefined();
    expect(hourAt(NEXT_SUNRISE, SUNDAY)).toBeUndefined();
  });

  it('returns nothing when the inputs are out of order or the weekday is invalid', () => {
    expect(
      planetaryHourAt({ moment: 1000.1, sunrise: 1000, sunset: 999, nextSunrise: 1001, sunriseWeekday: 0 }),
    ).toBeUndefined();
    expect(
      planetaryHourAt({ moment: 1000.1, sunrise: 1000, sunset: 1000.5, nextSunrise: 1001, sunriseWeekday: 9 }),
    ).toBeUndefined();
  });
});
