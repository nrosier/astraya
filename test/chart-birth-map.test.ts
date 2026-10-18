/** The PDF's birth-place map (#711), on the real bundled Natural Earth data. */
import { describe, expect, it } from 'vitest';
import { birthMapSvg, nearestPlace } from '../src/chart/birth-map.js';
import { BORDERS_50M, LAND_50M, PLACES_10M } from '../src/chart/pdf-map-data.js';

const DATA = { land: LAND_50M, borders: BORDERS_50M, places: PLACES_10M };
const COLORS = {
  sea: '#e6e3f1',
  land: '#f3f1fa',
  coast: '#5c5878',
  border: '#9e98b8',
  pin: '#5b3fd4',
  ink: '#16152b',
  muted: '#5c5878',
};
const LABELS = { near: (town: string) => `near ${town}`, coordinates: 'x°N, y°E' };
const SIZE = { width: 680, height: 300 };

describe('nearestPlace (#711)', () => {
  it('finds the town a street address is in', () => {
    // An address by the Eiffel Tower.
    expect(nearestPlace(48.8584, 2.2945, PLACES_10M)?.place.name).toBe('Paris');
    expect(nearestPlace(51.5072, -0.1276, PLACES_10M)?.km).toBeLessThan(5);
  });
});

describe('birthMapSvg (#711)', () => {
  it('draws land, borders and a pin labelled with the town, never anything finer', () => {
    const map = birthMapSvg(48.8584, 2.2945, DATA, LABELS, SIZE, COLORS);
    expect(map.markup).toContain('>Paris</text>');
    expect(map.markup).toMatch(/<path d="M[^"]+Z/);
    expect(map.markup).toContain('stroke-dasharray="3 2"');
    expect(map.markup).toContain('<circle');
    // Clipped to the frame, not the whole world: a few tens of kB at most.
    expect(map.markup.length).toBeLessThan(120_000);
  });

  it('says "near" a town 15 to 40 km away, and gives only coordinates further out', () => {
    // Giethoorn, a Dutch village about 24 km from Zwolle.
    expect(birthMapSvg(52.7395, 6.0779, DATA, LABELS, SIZE, COLORS).markup).toContain('>near Zwolle</text>');
    // Vevay, Indiana: the nearest listed town is about 60 km away.
    const far = birthMapSvg(38.7478, -85.0672, DATA, LABELS, SIZE, COLORS).markup;
    expect(far).not.toContain('near ');
    expect(far).toContain('>x°N, y°E</text>');
  });

  it('draws open sea with no land in the frame', () => {
    const ocean = birthMapSvg(-40, -120, DATA, LABELS, SIZE, COLORS).markup;
    expect(ocean).toContain('<path d=""');
  });
});
