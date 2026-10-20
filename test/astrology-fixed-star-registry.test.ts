import { describe, expect, it } from 'vitest';
import {
  REGISTRY_EPOCH_JULIAN_DAY,
  YEMEN_FIXED_STARS,
  YEMEN_STAR_AUTHORITY,
  normaliseStarQuery,
  precessedLongitude,
  registryLongitude,
  searchYemenStars,
  yearsSinceEpoch,
  yemenStarLongitudes,
  type RegistryStar,
} from '../src/astrology/fixed-star-registry.js';

function byId(id: string): RegistryStar {
  const star = YEMEN_FIXED_STARS.find((s) => s.id === id);
  if (!star) throw new Error(`test fixture bug: no registry star with id "${id}"`);
  return star;
}

describe('YEMEN_FIXED_STARS (#739)', () => {
  it('has 66 printed rows', () => {
    expect(YEMEN_FIXED_STARS).toHaveLength(66);
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

  it("does not have '33c' as a separate entry id", () => {
    expect(YEMEN_FIXED_STARS.some((s) => s.id === '33c')).toBe(false);
  });

  it("places 33 at Virgo 16;15 and carries '33c' as a variant at 17;01", () => {
    const star = byId('33');
    expect(star.signIndex).toBe(5);
    expect(star.degree).toBe(16);
    expect(star.minute).toBe(15);
    expect(registryLongitude(star)).toBeCloseTo(166.25, 3);
    expect(star.variantLongitudes).toHaveLength(1);
    const variant = star.variantLongitudes[0];
    expect(variant?.id).toBe('33c');
    expect(variant?.degree).toBe(17);
    expect(variant?.minute).toBe(1);
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
  it('maps all 66 ids', () => {
    expect(yemenStarLongitudes().size).toBe(66);
  });

  it('gives star 1 the longitude of Aries 5;01', () => {
    const longitude = yemenStarLongitudes().get('1');
    expect(longitude).toBeCloseTo(5 + 1 / 60, 3);
  });

  it('leaves star 1 unchanged when no julianDay is given', () => {
    expect(yemenStarLongitudes().get('1')).toBeCloseTo(5.01667, 4);
  });

  it('returns the printed longitude at zero years since epoch', () => {
    expect(yemenStarLongitudes(REGISTRY_EPOCH_JULIAN_DAY).get('1')).toBe(yemenStarLongitudes().get('1'));
  });

  it('precesses star 1 by 100 years when given a julianDay 100 Julian years after epoch', () => {
    const printed = yemenStarLongitudes().get('1') ?? NaN;
    const precessed = yemenStarLongitudes(REGISTRY_EPOCH_JULIAN_DAY + 365.25 * 100).get('1') ?? NaN;
    const expected = (printed + (100 * 5029.0966) / 3600 / 100) % 360;
    expect(precessed % 360).toBeCloseTo(expected, 6);
  });
});

describe('precession helpers (#739)', () => {
  it('returns the same longitude for zero years', () => {
    expect(precessedLongitude(10, 0)).toBe(10);
  });

  it('shifts a longitude by years times the general precession rate', () => {
    expect(precessedLongitude(10, 66)).toBeCloseTo(10 + (66 * 5029.0966) / 3600 / 100, 6);
  });

  it('normalises the result into [0, 360)', () => {
    const result = precessedLongitude(359, 1000);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(360);
  });

  it('the epoch is 10 January 1262 Julian, 0h', () => {
    expect(REGISTRY_EPOCH_JULIAN_DAY).toBe(2182012.5);
  });

  it('measures one Julian year as 365.25 days', () => {
    expect(yearsSinceEpoch(REGISTRY_EPOCH_JULIAN_DAY + 365.25)).toBeCloseTo(1, 6);
  });
});

describe('YEMEN_STAR_AUTHORITY (#739)', () => {
  it('states the work, the precession and the epoch', () => {
    expect(YEMEN_STAR_AUTHORITY).toContain('Muẓaffarī');
    expect(YEMEN_STAR_AUTHORITY).toContain('17;11');
    expect(YEMEN_STAR_AUTHORITY).toContain('631 Yazdijird');
  });
});

describe('searchYemenStars (#739)', () => {
  it('normalises diacritics and case', () => {
    expect(normaliseStarQuery('Muẓaffarī')).toBe('muzaffari');
  });

  it('trims and collapses whitespace', () => {
    expect(normaliseStarQuery('  Surrat   al-Faras ')).toBe('surrat al-faras');
  });

  it('returns nothing for an empty query', () => {
    expect(searchYemenStars('')).toEqual([]);
  });

  it('returns nothing for a blank query', () => {
    expect(searchYemenStars('   ')).toEqual([]);
  });

  it('finds star 1 by its Arabic name', () => {
    const ids = searchYemenStars('surrat al-faras').map((s) => s.id);
    expect(ids).toContain('1');
  });

  it('finds exactly star 1 by its Peters-Knobel number', () => {
    const results = searchYemenStars(byId('1').peters_knobel);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('1');
  });

  it('finds star 1 by its modern id', () => {
    const modernId = byId('1').modernId;
    expect(modernId).toBe('α And');
    const ids = searchYemenStars(modernId ?? '').map((s) => s.id);
    expect(ids).toContain('1');
  });

  it('returns nothing for an unknown name', () => {
    expect(searchYemenStars('no-such-star-xyz')).toEqual([]);
  });

  it('returns a subset of the table in printed order', () => {
    const results = searchYemenStars('al-');
    expect(results.length).toBeGreaterThan(0);
    let previous = -1;
    for (const star of results) {
      const index = YEMEN_FIXED_STARS.indexOf(star);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
  });
});
