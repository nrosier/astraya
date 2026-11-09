/**
 * #1371 — the Astrocartography map's text equivalent. `acgMapEntries`/`acgMapPlaces` describe the lines and markers
 * `renderAcgMapSvg` draws, and `acgEquivalentRows` turns them into the table on screen. Runs on the real Swiss
 * Ephemeris (no mocks) for one fixed chart and checks that:
 *   (a) every entry matches a stroke the map draws, and every stroke has an entry;
 *   (b) turning a line type or a body off removes exactly its entries, as it removes its strokes;
 *   (c) setting a relocation place adds its marker row, and clearing it removes it again.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { acgMapEntries, acgMapPlaces, renderAcgMapSvg, type AcgMapInput } from '../src/chart/acg-map.js';
import {
  computeAstrocartography,
  TRADITIONAL_ACG_BODY_IDS,
  type AstrocartographyOptions,
} from '../src/domain/astrocartography.js';
import { SE } from '../src/ephemeris/generated-constants.js';
import type { EphemerisProvider, GeoPosition } from '../src/ephemeris/types.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { acgEquivalentRows } from '../src/ui/acg-map-equivalent.js';
import { getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

const PARIS: GeoPosition = { latitude: 48.85, longitude: 2.35, altitude: 0 };

let engine: EphemerisProvider;

beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

async function inputFor(options: AstrocartographyOptions = {}): Promise<AcgMapInput> {
  const data = await computeAstrocartography(NATAL, engine, options);
  return {
    lines: data.lines,
    localSpaceLines: data.localSpaceLines,
    natalPlace: data.natalPlace,
    ...(options.relocationPlace === undefined ? {} : { relocationPlace: options.relocationPlace }),
  };
}

/** The strokes the map draws for one line class: `[element, body key]` per stroke. Legend strokes have their own classes. */
function strokes(
  markup: string,
  kindClass: string,
): readonly { readonly tag: string; readonly attrs: string; readonly key: string }[] {
  const pattern = new RegExp(`<(line|polyline) ([^>]*)class="${kindClass} ${kindClass}-([a-z]+)"`, 'g');
  return [...markup.matchAll(pattern)].map((match) => ({
    tag: match[1] ?? '',
    attrs: match[2] ?? '',
    key: match[3] ?? '',
  }));
}

const WIDTH = 900;
const fmt = (value: number): string => value.toFixed(2);
const projectX = (longitude: number): number => ((longitude + 180) / 360) * WIDTH;
const projectY = (latitude: number): number => ((90 - latitude) / 180) * (WIDTH / 2);

