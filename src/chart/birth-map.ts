/**
 * The PDF's birth-place map (#711): a small regional map drawn entirely from bundled Natural Earth data, so no birth
 * coordinate is sent anywhere (`server/index.ts`: "Birth data never leaves the browser").
 *
 * The frame spans 20° of longitude either side of the birthplace, with longitude scaled by the cosine of the latitude
 * so shapes are not stretched sideways; the latitude it covers follows from the map's proportions. Land is clipped to
 * the frame as polygons (so it can be filled and its outline drawn as the coastline) and borders as line runs.
 *
 * The pin is labelled with the nearest Natural Earth populated place, never the stored place label, which can be a full
 * street address: its name within 15 km, "near" it within 40 km, and only the coordinates rounded to 0.1° beyond.
 */
/**
 * @module chart/birth-map
 * @purpose Draws the PDF's birth-place map as SVG from bundled Natural Earth land, borders and populated places, with the pin labelled by the nearest town (#711).
 * @conventions Pure; input data is `pdf-map-data.ts`'s encoding (0.02° steps for lines, hundredths for places). Classed only by colour constants passed in, so the PDF can use its light palette; the frame is ±20° of longitude scaled by cos(latitude).
 * @exports MapPlace, nearestPlace, BirthMapData, BirthMapLabels, birthMapSvg
 */
import { escapeXml } from './svg-primitives.js';

/** One populated place: its name and position in degrees. */
export interface MapPlace {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}

const KM_PER_DEGREE = 111.2;

/** The populated place nearest a position, and how far it is in kilometres. */
export function nearestPlace(
  latitude: number,
  longitude: number,
  places: string,
): { readonly place: MapPlace; readonly km: number } | undefined {
  const k = Math.cos((latitude * Math.PI) / 180);
  let best: { place: MapPlace; km: number } | undefined;
  for (const row of places.split('\n')) {
    const [name, lat, lon] = row.split('|');
    if (name === undefined || lat === undefined || lon === undefined) continue;
    const place = { name, latitude: Number(lat) / 100, longitude: Number(lon) / 100 };
    const km = Math.hypot(place.latitude - latitude, (place.longitude - longitude) * k) * KM_PER_DEGREE;
    if (best === undefined || km < best.km) best = { place, km };
  }
  return best;
}

export interface BirthMapData {
  /** `pdf-map-data.ts`'s LAND_50M: one ring per line. */
  readonly land: string;
  /** BORDERS_50M: one line per line. */
  readonly borders: string;
  /** PLACES_10M: `name|lat|lon` in hundredths. */
  readonly places: string;
}

export interface BirthMapLabels {
  /** "near Lyon" */
  readonly near: (town: string) => string;
  /** The coordinates as text, rounded to town level. */
  readonly coordinates: string;
}

type Point = readonly [number, number];

/** Decodes `x,y;dx,dy;…` lines (0.02° steps in degree space) into [longitude, latitude] points. */
function decode(encoded: string): Point[][] {
  return encoded.split('\n').map((line) => {
    let x = 0;
    let y = 0;
    return line.split(';').map((pair, index) => {
      const [a, b] = pair.split(',').map(Number);
      x = index === 0 ? (a ?? 0) : x + (a ?? 0);
      y = index === 0 ? (b ?? 0) : y + (b ?? 0);
      return [x / 50 - 180, 90 - y / 50] as const;
    });
  });
}

interface Box {
  readonly west: number;
  readonly east: number;
  readonly south: number;
  readonly north: number;
}

