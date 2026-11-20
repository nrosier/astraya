import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FORTUNE_FORMULA,
  lotFormulaByKey,
  lotFormulaFor,
  partOfFortune,
  partOfSpirit,
} from '../src/astrology/arabic-parts.js';

// Hand-picked longitudes, no ephemeris: Ascendant 100, Sun 10, Moon 70.
const asc = 100;
const sun = 10;
const moon = 70;

describe('Part of Fortune formula choice (#1794)', () => {
  it('defaults to the sect-reversed (Paulus) formula', () => {
    expect(DEFAULT_FORTUNE_FORMULA).toBe('sect-reversed');
  });

  it('a day chart gives the same Fortune under both formulas (Asc + Moon - Sun = 160)', () => {
    expect(partOfFortune('day', asc, sun, moon, 'sect-reversed')).toBe(160);
    expect(partOfFortune('day', asc, sun, moon, 'same-day-and-night')).toBe(160);
  });

  it('a night chart differs: sect-reversed gives Asc + Sun - Moon = 40, the modern formula gives Asc + Moon - Sun = 160', () => {
    expect(partOfFortune('night', asc, sun, moon, 'sect-reversed')).toBe(40);
    expect(partOfFortune('night', asc, sun, moon, 'same-day-and-night')).toBe(160);
  });

  it('the default argument is the sect-reversed formula', () => {
    expect(partOfFortune('night', asc, sun, moon)).toBe(40);
    expect(partOfFortune('day', asc, sun, moon)).toBe(160);
  });

  it('Spirit mirrors Fortune: sect-reversed day 40 / night 160; modern is 40 by day and night', () => {
    expect(partOfSpirit('day', asc, sun, moon, 'sect-reversed')).toBe(40);
    expect(partOfSpirit('night', asc, sun, moon, 'sect-reversed')).toBe(160);
    expect(partOfSpirit('day', asc, sun, moon, 'same-day-and-night')).toBe(40);
    expect(partOfSpirit('night', asc, sun, moon, 'same-day-and-night')).toBe(40);
  });

  it('lotFormulaFor: the modern formula shows equal day and night text for Fortune and Spirit', () => {
    const fortune = lotFormulaFor('part-of-fortune', 'same-day-and-night');
    const spirit = lotFormulaFor('part-of-spirit', 'same-day-and-night');
    expect(fortune?.dayFormula).toBe('Ascendant + Moon − Sun');
    expect(fortune?.nightFormula).toBe(fortune?.dayFormula);
    expect(fortune?.reversesBySect).toBe(false);
    expect(fortune?.authority).toMatch(/Marr/);
    expect(spirit?.dayFormula).toBe('Ascendant + Sun − Moon');
    expect(spirit?.nightFormula).toBe(spirit?.dayFormula);
    expect(spirit?.reversesBySect).toBe(false);
  });

  it('lotFormulaFor: the sect-reversed formula returns the unchanged LOT_FORMULAS entry for Fortune and Spirit', () => {
    expect(lotFormulaFor('part-of-fortune', 'sect-reversed')).toBe(lotFormulaByKey('part-of-fortune'));
    expect(lotFormulaFor('part-of-spirit', 'sect-reversed')).toBe(lotFormulaByKey('part-of-spirit'));
  });

  it('lotFormulaFor: other keys are unchanged under either formula', () => {
    expect(lotFormulaFor('lot-of-eros', 'same-day-and-night')).toBe(lotFormulaByKey('lot-of-eros'));
    expect(lotFormulaFor('lot-of-nemesis', 'same-day-and-night')).toBe(lotFormulaByKey('lot-of-nemesis'));
    expect(lotFormulaFor('asc-mc-midpoint', 'same-day-and-night')).toBeUndefined();
  });
});
