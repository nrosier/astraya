/**
 * The aspect grid that sits under the wheel, in Astro-Seek's layout (#413): a positions
 * table on the left, one row per body, and the lower-triangular grid of aspects attached to it
 * and sharing its row height.
 *
 * Every pair of bodies appears exactly once, which is the point: the wheel's chord web shows
 * *where* aspects fall but overlapping chords make it impossible to read off whether a
 * specific pair aspects at all, and a flat aspect list makes "does Mars aspect Saturn?" a scan
 * rather than a lookup. The staircase form is the conventional answer — the diagonal carries
 * each row's own glyph, and the cells below it are that row's aspects.
 *
 * The left table is glyph, name, degree, sign (in its element's colour), minutes and house —
 * the same facts as the Positions tab, so the grid can be read on its own. The Ascendant and
 * Midheaven are rows like any body.
 *
 * Each aspect cell holds the aspect glyph and, stacked beside it, the signed whole-degree orb
 * over `a` (applying) or `s` (separating). The orb's sign is which side of exact the pair is on
 * (`separation - exact angle`, so `-3` is three degrees short of a square), a separate fact from
 * applying/separating. An aspect within `TIGHT_ORB_DEG` gets a heavy border, as on the wheel.
 *
 * The grid takes its bodies from the caller rather than a fixed list, so the same renderer
 * covers a chart with the asteroids switched on. Cell size falls out of dividing the panel
 * width by the row count plus the table's width, and glyph and font sizes are fractions of that
 * cell — so a 24-row grid stays inside its panel instead of overflowing a layout tuned for 17.
 * What a small cell cannot do is carry the same *text*: below `MIN_ORB_FONT_SIZE` the orb stack
 * goes away, leaving the aspect glyph alone (the exact orb is in the Aspects table).
 *
 * Which aspects appear is entirely the caller's business: this module renders the list it is
 * given and never re-derives orbs, so the grid cannot disagree with the Aspects table computed
 * from the same `ChartData`.
 */
/**
 * @module chart/aspect-matrix
 * @purpose Renders the Astro-Seek-style aspect grid (positions table + lower-triangular aspect staircase) that sits under the chart wheel.
 * @conventions Only the lower triangle below the diagonal is drawn (an aspect is symmetric); orb is shown as signed whole degrees (`separation - exact angle`, negative when short of exact) with an `a`/`s` applying/separating marker; cell/font sizes are fractions of a cell computed from panel width divided by row count, and the orb stack is hidden below `MIN_ORB_FONT_SIZE` to avoid overlapping, unreadably small text.
 * @exports renderAspectMatrixSvg, fitFontSize; MatrixBody, MatrixAspect, AspectMatrixInput types.
 */
import { SIGNS } from '../astrology/signs.js';
import type { Degrees } from '../ephemeris/types.js';
import { TIGHT_ORB_DEG } from './aspect-web.js';
import { aspectGlyph, bodyGlyph, renderGlyph, signGlyph } from './glyphs.js';
import type { PanelLayout, PanelRender } from './sheet-geometry.js';
import { baselineOffset, escapeXml, rect, text } from './svg-primitives.js';

export interface MatrixBody {
  /** A `bodyGlyph` key where one exists; anything else falls back to the text `label`. */
  readonly key: string;
  /** Short label, used when `key` has no glyph (the angles, typically "AC"/"MC"). */
  readonly label: string;
  /** Shown in the positions table. */
  readonly name: string;
  /** Ecliptic longitude: gives the table its degree, sign and minutes. */
  readonly longitude: Degrees;
  readonly retrograde?: boolean;
  /** Absent for the angles, which define the houses rather than sit in one. */
  readonly house?: number;
}

export interface MatrixAspect {
  readonly aKey: string;
  readonly bKey: string;
  /** An `ASPECTS` key, e.g. `square`. Unknown keys render as an empty cell. */
  readonly aspectKey: string;
  /** Unsigned distance from exact. */
  readonly orb: Degrees;
  /** `separation - exact angle`: negative when the pair is short of exact. */
  readonly signedOrb: Degrees;
  readonly applying: boolean;
}

export interface AspectMatrixInput {
  readonly bodies: readonly MatrixBody[];
  readonly aspects: readonly MatrixAspect[];
}

/**
 * Column widths of the positions table, in cells: glyph, name, degree, sign, minutes, house.
 * Sized for the longest name ("Mercury"/"Midheaven"'s short form aside) at the table's font.
 */
const TABLE_COLUMNS = [1, 2.1, 1.1, 0.9, 1, 0.9] as const;
const TABLE_CELLS = TABLE_COLUMNS.reduce((sum, width) => sum + width, 0);

