/**
 * The lunar phase return chart (#1407; Solar Fire Deluxe §12.10): a person with a known birth time opens it from the
 * Charts page's type selector, gets a wheel and the natal phase angle in the basis line, and a date and a choice of which
 * return around it (before, nearest, after) cast one chart, with the returns from the most recent one before the date
 * listed beneath. Read-only against the shared people (#799).
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

test('a lunar phase return chart with the natal phase angle, a date, a choice, and the list of returns (#1407)', async () => {
  test.setTimeout(120_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openChart(page, 'Lunar phase return');
  await expect(page.getByRole('heading', { name: /Lunar Phase Return/, level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/#\/people\/[^/]+\/charts\/lunar-phase-return\/wheel$/);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await expect(page.locator('.page-header-basis')).toContainText(/ · Phase angle \d+(\.\d)?°$/);

  // A fixed date makes the answer checkable: the return before it is earlier than it, the one after is not.
  await page.getByLabel('Around the date', { exact: true }).fill('2024-01-01');
  const moment = page.getByText(/^Phase return: /);
  await expect(moment).toBeVisible();
  const after = (await moment.innerText()).replace('Phase return: ', '');
  expect(after >= '2024-01-01').toBe(true);

  await page.getByRole('radio', { name: 'Before the date', exact: true }).check({ force: true });
  await expect(moment).not.toHaveText(`Phase return: ${after}`);
  const before = (await moment.innerText()).replace('Phase return: ', '');
  expect(before < '2024-01-01').toBe(true);

  // The list starts at the most recent return before the date and runs forward: three returns, about a month apart.
  const table = page.getByRole('table', { name: 'Phase returns from the last one before the date' });
  await expect(table).toBeVisible();
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(3);
  const first = await rows.nth(0).innerText();
  const second = await rows.nth(1).innerText();
  expect(first.trim()).toBe(before);
  expect(first.slice(0, 10) < '2024-01-01').toBe(true);
  expect(second.slice(0, 10) >= '2024-01-01').toBe(true);

  // Nearest is one of the two returns that bracket the date.
  await page.getByRole('radio', { name: 'Nearest', exact: true }).check({ force: true });
  await expect(moment).toBeVisible();
  const nearest = (await moment.innerText()).replace('Phase return: ', '');
  expect([before, after]).toContain(nearest);
});

test('the lunar phase return screen has no automatically detectable accessibility violations (#1407)', async () => {
  test.setTimeout(120_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openChart(page, 'Lunar phase return');
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('a person with an unknown birth time is told a lunar phase return needs one (#1407)', async () => {
  await openSharedPerson(page, baseUrl, MARIC);
  await openChart(page, 'Lunar phase return');
  await expect(page.getByText(/needs the natal Sun and Moon at a known time/)).toBeVisible();
  await expect(page.locator('div.chart-wheel')).toHaveCount(0);
});
