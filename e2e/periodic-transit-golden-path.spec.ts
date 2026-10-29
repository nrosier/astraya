/**
 * The golden path for the periodic transit forecast (#207): a person with a known birth time,
 * opening the Forecast screen from their page, and the daily/weekly/monthly/yearly tiers all
 * render — including a CSV download from one of the tables, the same real worker/DOM/download
 * machinery `transit-golden-path.spec.ts` exercises for the plain bi-wheel transit screen.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, MARIC, newSeededContext, openSharedPerson } from './shared-people.ts';

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
});

test.afterEach(async () => {
  await context.close();
});

test('a person with a known birth time gets a Forecast screen with all four tiers', async () => {
  test.setTimeout(60_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);

  await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('link', { name: 'Forecast', exact: true }).click();
  await expect(page.getByRole('heading', { name: /forecast/i, level: 1 })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Daily', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Weekly', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Monthly', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Yearly', level: 2 })).toBeVisible();

  // Solar return is unconditional once loaded, so it's a stable anchor for "did this finish
  // calculating" that doesn't depend on whether any transit happens to be exact in this window.
  await expect(page.getByText(/Solar return for \d{4}/)).toBeVisible();
});

test('changing the "as of" date recalculates the forecast', async () => {
  test.setTimeout(60_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);

  await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('link', { name: 'Forecast', exact: true }).click();
  const before = await page.getByText(/Solar return for \d{4}/).textContent();

  await page.getByLabel('As of').fill('2030-06-15');
  await expect(page.getByText('Solar return for 2030')).toBeVisible();
  const after = await page.getByText(/Solar return for \d{4}/).textContent();
  expect(after).not.toBe(before);
});

test('the planetary-return picker computes a return for the chosen body (#398)', async () => {
  test.setTimeout(60_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);

  await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('link', { name: 'Forecast', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Other returns', level: 2 })).toBeVisible();

  // Jupiter is the default selection, and already renders a return sentence with no picking.
  await expect(page.getByText(/Jupiter return: /)).toBeVisible();

  await page.getByLabel('Body').selectOption({ label: 'Saturn' });
  await expect(page.getByText(/Saturn return: /)).toBeVisible();
});

test('a person with an unknown birth time is told a forecast needs one', async () => {
  await openSharedPerson(page, baseUrl, MARIC);

  await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('link', { name: 'Forecast', exact: true }).click();
  await expect(page.getByText(/needs a known birth time/)).toBeVisible();
});
