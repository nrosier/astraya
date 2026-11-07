/**
 * #1229 — the scroll cue on the shared `.data-table-scroll` frame, at its two edges. The fade is four background
 * layers (`app.css`, `.data-table-scroll`): two `local` covers that travel with the table and hide the fade at an
 * end, and two `scroll` fades pinned to the frame. A computed `background-image` is the same string at every scroll
 * position, so these tests sample the frame's own pixels from an element screenshot to read which edge is showing.
 * Runs on the Consultation major active transits table, pinned to the same day and font as
 * `consultation-golden-path.spec.ts`.
 */
import { inflateSync } from 'node:zlib';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';

let dir: string;
let app: FastifyInstance;
let baseUrl: string;
let context: BrowserContext;
let page: Page;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-e2e-'));
  process.env.LOG_LEVEL = 'silent';

  app = await build({ dbPath: join(dir, 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

// A fresh context per test, holding the shared people (#799); no test here saves, edits or deletes one.
test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
  // Same pinned day as consultation-golden-path.spec.ts, so the transit table's rows and widths are stable.
  await page.clock.setFixedTime(new Date('2026-01-15T12:00:00'));
});

test.afterEach(async () => {
  await context.close();
});

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;

/** The table that scrolls on a phone: the Major active transits frame, the same locator the golden-path spec uses. */
function transitFrame(p: Page): Locator {
  return p.getByRole('region', { name: 'Major active transits', exact: true }).and(p.locator('div.data-table-scroll'));
}

/** Pins the table font as the golden-path spec does, so the table width (and so the overflow) is the same on every machine. */
async function pinTableFont(p: Page): Promise<void> {
  const family = 'E2E Pinned Table';
  await p.addStyleTag({
    content: `@font-face { font-family: "${family}"; src: url("/fonts/pdf/DejaVuSans.ttf") format("truetype"); }
.consultation-section .data-table { font-family: "${family}"; }`,
  });
  await p.evaluate(`document.fonts.load('1em "${family}"')`);
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Bitmap {
  width: number;
  height: number;
  channels: number;
  pixels: Buffer;
}

type CueState = 'covered' | 'faded' | 'ambiguous';

interface EdgeReading {
  left: CueState;
  right: CueState;
}

function isColourPair(value: unknown): value is { cover: string; line: string } {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.cover === 'string' && typeof v.line === 'string';
}

function parseRgb(css: string): Rgb {
  const parts = css.match(/[\d.]+/g);
  if (parts === null || parts.length < 3) throw new Error(`not an rgb colour: ${css}`);
  return { r: Number(parts[0]), g: Number(parts[1]), b: Number(parts[2]) };
}

function distance(a: Rgb, b: Rgb): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decodes an 8-bit RGB or RGBA, non-interlaced PNG (what Playwright writes) to raw pixels. */
function decodePng(png: Buffer): Bitmap {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data.readUInt8(8);
      const colourType = data.readUInt8(9);
      if (bitDepth !== 8 || (colourType !== 6 && colourType !== 2))
        throw new Error(`unsupported PNG: bit depth ${String(bitDepth)}, colour type ${String(colourType)}`);
      channels = colourType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + length;
  }

  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw.readUInt8(y * (stride + 1));
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw.readUInt8(src + i);
      const a = i >= channels ? pixels.readUInt8(row + i - channels) : 0;
      const b = y > 0 ? pixels.readUInt8(row - stride + i) : 0;
      const c = i >= channels && y > 0 ? pixels.readUInt8(row - stride + i - channels) : 0;
      let predicted: number;
      switch (filter) {
        case 0:
          predicted = 0;
          break;
        case 1:
          predicted = a;
          break;
        case 2:
          predicted = b;
          break;
        case 3:
          predicted = (a + b) >> 1;
          break;
        case 4:
          predicted = paeth(a, b, c);
          break;
        default:
          throw new Error(`unknown PNG filter ${String(filter)}`);
      }
      pixels.writeUInt8((x + predicted) & 0xff, row + i);
    }
  }
  return { width, height, channels, pixels };
}

/** Mean colour distance from `cover` over a vertical strip of the frame, sampled between 20% and 80% of its height. */
function stripDistance(bitmap: Bitmap, xFrom: number, xTo: number, cover: Rgb): number {
  const top = Math.round(bitmap.height * 0.2);
  const bottom = Math.round(bitmap.height * 0.8);
  let total = 0;
  let samples = 0;
  for (let y = top; y < bottom; y += 2) {
    for (let x = xFrom; x < xTo; x++) {
      const i = (y * bitmap.width + x) * bitmap.channels;
      total += distance(
        { r: bitmap.pixels.readUInt8(i), g: bitmap.pixels.readUInt8(i + 1), b: bitmap.pixels.readUInt8(i + 2) },
        cover,
      );
      samples++;
    }
  }
  return total / samples;
}

/**
 * Reads which edges of the frame show the fade. A cover is the frame's colour, so a covered edge sits at distance 0;
 * a showing fade is the border colour (`--line`) fading out over the first `--scroll-cue-width` px, so it sits well
 * away from the cover. The two are judged against the border colour, so the call holds in light and dark themes.
 */