/** Sutherland–Hodgman: a ring clipped to an axis-aligned box stays a closed ring. */
function clipRing(ring: readonly Point[], box: Box): Point[] {
  const edges: readonly ((p: Point) => boolean)[] = [
    (p) => p[0] >= box.west,
    (p) => p[0] <= box.east,
    (p) => p[1] >= box.south,
    (p) => p[1] <= box.north,
  ];
  const cut = (a: Point, b: Point, edge: number): Point => {
    const bound = [box.west, box.east, box.south, box.north][edge] ?? 0;
    const axis = edge < 2 ? 0 : 1;
    const t = (bound - a[axis]) / (b[axis] - a[axis]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  let output: Point[] = [...ring];
  edges.forEach((inside, edge) => {
    const input = output;
    output = [];
    input.forEach((current, index) => {
      const previous = input[(index + input.length - 1) % input.length];
      if (previous === undefined) return;
      if (inside(current)) {
        if (!inside(previous)) output.push(cut(previous, current, edge));
        output.push(current);
      } else if (inside(previous)) {
        output.push(cut(previous, current, edge));
      }
    });
  });
  return output;
}

/** The runs of a line that fall inside the box (each with one point beyond, so it reaches the frame's edge). */
function clipLine(line: readonly Point[], box: Box): Point[][] {
  const within = (p: Point): boolean => p[0] >= box.west && p[0] <= box.east && p[1] >= box.south && p[1] <= box.north;
  const runs: Point[][] = [];
  let run: Point[] = [];
  line.forEach((point, index) => {
    const previous = line[index - 1];
    if (within(point)) {
      if (run.length === 0 && previous !== undefined) run.push(previous);
      run.push(point);
    } else if (run.length > 0) {
      run.push(point);
      runs.push(run);
      run = [];
    }
  });
  if (run.length > 1) runs.push(run);
  return runs;
}

export function birthMapSvg(
  latitude: number,
  longitude: number,
  data: BirthMapData,
  labels: BirthMapLabels,
  size: { readonly width: number; readonly height: number },
  colors: {
    readonly sea: string;
    readonly land: string;
    readonly coast: string;
    readonly border: string;
    readonly pin: string;
    readonly ink: string;
    readonly muted: string;
  },
): { readonly markup: string; readonly width: number; readonly height: number } {
  const { width, height } = size;
  const k = Math.cos((latitude * Math.PI) / 180);
  const scale = width / (40 * k);
  const latHalf = height / scale / 2;
  const margin = 2;
  const box: Box = {
    west: longitude - 20 - margin,
    east: longitude + 20 + margin,
    south: latitude - latHalf - margin,
    north: latitude + latHalf + margin,
  };
  const project = ([lon, lat]: Point): string =>
    `${((lon - longitude) * k * scale + width / 2).toFixed(1)} ${((latitude - lat) * scale + height / 2).toFixed(1)}`;
  const path = (points: readonly Point[], close: boolean): string =>
    `M${points.map(project).join('L')}${close ? 'Z' : ''}`;

  const land = decode(data.land)
    .map((ring) => clipRing(ring, box))
    .filter((ring) => ring.length > 2)
    .map((ring) => path(ring, true))
    .join('');
  const borders = decode(data.borders)
    .flatMap((line) => clipLine(line, box))
    .map((run) => path(run, false))
    .join('');

  const nearest = nearestPlace(latitude, longitude, data.places);
  const town =
    nearest === undefined || nearest.km > 40
      ? undefined
      : nearest.km <= 15
        ? nearest.place.name
        : labels.near(nearest.place.name);
  const pin = project([longitude, latitude]).split(' ').map(Number);
  const [px, py] = [pin[0] ?? width / 2, pin[1] ?? height / 2];
  const text = (y: number, content: string, size: number, weight: string, fill: string): string =>
    `<text x="${(px + 11).toFixed(1)}" y="${y.toFixed(1)}" font-family="DejaVuSans, Helvetica, sans-serif" font-size="${String(size)}" font-weight="${weight}" fill="${fill}">${escapeXml(content)}</text>`;

  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}" width="${String(width)}" height="${String(height)}">` +
    `<defs><clipPath id="birth-map-frame"><rect width="${String(width)}" height="${String(height)}" rx="10"/></clipPath></defs>` +
    `<g clip-path="url(#birth-map-frame)">` +
    `<rect width="${String(width)}" height="${String(height)}" fill="${colors.sea}"/>` +
    `<path d="${land}" fill="${colors.land}" stroke="${colors.coast}" stroke-width="0.9" stroke-linejoin="round"/>` +
    `<path d="${borders}" fill="none" stroke="${colors.border}" stroke-width="0.6" stroke-dasharray="3 2"/>` +
    `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="9" fill="${colors.pin}" fill-opacity="0.18"/>` +
    `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.2" fill="${colors.pin}" stroke="${colors.land}" stroke-width="1.6"/>` +
    (town === undefined
      ? text(py + 4, labels.coordinates, 11, 'normal', colors.muted)
      : `${text(py - 3, town, 13, 'bold', colors.ink)}${text(py + 12, labels.coordinates, 10.5, 'normal', colors.muted)}`) +
    `</g><rect width="${String(width)}" height="${String(height)}" rx="10" fill="none" stroke="${colors.border}"/></svg>`;
  return { markup, width, height };
}
