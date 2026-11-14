/**
 * The golden path for the heliocentric chart (#1407; owner decisions 2026-11-14): a person with a known birth time
 * opens Heliocentric from the chart-type select, and the chart renders with its own wheel and tables. The Earth takes
 * the Sun's place, the Moon is left out, and there are no houses or angles.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
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

test('a person with a known birth time gets a Heliocentric chart: Earth for the Sun, no Moon, no houses', async () => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openChart(page, 'Heliocentric');
  await expect(page.getByRole('heading', { name: /heliocentric/i, level: 1 })).toBeVisible();
  // The basis line names the frame, with no house system and no node model.
  await expect(page.locator('.page-header-basis')).toHaveText(/^Heliocentric · .+ rulers · .+ orbs$/);

  // The wheel has bodies but no house cusps or angle axes.
  const wheel = page.locator('div.chart-wheel');
  await expect(wheel).toBeVisible();
  await expect(wheel.locator('[data-house]')).toHaveCount(0);

  await page.getByRole('link', { name: 'Placements', exact: true }).click();
  const table = page.locator('#chart-view-placements table').first();
  await expect(table).toBeVisible();
  await expect(table.getByRole('cell', { name: 'Earth', exact: true })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'Mars', exact: true })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'Sun', exact: true })).toHaveCount(0);
  await expect(table.getByRole('cell', { name: 'Moon', exact: true })).toHaveCount(0);
  // No body is given a house: the House column reads a dash on every row.
  const earthRow = table.locator('tbody tr', { has: page.getByRole('cell', { name: 'Earth', exact: true }) });
  await expect(earthRow).toContainText('—');
  await page.screenshot({ path: 'test-results/heliocentric-placements.png', fullPage: false });
  await page.getByRole('link', { name: 'Wheel', exact: true }).click();
  await expect(wheel).toBeVisible();
  await page.screenshot({ path: 'test-results/heliocentric-wheel.png', fullPage: false });
});
