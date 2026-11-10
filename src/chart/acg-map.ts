/**
 * Astrocartography (ACG) world map (#171).
 *
 * A graticule-only equirectangular projection — no coastline/border dataset,
 * matching every other renderer in this directory being 100% hand-rolled SVG
 * with no new third-party dependency (see the plan's context note on bundle
 * budget). `x = (lon + 180) / 360 * width`, `y = (90 - lat) / 180 * height`,
 * so the map is exactly twice as wide as it is tall — equirectangular's
 * natural aspect ratio.
 *
 * `HorizonLine.segments` already break wherever a body is circumpolar at a
 * sampled latitude (an astronomical break); this module additionally splits
 * any point run wherever consecutive longitudes jump by more than 180°, a
 * *projection* break (the run crossed the map's left/right edge) that has
 * nothing to do with circumpolarity and would otherwise draw a spurious line
 * clean across the map.
 */
/**
 * @module chart/acg-map
 * @purpose Renders the astrocartography (ACG) world map as a hand-rolled equirectangular SVG graticule with AC/DC/MC/IC and local-space lines.
 * @conventions Equirectangular projection: `x = (lon + 180) / 360 * width`, `y = (90 - lat) / 180 * height`, so the map is exactly twice as wide as tall; point runs are split wherever consecutive longitudes jump by more than 180° (a projection/antimeridian break, distinct from `HorizonLine.segments`'s own circumpolar breaks).
 * @exports renderAcgMapSvg, acgLabelPlacements, ACG_MAP_WIDTH, ACG_LABEL_PX, acgMapEntries, acgMapPlaces; AcgMapInput, AcgMapOptions, AcgMap, AcgMapEntry, AcgMapPoint, AcgMapPlaces types.
 */
import type { LocalSpaceLine } from '../astrology/astrocartography.js';
import { bodyById } from '../astrology/bodies.js';
import type { AcgLine } from '../domain/astrocartography.js';
import type { GeoPosition } from '../ephemeris/types.js';
import { circle, escapeXml, line, polyline, text } from './svg-primitives.js';

const DEFAULT_WIDTH = 900;

/** The width the map is designed at; narrower on-screen, the view draws it at its real pixel width (#1370). */
export const ACG_MAP_WIDTH = DEFAULT_WIDTH;
const GRATICULE_STEP_DEG = 30;

export interface AcgMapInput {
  readonly lines: readonly AcgLine[];
  readonly localSpaceLines: readonly LocalSpaceLine[];
  readonly natalPlace: GeoPosition;
  readonly relocationPlace?: GeoPosition;
  /**
   * The coastlines as an SVG path in degree space (x = longitude + 180, y = 90 − latitude), drawn under the lines
   * (#667): `coastline-110m.ts`, which callers load with a dynamic import() so it stays out of other chunks.
   */
  readonly coastline?: string;
}

/** The words for the legend and line labels (#667), in the reader's language; the renderer itself has no locale. */
export interface AcgMapLabels {
  readonly bodyName: (bodyKey: string) => string;
  /** Short names on the lines themselves: `MC`. */
  readonly kinds: Readonly<Record<'MC' | 'IC' | 'AC' | 'DC', string>>;
  /** Full names in the legend: `MC (Midheaven)`. */
  readonly legendKinds: Readonly<Record<'MC' | 'IC' | 'AC' | 'DC' | 'localSpace', string>>;
}

export interface AcgMapOptions {
  /** Map width in px; the map itself is `width / 2` tall. Default 900. */
  readonly width?: number;
  /**
   * Emit the SVG at 100% of its container's width (#1049) with no fixed `height`, so the viewBox alone sets the
   * aspect ratio. Only the on-screen view opts in; the PDF/export output keeps the fixed `width`/`height` default.
   */
  readonly fluid?: boolean;
  /**
   * With labels, each line is named on the map and a legend below it pairs every colour with its body and every
   * dash pattern with its line type (#667), so the map reads on its own: on screen, downloaded, or in the PDF.
   */
  readonly labels?: AcgMapLabels;
  /**
   * Smallest label size in rendered px (#1370). Set, the on-screen view passes the container's real pixel width as
   * `width` so the viewBox is not scaled down, and label text never drops below this size; the legend then wraps
   * into as many columns as fit. Unset (PDF/export), sizes stay `width / 75` and the legend keeps six columns.
   */
  readonly minLabelPx?: number;
}

