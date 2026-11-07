/**
 * The person Overview as a launchpad (#1173): a birth-data health checklist with a fix for each item, a "continue where
 * you left off" section that shows only what exists, and one "now" line that links to Consultation.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, MARIC, newSeededContext, openSharedPerson } from './shared-people.ts';
import { openNatalChart, openTool } from './support.ts';

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

async function openOverview(): Promise<void> {
  await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /^Overview/, level: 1 })).toBeVisible();
}

test('lists what is uncertain in the birth data, and the fix link puts the cursor in that field', async () => {
  test.setTimeout(60_000);
  await openSharedPerson(page, baseUrl, MARIC);
  await openOverview();

  const health = page.getByRole('region', { name: 'Birth data' });
  await expect(health.getByText('The birth time is unknown, so houses and angles are not shown.')).toBeVisible();
  await health.getByRole('link', { name: 'Change how the time is known' }).click();
  await expect(page).toHaveURL(/\/birth-record\?focus=accuracy$/);
  await expect(page.getByLabel('How the time is known')).toBeFocused();
});

test('flags a missing birth-data source, and the fix link puts the cursor in the source field (#1262)', async () => {
  test.setTimeout(60_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openOverview();

  const health = page.getByRole('region', { name: 'Birth data' });
  await expect(health.getByText('The source of the birth data is not recorded.')).toBeVisible();
  await health.getByRole('link', { name: 'Record the source' }).click();
  await expect(page).toHaveURL(/\/birth-record\?focus=source$/);
  const source = page.getByLabel('Data source');
  await expect(source).toBeFocused();
  // The choices are the ones the owner decided (#1262), with "Not recorded" first.
  await expect(source.locator('option')).toHaveText([
    'Not recorded',
    'Birth certificate or registry',
    'Family record',
    'Remembered',
    'Chart collection (for example Astro-Databank)',
    'Other',
  ]);
  await expect(page.getByLabel('Source note (optional)')).toBeVisible();
});

test('offers no resume section until a chart is opened, then continues there', async () => {
  test.setTimeout(90_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openOverview();

  // The seeded record is a real 1879 birth: the checklist names what is shaky about it, each with its own fix link.
  const health = page.getByRole('region', { name: 'Birth data' });
  const items = health.getByRole('listitem');
  expect(await items.count()).toBeGreaterThan(0);
  await expect(items.first().getByRole('link')).toBeVisible();
  // Nothing to resume yet: the section is not there at all, not an empty heading.
  await expect(page.getByRole('heading', { name: 'Continue where you left off' })).toHaveCount(0);

  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await openOverview();
  await page
    .getByRole('region', { name: 'Continue where you left off' })
    .getByRole('link', { name: 'The chart you last opened' })
    .click();
  await expect(page.locator('div.chart-wheel')).toBeVisible();
});

test('shows one "now" line that links to Consultation', async () => {
  test.setTimeout(90_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openOverview();

  const now = page.getByRole('link', { name: /^Now: profected year in .+, lord .+\. See Consultation\.$/ });
  await expect(now).toBeVisible({ timeout: 60_000 });
  await now.click();
  await expect(page).toHaveURL(/\/consultation$/);
});

test('puts Sun, Moon and Rising in a card under the natal wheel, in the same column (#1173)', async () => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openOverview();

  const wheel = page.locator('section.overview-card--wheel');
  const placements = page.getByRole('region', { name: 'Sun, Moon and Rising' });
  await expect(placements).toBeVisible({ timeout: 60_000 });
  await expect(placements.getByText('Sun', { exact: true })).toBeVisible();
  await expect(placements.getByText('Moon', { exact: true })).toBeVisible();
  await expect(placements.getByText('Rising', { exact: true })).toBeVisible();
  await expect(placements.getByText(/Pisces/)).toBeVisible();
  const above = await wheel.boundingBox();
  const below = await placements.boundingBox();
  if (above === null || below === null) throw new Error('expected both cards to have a layout box');
  expect(below.y).toBeGreaterThanOrEqual(above.y + above.height);
  expect(below.x).toBeCloseTo(above.x, 0);
  expect(below.width).toBeCloseTo(above.width, 0);
  // One row each, one above the other, with no frame of their own inside the card.
  const sun = await placements.getByText('Sun', { exact: true }).boundingBox();
  const moon = await placements.getByText('Moon', { exact: true }).boundingBox();
  const rising = await placements.getByText('Rising', { exact: true }).boundingBox();
  if (sun === null || moon === null || rising === null) throw new Error('expected the three rows to have a layout box');
  expect(moon.y).toBeGreaterThan(sun.y);
  expect(rising.y).toBeGreaterThan(moon.y);
  expect(moon.x).toBeCloseTo(sun.x, 0);
  await expect(placements.locator('li').first()).toHaveCSS('border-top-width', '0px');
});

test('on Transits the text above the wheel runs as wide as the wheel (#1225)', async () => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Transits', exact: true }).click();
  const wheel = page.locator('div.chart-wheel');
  await expect(wheel).toBeVisible({ timeout: 60_000 });
  const hint = page.getByText(/^A bi-wheel/);
  const hintBox = await hint.boundingBox();
  const wheelBox = await wheel.boundingBox();
  if (hintBox === null || wheelBox === null) throw new Error('expected the text and the wheel to have a layout box');
  // The text's box is the full content width, not a 44rem column.
  expect(hintBox.width).toBeGreaterThan(44 * 16 + 40);
  expect(hintBox.width).toBeGreaterThanOrEqual(wheelBox.width);
});

test('lists the account saved searches under Continue where you left off, and opens one into Event search (#1261)', async () => {
  test.setTimeout(120_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openOverview();
  // Nothing saved yet: the card shows no saved search.
  await expect(page.getByRole('link', { name: /^Saved search:/ })).toHaveCount(0);

  await openTool(page, 'Ephemeris research');
  await page.getByLabel('From', { exact: true }).fill('2027-03-01');
  await page.getByLabel('To', { exact: true }).fill('2027-09-30');
  await page.getByLabel('Query name', { exact: true }).fill('Mars stations 2027');
  await page.getByRole('button', { name: 'Save query', exact: true }).click();
  await expect(page.getByText('Saved “Mars stations 2027”.')).toBeVisible();

  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openOverview();
  const search = page.getByRole('link', { name: 'Saved search: Mars stations 2027' });
  await expect(search).toBeVisible();
  await search.click();
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('2027-03-01');
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('2027-09-30');
  await expect(page.getByText(/events found/)).toHaveCount(0);
});

test('offers comparing with another person once there are two people, and goes to the relationship screen', async () => {
  test.setTimeout(60_000);
  // The shared people hold more than one person, so the goal is there; with a single person it is not offered.
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openOverview();
  const compare = page.getByRole('link', { name: 'Compare with another person', exact: true });
  await expect(compare).toBeVisible();
  await compare.click();
  await expect(page).toHaveURL(/\/relationships\/synastry$/);
});