/** Fractions of one cell's edge. */
const GLYPH_FRACTION = 0.52;
const TABLE_FONT_FRACTION = 0.4;
const LABEL_FONT_FRACTION = 0.38;
const ORB_FONT_FRACTION = 0.28;
const CELL_GLYPH_FRACTION = 0.46;
const SIGN_GLYPH_FRACTION = 0.5;

/**
 * Below this the orb stack is not drawn at all.
 *
 * Dividing the panel width by the row count means a crowded chart gets cells a fraction the
 * size a small one does, and text scaled to fit lands near 5px — which humans squint at and
 * rasterizers do not honour (WebKit clamps very small text upward, so it renders *overlapping*
 * its neighbours rather than merely tiny).
 */
const MIN_ORB_FONT_SIZE = 7;

/** Average glyph width of the table font, as a fraction of its size — a generous estimate for fitting text. */
const NAME_CHAR_WIDTH_EM = 0.58;

/** The font size at which `name` fits `width` (less a margin each side): `fontSize` unless the name is too wide. */
export function fitFontSize(name: string, fontSize: number, width: number, margin: number): number {
  const available = width - 2 * margin;
  const needed = name.length * NAME_CHAR_WIDTH_EM * fontSize;
  return needed <= available || needed === 0 ? fontSize : (fontSize * available) / needed;
}

/** `-3`, `6`, `-0`: whole degrees, signed by side of exact. A pair a hair short of exact reads `-0`, as on Astro-Seek. */
function formatSignedOrb(signedOrb: Degrees): string {
  return `${signedOrb < 0 ? '-' : ''}${String(Math.round(Math.abs(signedOrb)))}`;
}