async function readEdges(frame: Locator): Promise<EdgeReading> {
  const colours: unknown = await frame.evaluate(`(() => {
    const el = document.querySelector('.consultation-section .data-table-scroll');
    const probe = document.createElement('i');
    probe.style.color = getComputedStyle(el).getPropertyValue('--scroll-cover');
    document.body.append(probe);
    const cover = getComputedStyle(probe).color;
    probe.remove();
    return { cover, line: getComputedStyle(el).borderTopColor };
  })()`);
  if (!isColourPair(colours)) throw new Error('the frame did not report its cover and border colours');
  const cover = parseRgb(colours.cover);
  const line = parseRgb(colours.line);
  const lineDistance = distance(line, cover);
  if (lineDistance < 15) throw new Error('the frame border and its cover are too close in colour to read the cue');

  const box = await frame.boundingBox();
  if (box === null) throw new Error('the transit frame has no box');
  const bitmap = decodePng(await frame.screenshot());
  const scale = bitmap.width / box.width;
  // Sample just inside each 1px border, clear of the cue's far end: 2-6px from the left, 2-6px from the right.
  const leftDistance = stripDistance(bitmap, Math.round(2 * scale), Math.round(6 * scale), cover);
  const rightDistance = stripDistance(
    bitmap,
    Math.round((box.width - 6) * scale),
    Math.round((box.width - 2) * scale),
    cover,
  );
  return { left: classify(leftDistance, lineDistance), right: classify(rightDistance, lineDistance) };
}

function classify(edgeDistance: number, lineDistance: number): CueState {
  if (edgeDistance <= 0.1 * lineDistance) return 'covered';
  if (edgeDistance >= 0.5 * lineDistance) return 'faded';
  return 'ambiguous';
}

/** Columns hidden beyond the frame's visible width; zero or one when the table fits. */
const OVERFLOW = `(() => {
  const el = document.querySelector('.consultation-section .data-table-scroll');
  return el.scrollWidth - el.clientWidth;
})()`;

/** Where the frame's scroll position sits: `start` at 0, `end` at its maximum, `middle` halfway between. */
function scrollPosition(where: 'start' | 'middle' | 'end'): string {
  return `(() => {
    const el = document.querySelector('.consultation-section .data-table-scroll');
    const max = el.scrollWidth - el.clientWidth;
    const target = ${JSON.stringify(where)};
    el.scrollLeft = target === 'start' ? 0 : target === 'end' ? max : max / 2;
    return Math.abs(el.scrollLeft - (target === 'start' ? 0 : target === 'end' ? max : max / 2)) <= 1;
  })()`;
}

async function scrollTo(frame: Locator, where: 'start' | 'middle' | 'end'): Promise<void> {
  // Scroll, then wait until the browser has applied it before reading pixels.
  await expect.poll(() => frame.evaluate(scrollPosition(where))).toBe(true);
}

async function openConsultation(width: number, height: number): Promise<Locator> {
  // Open at the default desktop size, where the workspace nav shows the Consultation link, then resize (as the golden-path spec does).
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Consultation', exact: true }).click();
  await page.setViewportSize({ width, height });
  await expect(page.getByRole('heading', { level: 2, name: 'Major active transits' })).toBeVisible();
  await pinTableFont(page);
  const frame = transitFrame(page);
  await expect(frame).toBeVisible();
  return frame;
}

for (const { width, height } of VIEWPORTS) {
  test(`the scroll cue draws only on the edge that hides columns: right at the start, left at the end, neither when the table fits at ${String(width)}px (#1229)`, async () => {
    test.setTimeout(60_000);
    const frame = await openConsultation(width, height);
    const overflow = await frame.evaluate(OVERFLOW);

    if (width === 390) {
      expect(overflow).toBeGreaterThan(0);

      await scrollTo(frame, 'start');
      expect(await readEdges(frame)).toEqual({ left: 'covered', right: 'faded' });

      await scrollTo(frame, 'end');
      expect(await readEdges(frame)).toEqual({ left: 'faded', right: 'covered' });
    } else {
      // At this width the table fits, so no edge hides a column and neither edge may show the fade.
      expect(overflow).toBeLessThanOrEqual(1);
      expect(await readEdges(frame)).toEqual({ left: 'covered', right: 'covered' });
    }
  });

  test(`the #1076 cue follows the scroll position: start, middle and end give three different edge states on a wide table at ${String(width)}px (#1229)`, async () => {
    test.setTimeout(60_000);
    const frame = await openConsultation(width, height);
    const overflow = await frame.evaluate(OVERFLOW);

    if (width === 390) {
      expect(overflow).toBeGreaterThan(0);

      await scrollTo(frame, 'start');
      const start = await readEdges(frame);
      await scrollTo(frame, 'middle');
      const middle = await readEdges(frame);
      await scrollTo(frame, 'end');
      const end = await readEdges(frame);

      expect(start).toEqual({ left: 'covered', right: 'faded' });
      expect(middle).toEqual({ left: 'faded', right: 'faded' });
      expect(end).toEqual({ left: 'faded', right: 'covered' });
    } else {
      // The table fits at this width, so there is no scroll to follow: the cue stays off on both edges throughout.
      expect(overflow).toBeLessThanOrEqual(1);
      expect(await readEdges(frame)).toEqual({ left: 'covered', right: 'covered' });
    }
  });
}
