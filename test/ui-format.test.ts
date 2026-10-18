import { describe, expect, it } from 'vitest';
import {
  formatCents,
  formatCoordinate,
  formatDecimal,
  formatFixed,
  formatInteger,
  formatSignDegree,
  formatTimestamp,
  todayInputValue,
  utcDay,
} from '../src/ui/format.js';

describe('todayInputValue', () => {
  it('matches the visitor-local calendar date in yyyy-mm-dd form', () => {
    const now = new Date();
    const year = String(now.getFullYear()).padStart(4, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    expect(todayInputValue()).toBe(`${year}-${month}-${day}`);
  });
});

describe('formatCoordinate', () => {
  it('marks a positive latitude North and a positive longitude East, in en', () => {
    expect(formatCoordinate(51.5, 'lat', 'en')).toBe('51.50°N');
    expect(formatCoordinate(4.9, 'lon', 'en')).toBe('4.90°E');
  });

  it('marks a negative latitude South and a negative longitude West, in en', () => {
    expect(formatCoordinate(-33.87, 'lat', 'en')).toBe('33.87°S');
    expect(formatCoordinate(-0.12, 'lon', 'en')).toBe('0.12°W');
  });

  it('uses Dutch hemisphere letters (Z for South, O for East) and a comma decimal separator', () => {
    expect(formatCoordinate(51.5, 'lat', 'nl')).toBe('51,50°N');
    expect(formatCoordinate(4.9, 'lon', 'nl')).toBe('4,90°O');
    expect(formatCoordinate(-33.87, 'lat', 'nl')).toBe('33,87°Z');
    expect(formatCoordinate(-0.12, 'lon', 'nl')).toBe('0,12°W');
  });

  it('always prints a magnitude, never a signed number', () => {
    expect(formatCoordinate(-0, 'lat', 'en')).toBe('0.00°N');
  });
});

describe('formatFixed', () => {
  it('always uses a point and the asked number of decimals, in every language', () => {
    expect(formatFixed(2.875, 2)).toBe('2.88');
    expect(formatFixed(10, 2)).toBe('10.00');
    expect(formatFixed(0.5, 0)).toMatch(/^[01]$/);
  });

  it('never shows a minus sign on a zero', () => {
    expect(formatFixed(-0.001, 2)).toBe('0.00');
    expect(formatFixed(-0.4, 0)).toBe('0');
    expect(formatFixed(-0.01, 2)).toBe('-0.01');
  });
});

describe('formatDecimal and formatInteger', () => {
  it('follow the reader’s own notation', () => {
    expect(formatDecimal(6.34, 1, 'en')).toBe('6.3');
    expect(formatDecimal(6.34, 1, 'nl')).toBe('6,3');
    expect(formatInteger(1234567, 'en')).toBe('1,234,567');
    expect(formatInteger(1234567, 'nl')).toBe('1.234.567');
  });
});

describe('formatCents', () => {
  it('names dollars once, with the reader’s grouping', () => {
    expect(formatCents(1234, 'en')).toBe('$12.34');
    expect(formatCents(5, 'en')).toBe('$0.05');
    expect(formatCents(1234, 'nl')).toMatch(/12,34/);
  });
});

describe('formatTimestamp and utcDay', () => {
  it('writes an instant in a fixed shape, whatever the browser’s locale', () => {
    expect(formatTimestamp(new Date(2026, 9, 11, 21, 5))).toBe('2026-10-11 21:05');
    expect(formatTimestamp(new Date(2026, 0, 2, 3, 4).toISOString())).toBe('2026-01-02 03:04');
  });

  it('hands back text it cannot read, rather than "NaN"', () => {
    expect(formatTimestamp('never')).toBe('never');
  });

  it('stamps the UTC day', () => {
    expect(utcDay(new Date(Date.UTC(2026, 9, 11, 23, 59)))).toBe('2026-10-11');
  });
});

describe('formatSignDegree (#654)', () => {
  it('writes a position within a sign as degrees and two-digit minutes, in every language alike', () => {
    expect(formatSignDegree(21 + 46 / 60)).toBe('21°46′');
    expect(formatSignDegree(24 + 22 / 60)).toBe('24°22′');
    expect(formatSignDegree(5 + 3 / 60)).toBe('5°03′');
  });

  it('shows the whole degree, dropping the seconds rather than rounding them into the next minute', () => {
    expect(formatSignDegree(0)).toBe('0°00′');
    expect(formatSignDegree(29 + 59 / 60 + 59 / 3600)).toBe('29°59′');
  });
});
