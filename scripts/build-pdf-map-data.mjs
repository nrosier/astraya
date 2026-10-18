/**
 * Generates src/chart/pdf-map-data.ts, the data behind the PDF's birth-place map (#711), from three Natural Earth
 * v5.1.2 files (public domain): the 1:50m land and country borders, and the 1:10m populated places. The land's own
 * outline is the coastline, so no separate coastline file is needed.
 *
 * The inputs are downloaded by hand and checked against the SHA-256 sums below, so the output is reproducible and the
 * script needs no network:
 *   for f in ne_50m_land ne_50m_admin_0_boundary_lines_land ne_10m_populated_places_simple; do
 *     curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/$f.geojson
 *   done
 *   node scripts/build-pdf-map-data.mjs <dir holding the three files>
 *
 * Lines are simplified (Douglas–Peucker, one step) and encoded in steps of 0.02° (about 2 km, finer than a ±20° map shows), each as `x,y;dx,dy;dx,dy…` in degree
 * space (x = (longitude + 180) × 50, y = (90 − latitude) × 50), one per line of text. Places are `name|lat|lon` in
 * hundredths of a degree.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const INPUTS = {
  land: ['ne_50m_land.geojson', 'e874b27a51d146452be360cafb3cc50c86001074a67d534113e6534682f9826b'],
  borders: [
    'ne_50m_admin_0_boundary_lines_land.geojson',
    '2faac4f6b34386f3d21b6e018cf151f241f00e5c936d44dd17d7d9bfb147fa48',
  ],
  places: [
    'ne_10m_populated_places_simple.geojson',
    'fd3fa867a320cbd5c5b6bb5bc550afeec2939fb2cef688e508007282a55ac42f',
  ],
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'src', 'chart', 'pdf-map-data.ts');
const dir = process.argv[2];
if (dir === undefined) {
  console.error('usage: node scripts/build-pdf-map-data.mjs <dir holding the four Natural Earth files>');
  process.exit(1);
}

async function read([file, sha]) {
  const raw = await readFile(join(dir, file));
  const digest = createHash('sha256').update(raw).digest('hex');
  if (digest !== sha) {
    console.error(`unexpected SHA-256 for ${file}: ${digest}`);
    process.exit(1);
  }
  return JSON.parse(raw.toString('utf8'));
}

const hundredth = (value) => Math.round(value * 100);
/** One step of the line encoding: 0.02°. */
const step = (value) => Math.round(value * 50);

/** Every ring or line of a geometry, as arrays of [longitude, latitude]. */
function linesOf(geometry) {
  switch (geometry.type) {
    case 'LineString':
      return [geometry.coordinates];
    case 'MultiLineString':
    case 'Polygon':
      return geometry.coordinates;
    case 'MultiPolygon':
      return geometry.coordinates.flat();
    default:
      return [];
  }
}

/**
 * Douglas–Peucker simplification in encoded units: drops points within `tolerance` steps of the straight line between
 * kept ones. One step (0.02°) is below what a ±20° map can show.
 */
function simplify(points, tolerance = 1) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const length = Math.hypot(bx - ax, by - ay);
    let farthest = -1;
    let distance = 0;
    for (let index = first + 1; index < last; index++) {
      const [px, py] = points[index];
      const d =
        length === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
      if (d > distance) {
        distance = d;
        farthest = index;
      }
    }
    if (farthest !== -1 && distance > tolerance) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

function encodeLines(collection) {
  const out = [];
  for (const feature of collection.features) {
    for (const line of linesOf(feature.geometry)) {
      const points = simplify(line.map(([lon, lat]) => [step(lon + 180), step(90 - lat)]));
      const steps = [`${String(points[0][0])},${String(points[0][1])}`];
      for (let index = 1; index < points.length; index++) {
        const dx = points[index][0] - points[index - 1][0];
        const dy = points[index][1] - points[index - 1][1];
        if (dx !== 0 || dy !== 0) steps.push(`${String(dx)},${String(dy)}`);
      }
      if (steps.length > 1) out.push(steps.join(';'));
    }
  }
  return out.join('\n');
}

const [land, borders, places] = await Promise.all([read(INPUTS.land), read(INPUTS.borders), read(INPUTS.places)]);
const placeRows = places.features
  .map((feature) => {
    const [lon, lat] = feature.geometry.coordinates;
    const name = String(feature.properties.name ?? '').replace(/[|\n]/g, ' ');
    return `${name}|${String(hundredth(lat))}|${String(hundredth(lon))}`;
  })
  .join('\n');

const literal = (text) => JSON.stringify(text);
const source = `/**
 * Natural Earth v5.1.2 (public domain): 1:50m land (its outline is the coastline) and country borders, and 1:10m
 * populated places, for the PDF's birth-place map (#711). Generated by scripts/build-pdf-map-data.mjs; do not edit by hand.
 */
/**
 * @module chart/pdf-map-data
 * @purpose The data behind the PDF's birth-place map (#711): Natural Earth land (outline = coastline) and borders as encoded lines, and populated places for the town label.
 * @conventions Generated, not hand-written; loaded with a dynamic import() only when a PDF with a birth record is built. Lines are \`x,y;dx,dy;…\` in steps of 0.02° in degree space (x = (lon + 180) × 50, y = (90 − lat) × 50); places are \`name|lat|lon\` in hundredths of a degree.
 * @exports LAND_50M, BORDERS_50M, PLACES_10M
 */
export const LAND_50M = ${literal(encodeLines(land))};
export const BORDERS_50M = ${literal(encodeLines(borders))};
export const PLACES_10M = ${literal(placeRows)};
`;
// Formatted with the project's own Prettier settings, so the committed file passes `npm run check` as generated.
const formatted = await format(source, { ...(await resolveConfig(OUT)), filepath: OUT });
await writeFile(OUT, formatted);
console.log(`wrote ${OUT} (${String(Math.round(formatted.length / 1024))} kB)`);
