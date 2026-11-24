/**
 * The rise and set chart (#1407; Solar Fire Deluxe §12.9): a person with a known birth time opens it from the Charts
 * page's type selector, gets a wheel and a basis line naming the body, the event and the horizon, and a culmination has
 * no horizon to choose. Read-only against the shared people (#799).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
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

test('a rise and set chart for a body, an event and a horizon, with the event moment in the basis line (#1407)', async () => {
  test.setTimeout(120_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openChart(page, 'Rise/set');
  await expect(page.getByRole('heading', { name: /Rise and Set/, level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/#\/people\/[^/]+\/charts\/rise-set\/wheel$/);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await expect(page.locator('.page-header-basis')).toContainText(/ · Sun Rise \(True horizon\), \d{4}-\d\d-\d\d \d\d:\d\d UTC$/);

  // The Moon always sets within the search window at this latitude.
  await page.getByLabel('Body', { exact: true }).selectOption({ label: 'Moon' });
  await page.getByRole('radio', { name: 'Set', exact: true }).check({ force: true });
  await expect(page.locator('.page-header-basis')).toContainText(/ · Moon Set \(True horizon\), /);
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  await page.getByRole('radio', { name: 'Visual', exact: true }).check({ force: true });
  await expect(page.locator('.page-header-basis')).toContainText(/ · Moon Set \(Visual horizon\), /);
});

test('a culmination has no horizon to choose (#1407)', async () => {
  test.setTimeout(120_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openChart(page, 'Rise/set');
  await expect(page.getByRole('radiogroup', { name: 'Horizon', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Culmination', exact: true }).check({ force: true });
  await expect(page.getByRole('radiogroup', { name: 'Horizon', exact: true })).toHaveCount(0);
  await expect(page.locator('.page-header-basis')).toContainText(/ · Sun Culmination, \d{4}-/);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
});

test('the rise and set screen has no automatically detectable accessibility violations (#1407)', async () => {
  test.setTimeout(120_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openChart(page, 'Rise/set');
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('a person with an unknown birth time is told a rise and set chart needs one (#1407)', async () => {
  await openSharedPerson(page, baseUrl, MARIC);
  await openChart(page, 'Rise/set');
  await expect(page.getByText(/needs the birthplace and a known time/)).toBeVisible();
  await expect(page.locator('div.chart-wheel')).toHaveCount(0);
});
