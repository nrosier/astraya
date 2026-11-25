/**
 * The golden path for harmonic/Varga charts (#170): a person with a known birth time, opening
 * the Harmonic screen from their page, picking a named Varga preset from the in-screen dropdown,
 * and the synthetic harmonic chart renders with its own wheel and data tables.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, MARIC, newSeededContext, openSharedPerson } from './shared-people.ts';
import { openChart } from './support.ts';

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

// A fresh context per test, holding the shared people (#799); no test here saves, edits or deletes one.
test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test('a person with a known birth time gets a Harmonic screen with a wheel and data tables', async () => {
  test.setTimeout(60_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openChart(page, 'Harmonic');
  await expect(page.getByRole('heading', { name: /harmonic/i, level: 1 })).toBeVisible();
  // #1059: the basis line names the harmonic on screen and offers the Edit link.
  await expect(page.locator('.page-header-basis')).toContainText(/ · D1 — Rashi \(natal\)$/);
  await expect(page.locator('.page-header-basis-edit')).toBeVisible();

  // The default preset already renders a chart, with no picking needed.
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Placements' })).toBeVisible();

  // #980: the general written reading lives on the interpretation page, not under a derived chart.
  await expect(page.locator('.report')).toHaveCount(0);

  await page.getByLabel('Divisional chart').selectOption({ label: 'D9 — Navamsha' });
  await expect(page.locator('div.chart-wheel')).toBeVisible();
});

test('a custom harmonic number renders its own chart', async () => {
  test.setTimeout(60_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openChart(page, 'Harmonic');
  await page.getByLabel('Divisional chart').selectOption({ label: 'Custom harmonic…' });
  await page.getByLabel('Harmonic number').fill('5');
  await expect(page.locator('div.chart-wheel')).toBeVisible();
});

test('Age at a date multiplies by the exact age, and Age+1 by the age plus one (#1407)', async () => {
  test.setTimeout(90_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openChart(page, 'Harmonic');
  const picker = page.getByLabel('Divisional chart');

  await picker.selectOption({ label: 'Age at a date' });
  await page.getByLabel('Age at', { exact: true }).fill('1914-03-14');
  // Einstein was born on 14 March 1879, so on 14 March 1914 he is 35 years old (a little over 35.00 in tropical years, as noon UT is after his birth time).
  await expect(page.locator('.page-header-basis')).toContainText(/Age harmonic 35\.\d{2} \(age at 1914-03-14\)$/);
  // #1407: the date sits in the control bar under the wheel, and its computed readout refreshes beside it.
  await expect(page.getByTestId('harmonic-age-readout')).toHaveText(/^Age harmonic 35\.\d{2} \(age at 1914-03-14\)$/);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Radix → harmonic provenance' })).toBeVisible();

  await picker.selectOption({ label: 'Age+1 at a date' });
  await expect(page.locator('.page-header-basis')).toContainText(/Age\+1 harmonic 36\.\d{2} \(age at 1914-03-14\)$/);
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  // A date before birth is refused, not drawn.
  await page.getByLabel('Age at', { exact: true }).fill('1800-01-01');
  await expect(page.getByText(/on or after birth/)).toBeVisible();
});

test('the arc transform brings the chosen pair into exact conjunction (#1407)', async () => {
  test.setTimeout(90_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openChart(page, 'Harmonic');
  await page.getByLabel('Divisional chart').selectOption({ label: 'Arc transform' });
  // Sun and Moon are the default pair.
  await expect(page.getByLabel('First point', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Second point', { exact: true })).toHaveValue('1');
  await expect(page.locator('.page-header-basis')).toContainText(
    /Arc transform Sun–Moon, harmonic \d+\.\d{2} \(Astraya’s reading of Solar Fire §12\.6\)$/,
  );
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  // The provenance table puts the Sun and the Moon at the same harmonic longitude.
  const table = page.getByRole('table', { name: 'Radix → harmonic provenance' });
  await expect(table).toBeVisible();
  const harmonicLongitude = async (body: string): Promise<number> => {
    // The row whose first cell is exactly the body's name; its third cell is the harmonic longitude, in degrees.
    const row = table.getByRole('row').filter({ has: page.getByRole('cell', { name: body, exact: true }) });
    const text = await row.getByRole('cell').nth(2).innerText();
    return Number.parseFloat(text);
  };
  const sun = await harmonicLongitude('Sun');
  const moon = await harmonicLongitude('Moon');
  expect(Math.min(Math.abs(sun - moon), 360 - Math.abs(sun - moon))).toBeLessThan(0.001);
  // An ordinary pair is under the warning threshold: no warning.
  await expect(page.getByText(/This harmonic is above 360/)).toHaveCount(0);

  // The same point twice is refused.
  await page.getByLabel('Second point', { exact: true }).selectOption({ label: 'Sun' });
  await expect(page.getByText('Choose two different points.')).toBeVisible();
});

test('a person with an unknown birth time is told a harmonic chart needs one', async () => {
  await openSharedPerson(page, baseUrl, MARIC);

  await openChart(page, 'Harmonic');
  await expect(page.getByText(/needs a real Ascendant/)).toBeVisible();
});