describe('acgMapEntries matches the drawn map (#1371)', () => {
  it('(a) has one entry per drawn MC/IC line at the drawn longitude, and per AC/DC curve through its drawn points', async () => {
    const input = await inputFor({ localSpace: true });
    const { markup } = renderAcgMapSvg(input, { width: WIDTH });
    const entries = acgMapEntries(input);

    for (const kind of ['MC', 'IC'] as const) {
      const drawn = strokes(markup, `acg-line-${kind.toLowerCase()}`);
      const listed = entries.filter((entry) => entry.kind === kind);
      expect(listed).toHaveLength(TRADITIONAL_ACG_BODY_IDS.length);
      expect(listed.map((entry) => entry.bodyKey)).toEqual(drawn.map((stroke) => stroke.key));
      for (const [index, entry] of listed.entries()) {
        if (entry.kind !== kind) throw new Error('unreachable');
        expect(drawn[index]?.attrs).toContain(`x1="${fmt(projectX(entry.longitude))}"`);
      }
    }

    for (const kind of ['AC', 'DC'] as const) {
      const drawn = strokes(markup, `acg-line-${kind.toLowerCase()}`);
      const listed = entries.filter((entry) => entry.kind === kind);
      expect(listed).toHaveLength(TRADITIONAL_ACG_BODY_IDS.length);
      // Every drawn polyline belongs to a listed body, and every listed body is drawn.
      expect(new Set(drawn.map((stroke) => stroke.key))).toEqual(new Set(listed.map((entry) => entry.bodyKey)));
      for (const entry of listed) {
        if (entry.kind !== kind) throw new Error('unreachable');
        expect(entry.spans.length).toBeGreaterThan(0);
        expect(entry.crossings.length).toBeGreaterThan(0);
        const points = drawn
          .filter((stroke) => stroke.key === entry.bodyKey)
          .map((stroke) => stroke.attrs)
          .join(' ');
        // Each reported crossing is a vertex of the body's drawn curve.
        for (const crossing of entry.crossings) {
          expect(points).toContain(`${fmt(projectX(crossing.longitude))},${fmt(projectY(crossing.latitude))}`);
        }
      }
    }

    const localSpace = entries.filter((entry) => entry.kind === 'localSpace');
    expect(localSpace).toHaveLength(input.localSpaceLines.length);
    for (const entry of localSpace) {
      if (entry.kind !== 'localSpace') throw new Error('unreachable');
      expect(markup).toContain(`acg-line-local-space-${entry.bodyKey}`);
      expect(entry.origin.latitude).toBeCloseTo(NATAL.coordinates.latitude, 9);
      expect(entry.origin.longitude).toBeCloseTo(NATAL.coordinates.longitude, 9);
      expect(entry.reverseAzimuth).toBeCloseTo((entry.azimuth + 180) % 360, 9);
    }
  });

  it('(a) gives the table one row per entry plus the birthplace, with each line named by body and type', async () => {
    const input = await inputFor();
    const rows = acgEquivalentRows(input, 'en');
    expect(rows).toHaveLength(acgMapEntries(input).length + 1);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    const sunMc = rows.find((row) => row.key === 'MC-sun');
    expect(sunMc?.body).toBe('Sun');
    expect(sunMc?.shownAs).toBe('MC (Midheaven)');
    expect(sunMc?.where).toMatch(/^Longitude \d+\.\d{2}°[EW] at every latitude$/);
    expect(rows.find((row) => row.key === 'AC-moon')?.where).toMatch(/^Drawn over latitudes .+°[NS] to .+°[NS]/);
    expect(rows.at(-1)).toEqual({ key: 'marker-natal', body: '', shownAs: 'Birthplace', where: '38.75°N, 85.07°W' });
  });

  it('(b) drops exactly the entries of a line type or body that is turned off', async () => {
    const all = acgMapEntries(await inputFor());
    const noMc = await inputFor({ lineTypes: ['IC', 'AC', 'DC'] });
    const noMcEntries = acgMapEntries(noMc);
    expect(noMcEntries.some((entry) => entry.kind === 'MC')).toBe(false);
    expect(noMcEntries).toHaveLength(all.length - TRADITIONAL_ACG_BODY_IDS.length);
    expect(strokes(renderAcgMapSvg(noMc).markup, 'acg-line-mc')).toHaveLength(0);
    expect(acgEquivalentRows(noMc, 'en').some((row) => row.shownAs === 'MC (Midheaven)')).toBe(false);

    const noSun = await inputFor({ bodies: TRADITIONAL_ACG_BODY_IDS.filter((body) => body !== SE.SE_SUN) });
    const noSunEntries = acgMapEntries(noSun);
    expect(noSunEntries.some((entry) => entry.bodyKey === 'sun')).toBe(false);
    expect(noSunEntries).toHaveLength(all.length - 4);
    expect(acgEquivalentRows(noSun, 'en').some((row) => row.body === 'Sun')).toBe(false);

    const localSpace = acgMapEntries(await inputFor({ localSpace: true }));
    expect(localSpace.filter((entry) => entry.kind === 'localSpace')).toHaveLength(TRADITIONAL_ACG_BODY_IDS.length);
    expect(all.some((entry) => entry.kind === 'localSpace')).toBe(false);
  });

  it('(c) lists the relocation place while a relocation is set, and not otherwise', async () => {
    const natal = await inputFor();
    const relocated = await inputFor({ relocationPlace: PARIS });
    expect(acgMapPlaces(natal).relocation).toBeUndefined();
    expect(acgMapPlaces(relocated).relocation).toEqual({ latitude: 48.85, longitude: 2.35 });

    const before = acgEquivalentRows(natal, 'en');
    const after = acgEquivalentRows(relocated, 'en');
    expect(before.some((row) => row.key === 'marker-relocation')).toBe(false);
    expect(after.at(-1)).toEqual({
      key: 'marker-relocation',
      body: '',
      shownAs: 'Relocation place',
      where: '48.85°N, 2.35°E',
    });
    // Relocation moves no line (Map settings: "without changing any line"), so only the marker row is new.
    expect(after.slice(0, -1)).toEqual(before);
    // And the map marks the same place.
    expect(renderAcgMapSvg(relocated, { width: WIDTH }).markup).toContain(
      `cx="${fmt(projectX(2.35))}" cy="${fmt(projectY(48.85))}" r="5.00" class="acg-marker-relocation"`,
    );
  });

  it('writes the same rows in Dutch', async () => {
    const relocated = await inputFor({ relocationPlace: PARIS });
    const en = acgEquivalentRows(relocated, 'en');
    const nl = acgEquivalentRows(relocated, 'nl');
    expect(nl.map((row) => row.key)).toEqual(en.map((row) => row.key));
    expect(nl.find((row) => row.key === 'MC-sun')?.where).toMatch(/^Lengtegraad \d+,\d{2}°[OW] op elke breedtegraad$/);
    expect(nl.at(-1)).toEqual({
      key: 'marker-relocation',
      body: '',
      shownAs: 'Relocatieplaats',
      where: '48,85°N, 2,35°O',
    });
  });
});
