/**
 * The shared date stepper and the date in the URL (#1400): on Transits, Progressions and Solar Arc a URL carrying
 * `?date=` reopens on that date, and stepping the date writes the new day to the URL; on the Chart view the transit
 * ring's date opens from `?transit=`, and an edited ring date reaches the URL when Apply is pressed. Progressions also
 * gets its stepper proven: one month forward moves the date field and the table.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { openNatalChart, reloadAndSettle } from './support.ts';

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

/** Reopens the current screen with `?query` in its hash, as a shared link would, and waits for the app to settle. */
async function reopenWith(query: string): Promise<void> {
  const url = new URL(page.url());
  const route = url.hash.split('?')[0] ?? '';
  await page.goto(`${url.origin}${url.pathname}${route}?${query}`);
  await reloadAndSettle(page);
}

const SCREENS = [
  { name: 'Transits', link: 'Transits & Forecast', tab: 'Transits' },
  { name: 'Progressions', link: 'Progressions & Directions', tab: 'Progressions' },
  { name: 'Solar Arc', link: 'Progressions & Directions', tab: 'Solar Arc' },
] as const;

for (const screen of SCREENS) {
  test(`${screen.name}: ?date= opens on that date, and stepping a day writes the next day to the URL (#1400)`, async () => {
    test.setTimeout(60_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('link', { name: screen.link, exact: true }).click();
    await page.getByRole('tab', { name: screen.tab, exact: true }).click();
    await expect(page.getByRole('group', { name: 'Date and animation' })).toBeVisible();

    await reopenWith('date=2020-01-01');
    const bar = page.getByRole('group', { name: 'Date and animation' });
    const date = bar.getByLabel('As of', { exact: true });
    await expect(date).toHaveValue('2020-01-01');

    await bar.getByRole('button', { name: 'Step forward one day' }).click();
    await expect(date).toHaveValue('2020-01-02');
    await expect.poll(() => page.url()).toContain('date=2020-01-02');
  });
}

test('Progressions: stepping forward a month moves the date field and the progressed table (#1400)', async () => {
  test.setTimeout(60_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('tab', { name: 'Progressions', exact: true }).click();
  await reopenWith('date=2020-01-15');

  const bar = page.getByRole('group', { name: 'Date and animation' });
  const date = bar.getByLabel('As of', { exact: true });
  await expect(date).toHaveValue('2020-01-15');
  const table = page.getByRole('table', { name: 'Progressed positions' });
  await expect(table).toBeVisible();
  const before = await table.innerText();

  await bar.getByRole('radio', { name: 'Month', exact: true }).check({ force: true });
  await bar.getByRole('button', { name: 'Step forward one month' }).click();
  await expect(date).toHaveValue('2020-02-15');
  await expect.poll(async () => table.innerText()).not.toBe(before);
});

test('Chart: ?transit= opens the transit ring on that date, and an edited ring date reaches the URL on Apply (#1400)', async () => {
  test.setTimeout(90_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  await reopenWith('transit=2020-01-01');
  const trigger = page.locator('.chart-overlay-settings button.chart-overlay-trigger');
  const dialog = page.locator('.chart-overlay-settings dialog');
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Transit ring', exact: true })).toBeChecked();
  const date = dialog.getByLabel('Transit date', { exact: true });
  await expect(date).toHaveValue('2020-01-01');

  // A plain date field, no stepper (owner decision 2026-11-15): the date is typed in.
  await expect(dialog.getByRole('group', { name: 'Transit date stepper' })).toHaveCount(0);
  await date.fill('2020-01-02');
  await expect(date).toHaveValue('2020-01-02');
  // An edited ring date is only a draft until Apply (owner decision, #1400).
  expect(page.url()).not.toContain('2020-01-02');
  await dialog.getByRole('button', { name: 'Apply overlays', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.url()).toContain('transit=2020-01-02');
});
