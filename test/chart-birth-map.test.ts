/** The PDF's birth-place map (#711), on the real bundled Natural Earth data. */
import { describe, expect, it } from 'vitest';
import { birthMapSvg } from '../src/chart/birth-map.js';
import { BORDERS_50M, LAND_50M } from '../src/chart/pdf-map-data.js';

const DATA = { land: LAND_50M, borders: BORDERS_50M };
const COLORS = {
  sea: '#e6e3f1',
  land: '#f3f1fa',
  coast: '#5c5878',
  border: '#9e98b8',
  pin: '#5b3fd4',
};
const SIZE = { width: 680, height: 300 };

describe('birthMapSvg (#711)', () => {
  it('draws land, borders and an unlabelled pin on the coordinates', () => {
    const map = birthMapSvg(48.8584, 2.2945, DATA, SIZE, COLORS);
    expect(map.markup).toMatch(/<path d="M[^"]+Z/);
    expect(map.markup).toContain('stroke-dasharray="3 2"');
    // The pin sits at the centre of the frame, where the birth coordinates project.
    expect(map.markup).toContain('<circle cx="340.0" cy="150.0"');
    expect(map.markup).not.toContain('<text');
    // Clipped to the frame, not the whole world: a few tens of kB at most.
    expect(map.markup.length).toBeLessThan(120_000);
  });

  it('draws open sea with no land in the frame', () => {
    const ocean = birthMapSvg(-40, -120, DATA, SIZE, COLORS).markup;
    expect(ocean).toContain('<path d=""');
  });
});
