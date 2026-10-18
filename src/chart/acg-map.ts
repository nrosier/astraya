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
 * @exports renderAcgMapSvg; AcgMapInput, AcgMapOptions, AcgMap types.
 */
import type { LocalSpaceLine } from '../astrology/astrocartography.js';
import { bodyById } from '../astrology/bodies.js';
import type { AcgLine } from '../domain/astrocartography.js';
import type { GeoPosition } from '../ephemeris/types.js';
import { circle, escapeXml, line, polyline, text } from './svg-primitives.js';

const DEFAULT_WIDTH = 900;
const GRATICULE_STEP_DEG = 30;

export interface AcgMapInput {
  readonly lines: readonly AcgLine[];
  readonly localSpaceLines: readonly LocalSpaceLine[];
  readonly natalPlace: GeoPosition;
  readonly relocationPlace?: GeoPosition;
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
   * With labels, each line is named on the map and a legend below it pairs every colour with its body and every
   * dash pattern with its line type (#667), so the map reads on its own: on screen, downloaded, or in the PDF.
   */
  readonly labels?: AcgMapLabels;
}

export interface AcgMap {
  readonly markup: string;
  readonly width: number;
  readonly height: number;
}

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

export function renderAcgMapSvg(input: AcgMapInput, options?: AcgMapOptions): AcgMap {
  const width = options?.width ?? DEFAULT_WIDTH;
  const mapHeight = width / 2;
  const labels = options?.labels;
  const fontSize = width / 75;
  const project = (point: Point): { x: number; y: number } => ({
    x: ((point.longitude + 180) / 360) * width,
    y: ((90 - point.latitude) / 180) * mapHeight,
  });

  const parts: string[] = [];
  const lineLabels: string[] = [];
  /** A line's name on the map, kept inside it: anchored at its end when it would run off the right edge. */
  const label = (x: number, y: number, bodyKey: string, kind: 'MC' | 'IC' | 'AC' | 'DC'): void => {
    if (labels === undefined) return;
    const content = escapeXml(`${labels.bodyName(bodyKey)} ${labels.kinds[kind]}`);
    const nearRightEdge = x > width - width / 8;
    lineLabels.push(
      text(
        nearRightEdge ? x - 3 : x + 3,
        y,
        nearRightEdge ? 'end' : 'start',
        `acg-label acg-label-${bodyKey}`,
        content,
        fontSize,
      ),
    );
  };

  for (let latitude = -90; latitude <= 90; latitude += GRATICULE_STEP_DEG) {
    const y = project({ latitude, longitude: 0 }).y;
    parts.push(line(0, y, width, y, 'acg-graticule'));
  }
  for (let longitude = -180; longitude <= 180; longitude += GRATICULE_STEP_DEG) {
    const x = project({ latitude: 0, longitude }).x;
    parts.push(line(x, 0, x, mapHeight, 'acg-graticule'));
  }

  // MC and IC labels step through a few rows, in order across the map, so neighbouring lines keep apart.
  const meridians = input.lines
    .flatMap((acgLine) => (acgLine.kind === 'MC' || acgLine.kind === 'IC' ? [acgLine] : []))
    .sort((a, b) => a.longitude - b.longitude);
  const meridianRow = new Map(meridians.map((acgLine, index) => [acgLine, index % LABEL_ROWS]));
  // AC and DC curves, in order of where they cross the equator, each named at the next latitude in turn.
  const horizonPoints = (acgLine: (typeof input.lines)[number]): readonly Point[] =>
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

  for (const acgLine of input.lines) {
    const key = bodyKeyOf(acgLine.body);
    switch (acgLine.kind) {
      case 'MC':
      case 'IC': {
        const kindClass = acgLine.kind === 'MC' ? 'acg-line-mc' : 'acg-line-ic';
        const x = project({ latitude: 0, longitude: acgLine.longitude }).x;
        parts.push(line(x, 0, x, mapHeight, `${kindClass} ${kindClass}-${key}`));
        const row = meridianRow.get(acgLine) ?? 0;
        // MC names along the top edge, IC names along the bottom.
        label(
          x,
          acgLine.kind === 'MC' ? fontSize * (1.2 + row * 1.2) : mapHeight - fontSize * (0.5 + row * 1.2),
          key,
          acgLine.kind,
        );
        break;
      }
      case 'AC':
      case 'DC': {
        const kindClass = acgLine.kind === 'AC' ? 'acg-line-ac' : 'acg-line-dc';
        const runs = acgLine.segments.flatMap((segment) => splitAtAntimeridian(segment));
        for (const run of runs) parts.push(polyline(run.map(project), `${kindClass} ${kindClass}-${key}`));
        // Named at its turn's latitude, clear of the MC and IC names along the edges.
        const nearest = nearestToLatitude(runs.flat(), horizonLatitude.get(acgLine) ?? 0);
        if (nearest !== undefined) {
          const at = project(nearest);
          label(at.x, at.y - fontSize * 0.4, key, acgLine.kind);
        }
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
  parts.push(...lineLabels);

  const legend = labels === undefined ? undefined : legendBand(input, labels, width, mapHeight, fontSize);
  if (legend !== undefined) parts.push(legend.markup);
  const height = mapHeight + (legend?.height ?? 0);

  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}" class="acg-map">${parts.join('')}</svg>`;
  return { markup, width, height };
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
): { readonly markup: string; readonly height: number } {
  const rowHeight = fontSize * 1.8;
  const columnWidth = width / 6;
  const sample = fontSize * 2.4;
  const parts: string[] = [];
  let row = 0;
  let column = 0;
  const item = (strokeClass: string, name: string): void => {
    if (column === 6) {
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
