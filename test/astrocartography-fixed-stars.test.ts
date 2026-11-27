/**
 * Fixed-star lines on the astrocartography map (#2018): the domain option, the renderer and the tooltip words,
 * against the real Swiss Ephemeris engine (no mocks).
 */
import { describe, expect, it } from 'vitest';
import { computeAstrocartography } from '../src/domain/astrocartography.js';
import { renderAcgMapSvg, acgStarEntries, type AcgMapLabels } from '../src/chart/acg-map.js';
import { NATAL_FIXED_STARS, starLookups } from '../src/domain/chart-compute.js';
import { starTooltipOf } from '../src/ui/acg-star-tooltip.js';
import { acgEquivalentRows } from '../src/ui/acg-map-equivalent.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

const STARS = starLookups(undefined).map((star) => ({ key: star.key, id: star.id }));

const LABELS: AcgMapLabels = {
  bodyName: (key) => key,
  kinds: { MC: 'MC', IC: 'IC', AC: 'AC', DC: 'DC' },
  legendKinds: { MC: 'MC', IC: 'IC', AC: 'AC', DC: 'DC', localSpace: 'Local Space' },
  fixedStars: 'Fixed Stars',
};

describe('computeAstrocartography fixedStars option (#2018)', () => {
  it('carries lines for every star in the list and every angle the star has', async () => {
    const engine = await getEngine();
    const result = await computeAstrocartography(NATAL, engine, { fixedStars: STARS });
    expect(result.fixedStarLines?.map((entry) => entry.star)).toEqual([...NATAL_FIXED_STARS]);
    for (const entry of result.fixedStarLines ?? []) {
      const kinds = entry.lines.map((line) => line.kind);
      expect(kinds).toContain('MC');
      expect(kinds).toContain('IC');
      expect(entry.lines.every((line) => line.star === entry.star)).toBe(true);
      expect(entry.declination).toBeGreaterThanOrEqual(-90);
      expect(entry.declination).toBeLessThanOrEqual(90);
    }
    // Regulus is far from either pole: it has all four.
    const regulus = result.fixedStarLines?.find((entry) => entry.star === 'Regulus');
    expect(regulus?.lines.map((line) => line.kind)).toEqual(['MC', 'IC', 'AC', 'DC']);
  });

  it('leaves the planetary lines identical with the option on, empty or absent', async () => {
    const engine = await getEngine();
    const absent = await computeAstrocartography(NATAL, engine);
    const empty = await computeAstrocartography(NATAL, engine, { fixedStars: [] });
    const on = await computeAstrocartography(NATAL, engine, { fixedStars: STARS });
    expect(absent.fixedStarLines).toBeUndefined();
    expect(empty.fixedStarLines).toBeUndefined();
    expect(JSON.stringify(empty)).toBe(JSON.stringify(absent));
    expect(JSON.stringify(on.lines)).toBe(JSON.stringify(absent.lines));
    expect(JSON.stringify(on.localSpaceLines)).toBe(JSON.stringify(absent.localSpaceLines));
  });
});

describe('the map with fixed stars (#2018)', () => {
  it('draws the planetary map byte-identically when no star lines are given', async () => {
    const engine = await getEngine();
    const absent = await computeAstrocartography(NATAL, engine);
    const empty = await computeAstrocartography(NATAL, engine, { fixedStars: [] });
    const a = renderAcgMapSvg(
      { lines: absent.lines, localSpaceLines: absent.localSpaceLines, natalPlace: absent.natalPlace },
      { labels: LABELS },
    );
    const b = renderAcgMapSvg(
      { lines: empty.lines, localSpaceLines: empty.localSpaceLines, natalPlace: empty.natalPlace },
      { labels: LABELS },
    );
    expect(b.markup).toBe(a.markup);
    expect(a.markup).not.toContain('acg-star');
  });

  it('draws star lines dashed, labelled "<Star> <angle>", with the planetary names placed as before', async () => {
    const engine = await getEngine();
    const data = await computeAstrocartography(NATAL, engine, { fixedStars: STARS });
    const base = { lines: data.lines, localSpaceLines: data.localSpaceLines, natalPlace: data.natalPlace };
    const without = renderAcgMapSvg(base, { labels: LABELS });
    const withStars = renderAcgMapSvg(
      { ...base, ...(data.fixedStarLines === undefined ? {} : { fixedStarLines: data.fixedStarLines }) },
      { labels: LABELS },
    );
    expect(withStars.markup).toContain('class="acg-star-line"');
    expect(withStars.markup).toContain('data-star="Regulus" data-angle="MC"');
    expect(withStars.markup).toMatch(/>(Regulus|Spica|Sirius) (MC|IC|AC|DC)<\/text>/);
    // Every planetary label in the base map is still in the map with stars.
    for (const label of without.markup.match(/<text[^>]*acg-label[^>]*>[^<]*<\/text>/g) ?? []) {
      expect(withStars.markup).toContain(label);
    }
    expect(withStars.markup).toContain('Fixed Stars');
  });

  it('gives each star line a tooltip of name, angle, right ascension and declination, and no orb or distance', async () => {
    const engine = await getEngine();
    const data = await computeAstrocartography(NATAL, engine, { fixedStars: STARS });
    const input = {
      lines: data.lines,
      localSpaceLines: data.localSpaceLines,
      natalPlace: data.natalPlace,
      ...(data.fixedStarLines === undefined ? {} : { fixedStarLines: data.fixedStarLines }),
    };
    const tip = starTooltipOf(input, 'Regulus', 'AC', 'en');
    expect(tip?.title).toBe('Regulus AC');
    expect(tip?.position).toMatch(/^RA \d+\.\d{2}° · Dec -?\d+\.\d{2}°$/);
    expect(starTooltipOf(input, 'Regulus', 'AC', 'nl')?.position).toMatch(/^RA .* · Decl\. /);
    expect(`${tip?.title ?? ''} ${tip?.position ?? ''}`.toLowerCase()).not.toMatch(/orb|distance|afstand/);
    expect(starTooltipOf(input, 'Nobody', 'MC', 'en')).toBeUndefined();
    expect(starTooltipOf(input, 'Regulus', 'XX', 'en')).toBeUndefined();
    expect(acgStarEntries(input)).toHaveLength(
      (data.fixedStarLines ?? []).reduce((sum, entry) => sum + entry.lines.length, 0),
    );
    // The text equivalent lists the star lines too.
    expect(acgEquivalentRows(input, 'en').some((row) => row.body === 'Regulus' && row.shownAs.endsWith('MC'))).toBe(
      true,
    );
  });
});