export interface AcgMap {
  readonly markup: string;
  readonly width: number;
  readonly height: number;
  /** Lines whose name did not fit on the map without covering another name (#1370); the text list names every line. */
  readonly omittedLabels: number;
}

/** The label size, in px, the map is designed around: `width / 75` at the default map width (12). */
export const ACG_LABEL_PX = ACG_MAP_WIDTH / 75;

interface Point {
  readonly latitude: number;
  readonly longitude: number;
}

/** Splits a point run wherever consecutive longitudes jump by more than 180° — a map-edge crossing, not a data gap. */
function splitAtAntimeridian(points: readonly Point[]): (readonly Point[])[] {
  const runs: Point[][] = [];
  let current: Point[] = [];
  let previousLongitude: number | undefined;
  for (const point of points) {
    if (previousLongitude !== undefined && Math.abs(point.longitude - previousLongitude) > 180) {
      if (current.length > 0) runs.push(current);
      current = [];
    }
    current.push(point);
    previousLongitude = point.longitude;
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

function bodyKeyOf(body: number): string {
  return bodyById(body)?.key ?? 'unknown';
}

/** How many rows MC and IC labels step through, so labels on nearby lines do not sit on top of each other. */
const LABEL_ROWS = 3;

/**
 * The latitudes AC and DC curves are named at, taken in turn across the map: most curves cross the equator close
 * together, so naming each at the equator would stack the names on one another.
 */
const HORIZON_LABEL_LATITUDES = [0, 30, -30, 50, -50] as const;

/** The point of `points` nearest a latitude. */
function nearestToLatitude(points: readonly Point[], latitude: number): Point | undefined {
  return points.reduce<Point | undefined>(
    (best, point) =>
      best === undefined || Math.abs(point.latitude - latitude) < Math.abs(best.latitude - latitude) ? point : best,
    undefined,
  );
}

/** A place on the map in degrees, as the map draws it. */
export interface AcgMapPoint {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * One line the map draws, as data rather than strokes (#1371): the accessible equivalent of the map lists these.
 * MC/IC lines are a single meridian; AC/DC curves give the latitude span of each drawn run and the drawn point on each
 * graticule latitude the curve reaches; a Local Space line gives the place it passes through and its two bearings.
 */
export type AcgMapEntry =
  | { readonly kind: 'MC' | 'IC'; readonly body: number; readonly bodyKey: string; readonly longitude: number }
  | {
      readonly kind: 'AC' | 'DC';
      readonly body: number;
      readonly bodyKey: string;
      /** The latitude range of each contiguous run the map draws, south to north. */
      readonly spans: readonly { readonly from: number; readonly to: number }[];
      /** The drawn points at the map's graticule latitudes (every 30°), where the curve reaches them. */
      readonly crossings: readonly AcgMapPoint[];
    }
  | {
      readonly kind: 'localSpace';
      readonly body: number;
      readonly bodyKey: string;
      readonly origin: AcgMapPoint;
      readonly azimuth: number;
      readonly reverseAzimuth: number;
    };

/** The places the map marks: the birthplace always, the relocation place when one is set (#1371). */
export interface AcgMapPlaces {
  readonly natal: AcgMapPoint;
  readonly relocation?: AcgMapPoint;
}

/** The graticule latitudes strictly between the poles, where an AC/DC curve's position is reported. */
const CROSSING_LATITUDES: readonly number[] = Array.from(
  { length: 180 / GRATICULE_STEP_DEG - 1 },
  (_, index) => -90 + GRATICULE_STEP_DEG * (index + 1),
);

/** The drawn point of a run at `latitude`, when the run reaches it: the sampled point nearest it, within half a sample step. */
function crossingAt(run: readonly Point[], latitude: number): Point | undefined {
  const first = run[0];
  const last = run[run.length - 1];
  if (first === undefined || last === undefined) return undefined;
  const step = run.length > 1 ? (last.latitude - first.latitude) / (run.length - 1) : 0;
  const nearest = nearestToLatitude(run, latitude);
  if (nearest === undefined) return undefined;
  return Math.abs(nearest.latitude - latitude) <= Math.abs(step) / 2 ? nearest : undefined;
}

/** The entry for one AC or DC curve: the latitude span of each run it is drawn in, and its graticule crossings. */
function horizonEntry(
  kind: 'AC' | 'DC',
  body: number,
  bodyKey: string,
  segments: readonly (readonly Point[])[],
): AcgMapEntry {
  const runs = segments.filter((segment) => segment.length > 0);
  const spans = runs.flatMap((run) => {
    const first = run[0];
    const last = run[run.length - 1];
    return first === undefined || last === undefined ? [] : [{ from: first.latitude, to: last.latitude }];
  });
  const crossings = CROSSING_LATITUDES.flatMap((latitude) =>
    runs.flatMap((run) => {
      const point = crossingAt(run, latitude);
      return point === undefined ? [] : [{ latitude: point.latitude, longitude: point.longitude }];
    }),
  );
  return { kind, body, bodyKey, spans, crossings };
}

/**
 * Every line `renderAcgMapSvg` draws for `input`, in the order it draws them (#1371): the meridian and horizon lines,
 * then the Local Space lines. Built from the same input as the map, so a list made from it cannot disagree with it.
 */
export function acgMapEntries(input: AcgMapInput): readonly AcgMapEntry[] {
  const entries: AcgMapEntry[] = [];
  for (const acgLine of input.lines) {
    const bodyKey = bodyKeyOf(acgLine.body);
    switch (acgLine.kind) {
      case 'MC':
      case 'IC':
        entries.push({ kind: acgLine.kind, body: acgLine.body, bodyKey, longitude: acgLine.longitude });
        break;
      case 'AC':
      case 'DC':
        entries.push(horizonEntry(acgLine.kind, acgLine.body, bodyKey, acgLine.segments));
        break;
    }
  }
  for (const localSpaceLine of input.localSpaceLines) {
    const origin = localSpaceLine.forward[0] ?? input.natalPlace;
    entries.push({
      kind: 'localSpace',
      body: localSpaceLine.body,
      bodyKey: bodyKeyOf(localSpaceLine.body),
      origin: { latitude: origin.latitude, longitude: origin.longitude },
      azimuth: ((localSpaceLine.azimuth % 360) + 360) % 360,
      reverseAzimuth: (((localSpaceLine.azimuth + 180) % 360) + 360) % 360,
    });
  }
  return entries;
}

/** The places `renderAcgMapSvg` marks for `input` (#1371). */
export function acgMapPlaces(input: AcgMapInput): AcgMapPlaces {
  const natal = { latitude: input.natalPlace.latitude, longitude: input.natalPlace.longitude };
  return input.relocationPlace === undefined
    ? { natal }
    : { natal, relocation: { latitude: input.relocationPlace.latitude, longitude: input.relocationPlace.longitude } };
}

/** Average glyph width as a share of the font size for the 600-weight label text; deliberately on the wide side. */
const LABEL_CHAR_EM = 0.62;
/** Clearance kept around each label box, covering the 3px halo stroke. */
const LABEL_PAD = 2;

/** The box a label occupies, in map units. */
export interface AcgLabelBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** One line's name as placed on the map (#1370). */
export interface AcgLabelPlacement extends AcgLabelBox {
  readonly bodyKey: string;
  readonly kind: 'MC' | 'IC' | 'AC' | 'DC';
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly anchor: 'start' | 'end';
}

function boxesOverlap(a: AcgLabelBox, b: AcgLabelBox): boolean {
  return a.x0 < b.x1 + LABEL_PAD && b.x0 < a.x1 + LABEL_PAD && a.y0 < b.y1 + LABEL_PAD && b.y0 < a.y1 + LABEL_PAD;
}

function labelBox(x: number, y: number, anchor: 'start' | 'end', chars: number, fontSize: number): AcgLabelBox {
  const w = chars * LABEL_CHAR_EM * fontSize;
  return {
    x0: anchor === 'start' ? x : x - w,
    x1: anchor === 'start' ? x + w : x,
    y0: y - fontSize * 0.8,
    y1: y + fontSize * 0.25,
  };
}

interface LabelCandidate {
  readonly x: number;
  readonly y: number;
  readonly anchor: 'start' | 'end';
}

/** Both sides of a point, the side with room first. */
function sides(x: number, y: number, width: number): LabelCandidate[] {
  const right: LabelCandidate = { x: x + 3, y, anchor: 'start' };
  const left: LabelCandidate = { x: x - 3, y, anchor: 'end' };
  return x > width - width / 8 ? [left, right] : [right, left];
}

/** Latitudes an AC/DC curve may be named at: the preferred one first, then the rest in turn. */
function horizonLatitudes(preferred: number): number[] {
  const others = [0, 30, -30, 50, -50, 15, -15, 40, -40, 60, -60, 5, -5, 25, -25, 45, -45].filter(
    (latitude) => latitude !== preferred,
  );
  return [preferred, ...others];
}

/**
 * Where each line's name goes, without any two names covering one another (#1370). Names are placed in drawing order;
 * each takes the first spot, from a list of candidates along its own line, that is inside the map and clear of every
 * name and place marker already placed. A line with no clear spot goes unnamed and is counted: the text list names it.
 */
export function acgLabelPlacements(
  input: AcgMapInput,
  labels: AcgMapLabels,
  width: number,
  fontSize: number,
): { readonly placed: ReadonlyMap<AcgLine, AcgLabelPlacement>; readonly omitted: number } {
  const mapHeight = width / 2;
  const project = (point: Point): { x: number; y: number } => ({
    x: ((point.longitude + 180) / 360) * width,
    y: ((90 - point.latitude) / 180) * mapHeight,
  });
  const taken: AcgLabelBox[] = [
    input.natalPlace,
    ...(input.relocationPlace === undefined ? [] : [input.relocationPlace]),
  ].map((place) => {
    const at = project(place);
    return { x0: at.x - 5, y0: at.y - 5, x1: at.x + 5, y1: at.y + 5 };
  });
  const rows = Math.max(LABEL_ROWS, Math.floor((mapHeight * 0.4) / (fontSize * 1.2)));
  const meridians = input.lines
    .flatMap((acgLine) => (acgLine.kind === 'MC' || acgLine.kind === 'IC' ? [acgLine] : []))
    .sort((a, b) => a.longitude - b.longitude);
  const meridianRow = new Map(meridians.map((acgLine, index) => [acgLine, index % LABEL_ROWS]));
  const horizonPoints = (acgLine: AcgLine): readonly Point[] =>
    acgLine.kind === 'AC' || acgLine.kind === 'DC' ? acgLine.segments.flat() : [];
  const horizons = input.lines
    .filter((acgLine) => acgLine.kind === 'AC' || acgLine.kind === 'DC')
    .map((acgLine) => ({ acgLine, x: nearestToLatitude(horizonPoints(acgLine), 0)?.longitude ?? 0 }))
    .sort((a, b) => a.x - b.x);
  const horizonLatitude = new Map(
    horizons.map(({ acgLine }, index) => [
      acgLine,
      HORIZON_LABEL_LATITUDES[index % HORIZON_LABEL_LATITUDES.length] ?? 0,
    ]),
  );

  const placed = new Map<AcgLine, AcgLabelPlacement>();
  let omitted = 0;
  for (const acgLine of input.lines) {
    const bodyKey = bodyKeyOf(acgLine.body);
    const content = `${labels.bodyName(bodyKey)} ${labels.kinds[acgLine.kind]}`;
    const candidates: LabelCandidate[] = [];
    if (acgLine.kind === 'MC' || acgLine.kind === 'IC') {
      const x = project({ latitude: 0, longitude: acgLine.longitude }).x;
      const first = meridianRow.get(acgLine) ?? 0;
      const order = [first, ...Array.from({ length: rows }, (_, row) => row).filter((row) => row !== first)];
      for (const row of order) {
        // MC names along the top edge, IC names along the bottom.
        const y = acgLine.kind === 'MC' ? fontSize * (1.2 + row * 1.2) : mapHeight - fontSize * (0.5 + row * 1.2);
        candidates.push(...sides(x, y, width));
      }
    } else {
      const points = horizonPoints(acgLine);
      const seen = new Set<Point>();
      for (const latitude of horizonLatitudes(horizonLatitude.get(acgLine) ?? 0)) {
        const nearest = nearestToLatitude(points, latitude);
        if (nearest === undefined || seen.has(nearest) || Math.abs(nearest.latitude - latitude) > 5) continue;
        seen.add(nearest);
        const at = project(nearest);
        candidates.push(...sides(at.x, at.y - fontSize * 0.4, width));
      }
    }
    const chars = content.length;
    const fit = candidates.find((candidate) => {
      const box = labelBox(candidate.x, candidate.y, candidate.anchor, chars, fontSize);
      return (
        box.x0 >= 0 &&
        box.x1 <= width &&
        box.y0 >= 0 &&
        box.y1 <= mapHeight &&
        !taken.some((other) => boxesOverlap(box, other))
      );
    });
    if (fit === undefined) {
      omitted += 1;
      continue;
    }
    const box = labelBox(fit.x, fit.y, fit.anchor, chars, fontSize);
    taken.push(box);
    placed.set(acgLine, { ...box, bodyKey, kind: acgLine.kind, text: content, ...fit });
  }
  return { placed, omitted };
}

export function renderAcgMapSvg(input: AcgMapInput, options?: AcgMapOptions): AcgMap {
  const width = options?.width ?? DEFAULT_WIDTH;
  const mapHeight = width / 2;
  const labels = options?.labels;
  const fontSize = Math.max(width / 75, options?.minLabelPx ?? 0);
  const project = (point: Point): { x: number; y: number } => ({
    x: ((point.longitude + 180) / 360) * width,
    y: ((90 - point.latitude) / 180) * mapHeight,
  });

  const parts: string[] = [];
  const plan = labels === undefined ? undefined : acgLabelPlacements(input, labels, width, fontSize);
  for (let latitude = -90; latitude <= 90; latitude += GRATICULE_STEP_DEG) {
    const y = project({ latitude, longitude: 0 }).y;
    parts.push(line(0, y, width, y, 'acg-graticule'));
  }
  for (let longitude = -180; longitude <= 180; longitude += GRATICULE_STEP_DEG) {
    const x = project({ latitude: 0, longitude }).x;
    parts.push(line(x, 0, x, mapHeight, 'acg-graticule'));
  }

  if (input.coastline !== undefined) {
    // Scaled from the 360 × 180 degree box to the map; the stroke width is given in degrees so it draws at about 0.8px.
    const scale = width / 360;
    parts.push(
      `<path d="${escapeXml(input.coastline)}" class="acg-coast" transform="scale(${String(scale)})" stroke-width="${String(0.8 / scale)}"/>`,
    );
  }

  for (const acgLine of input.lines) {
    const key = bodyKeyOf(acgLine.body);
    switch (acgLine.kind) {
      case 'MC':
      case 'IC': {
        const kindClass = acgLine.kind === 'MC' ? 'acg-line-mc' : 'acg-line-ic';
        const x = project({ latitude: 0, longitude: acgLine.longitude }).x;
        parts.push(line(x, 0, x, mapHeight, `${kindClass} ${kindClass}-${key}`));
        break;
      }
      case 'AC':
      case 'DC': {
        const kindClass = acgLine.kind === 'AC' ? 'acg-line-ac' : 'acg-line-dc';
        const runs = acgLine.segments.flatMap((segment) => splitAtAntimeridian(segment));
        for (const run of runs) parts.push(polyline(run.map(project), `${kindClass} ${kindClass}-${key}`));
        break;
      }
    }
  }

  for (const localSpaceLine of input.localSpaceLines) {
    const key = bodyKeyOf(localSpaceLine.body);
    const className = `acg-line-local-space acg-line-local-space-${key}`;
    for (const arm of [localSpaceLine.forward, localSpaceLine.backward]) {
      for (const run of splitAtAntimeridian(arm)) {
        parts.push(polyline(run.map(project), className));
      }
    }
  }

  const natalPoint = project(input.natalPlace);
  parts.push(circle(natalPoint.x, natalPoint.y, 5, 'acg-marker-natal'));
  if (input.relocationPlace !== undefined) {
    const relocationPoint = project(input.relocationPlace);
    parts.push(circle(relocationPoint.x, relocationPoint.y, 5, 'acg-marker-relocation'));
  }
  for (const placement of plan?.placed.values() ?? []) {
    parts.push(
      text(
        placement.x,
        placement.y,
        placement.anchor,
        `acg-label acg-label-${placement.bodyKey}`,
        escapeXml(placement.text),
        fontSize,
      ),
    );
  }

  const legend =
    labels === undefined
      ? undefined
      : legendBand(input, labels, width, mapHeight, fontSize, options?.minLabelPx !== undefined);
  if (legend !== undefined) parts.push(legend.markup);
  const height = mapHeight + (legend?.height ?? 0);

  const size = options?.fluid === true ? 'width="100%"' : `width="${width}" height="${height}"`;
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `${size} class="acg-map">${parts.join('')}</svg>`;
  return { markup, width, height, omittedLabels: plan?.omitted ?? 0 };
}

/**
 * The legend under the map (#667): one row of line types, each drawn with its own dash pattern, then every body on
 * the map with a stroke in its colour. Laid out in columns that wrap to the map's width.
 */
function legendBand(
  input: AcgMapInput,
  labels: AcgMapLabels,
  width: number,
  top: number,
  fontSize: number,
  fitColumns: boolean,
): { readonly markup: string; readonly height: number } {
  const rowHeight = fontSize * 1.8;
  const sampleWidth = fontSize * 2.4;
  const names = [
    ...Object.values(labels.legendKinds),
    ...[...input.lines, ...input.localSpaceLines].map((entry) => labels.bodyName(bodyKeyOf(entry.body))),
  ];
  const longest = Math.max(...names.map((name) => name.length));
  // On a narrow map (#1370) the legend wraps into as many columns as its longest name leaves room for.
  const columns = fitColumns
    ? Math.max(1, Math.min(6, Math.floor(width / (sampleWidth + fontSize * 1.5 + longest * LABEL_CHAR_EM * fontSize))))
    : 6;
  const columnWidth = width / columns;
  const sample = sampleWidth;
  const parts: string[] = [];
  let row = 0;
  let column = 0;
  const item = (strokeClass: string, name: string): void => {
    if (column === columns) {
      column = 0;
      row += 1;
    }
    const x = column * columnWidth + fontSize;
    const y = top + fontSize + row * rowHeight + rowHeight / 2;
    parts.push(line(x, y, x + sample, y, strokeClass));
    parts.push(
      text(x + sample + fontSize * 0.5, y + fontSize * 0.35, 'start', 'acg-legend-text', escapeXml(name), fontSize),
    );
    column += 1;
  };

  // Only the line types on this map. Legend strokes have classes of their own, so they are never counted as lines.
  const present = new Set<string>(input.lines.map((acgLine) => acgLine.kind));
  if (input.localSpaceLines.length > 0) present.add('localSpace');
  for (const kind of ['MC', 'IC', 'AC', 'DC', 'localSpace'] as const) {
    if (present.has(kind)) item(`acg-legend-sample acg-legend-sample-${kind}`, labels.legendKinds[kind]);
  }

  const bodies = [...new Set([...input.lines, ...input.localSpaceLines].map((entry) => bodyKeyOf(entry.body)))];
  if (bodies.length > 0 && present.size > 0) {
    row += 1;
    column = 0;
  }
  for (const key of bodies) item(`acg-legend-swatch acg-line-mc-${key}`, labels.bodyName(key));

  return { markup: `<g class="acg-legend">${parts.join('')}</g>`, height: fontSize * 2 + (row + 1) * rowHeight };
}
