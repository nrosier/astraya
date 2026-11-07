/**
 * The Timing Timeline (#554, #1237): a Gantt chart with one labelled row per technique over one shared date axis, the same
 * events in a searchable table, and a technique filter beside it; the header holds the centre date, the 5Y/10Y range, Now
 * and Export. The chart is a picture of the table, so the two are checked against each other.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
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

async function openTimeline(): Promise<void> {
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('tab', { name: 'Timing timeline', exact: true }).click();
  await expect(page.locator('.gantt')).toBeVisible({ timeout: 60_000 });
}

test('shows every technique as a row of the chart, with the centre date marked, and the same events in the table', async () => {
  test.setTimeout(90_000);
  await openTimeline();

  await expect(page.locator('.gantt-row')).toHaveCount(8);
  await expect(page.locator('.gantt-target')).toHaveCount(8);
  await expect(page.getByRole('img', { name: /^Firdaria: \d+ events?$/ })).toBeVisible();
  const table = page.getByRole('table', { name: 'Timing events' });
  await expect(table).toBeVisible();
  // The chart and the table read the same events: every bar and tick is a table row.
  const marks = await page.locator('.gantt-bar, .gantt-point').count();
  await expect(table.locator('tbody tr')).toHaveCount(marks);
});

test('searches the events, and the technique filter takes a technique out of the chart and the table', async () => {
  test.setTimeout(90_000);
  await openTimeline();
  const table = page.getByRole('table', { name: 'Timing events' });
  const all = await table.locator('tbody tr').count();

  await page.getByLabel('Search the events').fill('Firdaria');
  const found = await table.locator('tbody tr').count();
  expect(found).toBeGreaterThan(0);
  expect(found).toBeLessThan(all);
  await page.getByLabel('Search the events').fill('no such event anywhere');
  await expect(page.getByText('No event matches that search.')).toBeVisible();
  await page.getByLabel('Search the events').fill('');

  await page.getByRole('group', { name: 'Techniques shown' }).getByLabel('Firdaria').uncheck();
  await expect(page.locator('.gantt-row')).toHaveCount(7);
  await expect(page.getByRole('img', { name: /^Firdaria/ })).toHaveCount(0);
  // The search found exactly the firdaria rows, so the table now holds the others.
  await expect(table.locator('tbody tr')).toHaveCount(all - found);
});

test('the 10Y range widens the axis, and Now returns the centre date to today', async () => {
  test.setTimeout(90_000);
  await openTimeline();
  const axis = page.locator('.gantt');
  const label5 = await axis.getAttribute('aria-label');

  await page.getByRole('radiogroup', { name: 'Range', exact: true }).getByLabel('10Y').check();
  await expect.poll(async () => axis.getAttribute('aria-label')).not.toBe(label5);

  await page.getByLabel('Centre date').fill('2000-01-01');
  await expect(page.locator('.gantt')).toBeVisible();
  await page.getByRole('button', { name: 'Now', exact: true }).click();
  await expect(page.getByLabel('Centre date')).not.toHaveValue('2000-01-01');
});
