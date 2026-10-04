/**
 * The golden path (#72): enter birth data, the wheel renders, and an export downloads. No unit
 * test exercises this end-to-end — `chart-compute.ts`/`chart-sheet.ts` are covered in isolation,
 * but never through the actual worker/DOM/download machinery a real browser provides.
 *
 * No sync/auth setup here, unlike `multi-device-sync.spec.ts` (#107): this path never touches
 * an account, so `build()` doesn't need `ASTRAYA_ENCRYPTION_KEY`, and the server-side sync relay
 * stays disabled throughout.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { chooseExport, createPerson, gotoAndSettle, openNatalChart } from './support.ts';

let dir: string;
let app: FastifyInstance;
let baseUrl: string;

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

test('entering birth data renders the chart wheel and the SVG export downloads', async ({ page }) => {
  test.setTimeout(60_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });

  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), chooseExport(page, 'Image (SVG)')]);
  expect(download.suggestedFilename()).toBe('ada-lovelace-chart.svg');

  const contents = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of contents) chunks.push(chunk as Buffer);
  const svg = Buffer.concat(chunks).toString('utf-8');
  expect(svg).toContain('<svg');
});

test('clicking a glyph on the wheel isolates it and opens a focused-info panel (#400)', async ({ page }) => {
  test.setTimeout(60_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });

  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  // `.chart-point` is the clickable glyph group; since #412 the Sun's radial stack and its degree
  // tick carry `data-body="sun"` too (so dimming reaches them), which is why this is narrower
  // than the bare attribute.
  const sunGlyph = page.locator('.chart-point[data-body="sun"]');
  await expect(sunGlyph).toHaveCount(1);
  await sunGlyph.click();

  const panel = page.locator('.chart-isolation-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Sun');
  await expect(page.locator('.chart-wheel .chart-dimmed').first()).toBeVisible();

  // Clicking the same glyph again toggles the isolation off.
  await sunGlyph.click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.chart-wheel .chart-dimmed')).toHaveCount(0);
});

test('clicking an aspect line isolates just its two endpoint bodies (#400)', async ({ page }) => {
  test.setTimeout(60_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });

  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  const line = page.locator('[data-aspect-body-a]').first();
  await line.click({ force: true });

  const panel = page.locator('.chart-isolation-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Orb');

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(panel).toHaveCount(0);
});

test('the Jones chart-shape diagram renders alongside its text sentence and explanation (#401, #430)', async ({
  page,
}) => {
  test.setTimeout(60_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });

  await openNatalChart(page);
  await page.getByRole('tab', { name: 'Chart shape', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chart shape', level: 2 })).toBeVisible();
  await expect(page.getByText(/Chart shape: /)).toBeVisible();
  await expect(page.locator('.chart-shape-diagram')).toBeVisible();
  await expect(page.locator('.chart-shape-diagram .chart-shape-ring')).toBeVisible();
  await expect(page.getByText(/Marc Edmund Jones \(1941\)/)).toBeVisible();
  await expect(page.locator('.lunar-phase-summary')).toBeVisible();
  await expect(page.getByText(/Sect: (Day|Night) chart/)).toBeVisible();
});

test('the natal chart is split into sections, opening on the wheel, and the wheel keeps its selection (#430)', async ({
  page,
}) => {
  test.setTimeout(60_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openNatalChart(page);

  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveText([
    'Chart wheel',
    'Chart shape',
    'Positions',
    'Houses',
    'Aspects',
    'Dignities',
    'Derived points',
  ]);
  await expect(page.getByRole('tab', { name: 'Chart wheel', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  // Select a planet, visit another section, come back: the selection is still there.
  await page.locator('.chart-point[data-body="sun"]').first().click({ force: true });
  await expect(page.locator('.chart-isolation-panel')).toBeVisible();
  await page.getByRole('tab', { name: 'Positions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Positions', level: 2 })).toBeVisible();
  await expect(page.locator('div.chart-wheel')).toBeHidden();
  await expect(page.getByRole('cell', { name: 'Sun', exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Chart wheel', exact: true }).click();
  await expect(page.locator('.chart-isolation-panel')).toBeVisible();

  // The arrow keys walk the strip.
  await page.getByRole('tab', { name: 'Chart wheel', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Chart shape', exact: true })).toBeFocused();
});

test('the natal chart sections fit a phone: the tab strip wraps instead of scrolling the page sideways (#430)', async ({
  page,
}) => {
  test.setTimeout(60_000);

  await page.setViewportSize({ width: 390, height: 800 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  // On a phone the navigation is folded behind the Menu button (#421).
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await openNatalChart(page);
  await expect(page.getByRole('tab', { name: 'Derived points', exact: true })).toBeVisible();
  const overflow = await page.evaluate('document.documentElement.scrollWidth - window.innerWidth');
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole('tab', { name: 'Chart shape', exact: true }).click();
  await expect(page.locator('.chart-shape-diagram')).toBeVisible();
  expect(await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(1);
});

test('a table row selects on the wheel and the wheel marks the table row (#418)', async ({ page }) => {
  test.setTimeout(60_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  // Table to wheel: press Show on the Sun's row, then go to the chart: it is isolated there.
  await page.getByRole('tab', { name: 'Positions', exact: true }).click();
  await page.getByRole('button', { name: 'Show Sun on the chart', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show Sun on the chart', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('tr.data-table-row-selected')).toContainText('Sun');
  await page.getByRole('button', { name: 'Go to the chart', exact: true }).click();
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await expect(page.locator('.chart-wheel .chart-dimmed').first()).toBeAttached();
  await expect(page.locator('.chart-isolation-panel')).toBeVisible();

  // Wheel to table: select the Moon on the wheel and the Positions table marks its row.
  await page.getByRole('button', { name: 'Clear', exact: true }).first().click();
  await page.locator('.chart-point[data-body="moon"]').first().click({ force: true });
  await page.getByRole('tab', { name: 'Positions', exact: true }).click();
  await expect(page.locator('tr.data-table-row-selected')).toContainText('Moon');
});
