import { describe, expect, it } from 'vitest';
import {
  YEMEN_FIXED_STARS,
  YEMEN_STAR_AUTHORITY,
  registryLongitude,
  yemenStarLongitudes,
  type RegistryStar,
} from '../src/astrology/fixed-star-registry.js';

function byId(id: string): RegistryStar {
  const star = YEMEN_FIXED_STARS.find((s) => s.id === id);
  if (!star) throw new Error(`test fixture bug: no registry star with id "${id}"`);
  return star;
}

describe('YEMEN_FIXED_STARS (#739)', () => {
  it('has 67 printed rows', () => {
    expect(YEMEN_FIXED_STARS).toHaveLength(67);
  });

  it('has unique ids', () => {
    const ids = YEMEN_FIXED_STARS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('excludes ids 28a and 64', () => {
    const ids = new Set(YEMEN_FIXED_STARS.map((s) => s.id));
    expect(ids.has('28a')).toBe(false);
    expect(ids.has('64')).toBe(false);
  });

  it('includes 33c at Virgo 17;01', () => {
    const star = byId('33c');
    expect(star.signIndex).toBe(5);
    expect(star.degree).toBe(17);
    expect(star.minute).toBe(1);
    expect(registryLongitude(star)).toBeCloseTo(167.0167, 3);
  });

  it('places 33 at Virgo 16;15', () => {
    const star = byId('33');
    expect(star.signIndex).toBe(5);
    expect(star.degree).toBe(16);
    expect(star.minute).toBe(15);
    expect(registryLongitude(star)).toBeCloseTo(166.25, 3);
  });

  it('keeps every degree in 0..29 and every minute in 0..59', () => {
    for (const star of YEMEN_FIXED_STARS) {
      expect(star.degree).toBeGreaterThanOrEqual(0);
      expect(star.degree).toBeLessThan(30);
      expect(star.minute).toBeGreaterThanOrEqual(0);
      expect(star.minute).toBeLessThan(60);
    }
  });

  it('uses integer sign indices from 0 to 11', () => {
    for (const star of YEMEN_FIXED_STARS) {
      expect(Number.isInteger(star.signIndex)).toBe(true);
      expect(star.signIndex).toBeGreaterThanOrEqual(0);
      expect(star.signIndex).toBeLessThanOrEqual(11);
    }
  });

  it('records star 1 temperaments as Mars-Mercury', () => {
    expect(byId('1').temperaments).toEqual([['Mars', 'Mercury']]);
  });

  it('records no temperaments for 33c', () => {
    expect(byId('33c').temperaments).toEqual([]);
  });

  it('has exactly 18 entries with more than one temperament pair', () => {
    const multi = YEMEN_FIXED_STARS.filter((s) => s.temperaments.length > 1);
    expect(multi).toHaveLength(18);
  });

  it('keeps the bracketed sign of star 32 as printed', () => {
    const star = byId('32');
    expect(star.signPrinted).toBe('(Gem)');
    expect(star.signIndex).toBe(2);
  });

  it('keeps the latitude of star 6 as printed, with no hemisphere inferred', () => {
    const star = byId('6');
    expect(star.latitudeText).toBe('7;20 (N)');
    expect(star.latitudeHemisphere).toBeNull();
  });
});

describe('yemenStarLongitudes (#739)', () => {
  it('maps all 67 ids', () => {
    expect(yemenStarLongitudes().size).toBe(67);
  });

  it('gives star 1 the longitude of Aries 5;01', () => {
    const longitude = yemenStarLongitudes().get('1');
    expect(longitude).toBeCloseTo(5 + 1 / 60, 3);
  });
});

describe('YEMEN_STAR_AUTHORITY (#739)', () => {
  it('states the work, the precession and the epoch', () => {
    expect(YEMEN_STAR_AUTHORITY).toContain('Muẓaffarī');
    expect(YEMEN_STAR_AUTHORITY).toContain('17;11');
    expect(YEMEN_STAR_AUTHORITY).toContain('631 Yazdijird');
  });
});
