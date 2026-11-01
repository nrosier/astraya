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

test('a person with an unknown birth time is told a harmonic chart needs one', async () => {
  await openSharedPerson(page, baseUrl, MARIC);

  await openChart(page, 'Harmonic');
  await expect(page.getByText(/needs a real Ascendant/)).toBeVisible();
});
