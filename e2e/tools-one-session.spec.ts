/**
 * The three ephemeris-heavy tools in one session (#1856). In v0.57.0 a long session ended with "Aborted(segmentation
 * fault)" on Graphic ephemeris, Event search and Eclipses: sweph-wasm's `swe_calc_ut` leaked WASM memory on every call
 * until the heap was full, and the dead engine then failed every tool. The leak itself is pinned by
 * `test/ephemeris-calc-no-leak.test.ts`; this checks the user's path: the largest graphic ephemeris (five years, every
 * body), then an event search, then an eclipse search, all in one page, with no abort.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { build } from '../server/index.ts';
import { gotoAndSettle } from './support.ts';

let dir: string;
let app: Awaited<ReturnType<typeof build>>;
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

test('Graphic ephemeris (5 years, every body), Event search and Eclipses all complete in one session (#1856)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const aborts: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Aborted(')) aborts.push(message.text());
  });

  await gotoAndSettle(page, `${baseUrl}/#/explore/graphic-ephemeris`);
  for (const box of await page.locator('main input[type="checkbox"]').all()) {
    if (!(await box.isChecked())) await box.check();
  }
  await page.getByLabel('Start date').fill('2020-01-01');
  await page.getByLabel('End date').fill('2024-12-31');
  await page.getByRole('button', { name: 'Plot', exact: true }).click();
  await expect(page.locator('.graphic-ephemeris-plot svg')).toBeVisible({ timeout: 120_000 });

  await gotoAndSettle(page, `${baseUrl}/#/explore/event-search`);
  await page.getByRole('button', { name: 'Search events', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible({ timeout: 60_000 });

  await gotoAndSettle(page, `${baseUrl}/#/explore/eclipses`);
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.getByRole('table').first()).toBeVisible({ timeout: 60_000 });

  await expect(page.getByText(/Aborted\(|engine stopped unexpectedly/)).toHaveCount(0);
  expect(aborts).toEqual([]);
});