/** An unordered pair key, so a lookup finds the aspect however the caller ordered its two bodies. */
function pairKey(a: string, b: string): string {
  return a <= b ? `${a} ${b}` : `${b} ${a}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** The sign a longitude falls in, with its degree and minute — rounded to the minute, as every other degree on the sheet. */
function positionParts(longitude: Degrees): {
  readonly signName: string;
  readonly element: string;
  readonly degree: number;
  readonly minute: number;
} {
  const totalMinutes = Math.round((((longitude % 360) + 360) % 360) * 60) % (360 * 60);
  const signIndex = Math.floor(totalMinutes / (30 * 60));
  const sign = SIGNS[signIndex];
  if (sign === undefined) throw new Error('unreachable: signIndex is within 0-11');
  const withinSign = totalMinutes - signIndex * 30 * 60;
  return {
    signName: sign.name,
    element: sign.element,
    degree: Math.floor(withinSign / 60),
    minute: withinSign % 60,
  };
}

/**
 * Renders the table and grid into `layout`, returning its markup and the height it used.
 *
 * The grid is square — `bodies.length` cells on each edge — with the table's width added on
 * the left. Nothing is drawn above the diagonal: an aspect is symmetric, so the upper triangle
 * would be the same data mirrored. `layout.width` is the width of the table plus the grid.
 */
export function renderAspectMatrixSvg(input: AspectMatrixInput, layout: PanelLayout): PanelRender {
  const count = input.bodies.length;
  if (count === 0) return { markup: '', height: 0 };

  const cell = layout.width / (count + TABLE_CELLS);
  const gridX = layout.x + TABLE_CELLS * cell;
  const glyphSize = cell * GLYPH_FRACTION;
  const tableFont = cell * TABLE_FONT_FRACTION;
  const labelFontSize = cell * LABEL_FONT_FRACTION;
  const orbFont = cell * ORB_FONT_FRACTION;
  const showOrb = orbFont >= MIN_ORB_FONT_SIZE;

  const byPair = new Map<string, MatrixAspect>();
  for (const aspect of input.aspects) {
    // A duplicate pair keeps the first entry: `ChartData.aspects` holds at most
    // one aspect per pair, so a second is a caller error, not something to
    // silently average.
    const key = pairKey(aspect.aKey, aspect.bKey);
    if (!byPair.has(key)) byPair.set(key, aspect);
  }

  const columnX: number[] = [];
  let runningX = layout.x;
  for (const width of TABLE_COLUMNS) {
    columnX.push(runningX);
    runningX += width * cell;
  }
  const [glyphX = 0, nameX = 0, degreeX = 0, signX = 0, minuteX = 0, houseX = 0] = columnX;
  const [glyphW = 0, nameW = 0, degreeW = 0, signW = 0, minuteW = 0, houseW = 0] = TABLE_COLUMNS.map(
    (width) => width * cell,
  );

  /** A glyph if the key has one, else its text label — both centred on the given point. */
  function rowGlyph(body: MatrixBody, cx: number, cy: number): string {
    const definition = bodyGlyph(body.key);
    const retrograde =
      body.retrograde === true
        ? text(
            cx + glyphSize * 0.55,
            cy + glyphSize * 0.42 + baselineOffset(cell * 0.26),
            'start',
            'chart-retrograde',
            'R',
            cell * 0.26,
          )
        : '';
    if (definition) {
      return renderGlyph(definition, cx, cy, glyphSize, `chart-glyph chart-glyph-${body.key}`) + retrograde;
    }
    return text(
      cx,
      cy + baselineOffset(labelFontSize),
      'middle',
      'chart-matrix-label',
      escapeXml(body.label),
      labelFontSize,
    );
  }

  const parts: string[] = [];

  input.bodies.forEach((rowBody, row) => {
    const y = layout.y + row * cell;
    const centerY = y + cell / 2;
    const { signName, element, degree, minute } = positionParts(rowBody.longitude);

    // The positions table: glyph, name, degree, sign, minutes, house.
    for (const [x, width] of [
      [glyphX, glyphW],
      [nameX, nameW],
      [degreeX, degreeW],
      [signX, signW],
      [minuteX, minuteW],
      [houseX, houseW],
    ] as const) {
      parts.push(rect(x, y, width, cell, 'chart-matrix-row-cell'));
    }
    parts.push(rowGlyph(rowBody, glyphX + glyphW / 2, centerY));
    // A name too wide for its column shrinks to fit rather than running into the degree (#432).
    const nameFont = fitFontSize(rowBody.name, tableFont, nameW, cell * 0.12);
    parts.push(
      text(
        nameX + cell * 0.12,
        centerY + baselineOffset(nameFont),
        'start',
        'chart-matrix-name',
        escapeXml(rowBody.name),
        nameFont,
      ),
      text(
        degreeX + degreeW - cell * 0.1,
        centerY + baselineOffset(tableFont),
        'end',
        'chart-matrix-position',
        `${pad2(degree)}°`,
        tableFont,
      ),
    );
    const signDefinition = signGlyph(signName);
    if (signDefinition) {
      parts.push(
        renderGlyph(
          signDefinition,
          signX + signW / 2,
          centerY,
          cell * SIGN_GLYPH_FRACTION,
          `chart-sign-glyph chart-sign-glyph-${signName.toLowerCase()} chart-sign-element-${element}`,
        ),
      );
    }
    parts.push(
      text(
        minuteX + minuteW - cell * 0.1,
        centerY + baselineOffset(tableFont),
        'end',
        'chart-matrix-position',
        `${pad2(minute)}'`,
        tableFont,
      ),
    );
    if (rowBody.house !== undefined) {
      parts.push(
        text(
          houseX + houseW / 2,
          centerY + baselineOffset(tableFont),
          'middle',
          'chart-matrix-position',
          String(rowBody.house),
          tableFont,
        ),
      );
    }

    // The diagonal cell names the row.
    const diagonalX = gridX + row * cell;
    parts.push(rect(diagonalX, y, cell, cell, 'chart-matrix-diagonal'));
    parts.push(rowGlyph(rowBody, diagonalX + cell / 2, centerY));

    for (let column = 0; column < row; column += 1) {
      const columnBody = input.bodies[column];
      if (columnBody === undefined) continue;
      const x = gridX + column * cell;
      const aspect = byPair.get(pairKey(rowBody.key, columnBody.key));
      const tight =
        aspect !== undefined && Math.abs(aspect.signedOrb) < TIGHT_ORB_DEG ? ' chart-matrix-cell-tight' : '';
      parts.push(
        rect(
          x,
          y,
          cell,
          cell,
          aspect ? `chart-matrix-cell chart-matrix-cell-${aspect.aspectKey}${tight}` : 'chart-matrix-cell',
        ),
      );
      if (!aspect) continue;
      const direction = aspect.applying ? 'applying' : 'separating';
      const glyph = aspectGlyph(aspect.aspectKey);
      if (glyph) {
        parts.push(
          renderGlyph(
            glyph,
            // Left of centre when the orb stack follows it; alone, it takes the whole cell.
            x + cell * (showOrb ? 0.33 : 0.5),
            centerY,
            cell * (showOrb ? CELL_GLYPH_FRACTION : GLYPH_FRACTION),
            `chart-aspect-glyph chart-aspect-glyph-${aspect.aspectKey} chart-aspect-${direction}`,
          ),
        );
      }
      if (showOrb) {
        parts.push(
          text(
            x + cell * 0.75,
            y + cell * 0.46,
            'middle',
            `chart-matrix-orb chart-aspect-${direction}`,
            formatSignedOrb(aspect.signedOrb),
            orbFont,
          ),
          text(
            x + cell * 0.75,
            y + cell * 0.82,
            'middle',
            `chart-matrix-direction chart-aspect-${direction}`,
            aspect.applying ? 'a' : 's',
            orbFont,
          ),
        );
      }
    }
  });

  return { markup: parts.join(''), height: count * cell };
}
