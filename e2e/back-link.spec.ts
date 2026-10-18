/**
 * The Back link returns to the page the reader came from (#652), not to a fixed parent. From a person's chart,
 * Documents then Back lands on the chart again; opened fresh in a new tab, the same page's Back goes to People,
 * because there is nowhere inside the app to go back to.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { createPerson, gotoAndSettle, openNatalChart } from './support.ts';

let dir: string;
let app: FastifyInstance;
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

const ADA = { name: 'Ada Lovelace', date: '1815-12-10', time: '13:00:00', latitude: '51.5072', longitude: '-0.1276' };

test('Back from Documents returns to the chart the reader came from', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await openNatalChart(page);
  const chartUrl = page.url();

  await page.getByRole('banner').getByRole('link', { name: 'Documents', exact: true }).click();
  await expect(page).toHaveURL(/#\/documents$/);
  await page.getByRole('link', { name: '← Back' }).click();

  await expect(page).toHaveURL(chartUrl);
});

test('opened fresh, Back on Documents goes to People', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await gotoAndSettle(page, `${baseUrl}/#/documents`);
  await expect(page.getByRole('heading', { name: 'Documents', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: '← Back' }).click();
  await expect(page).toHaveURL(/#\/people$/);
  await context.close();
});

test('Back from the people list never lands on the bare #/ redirect', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/`);
  await expect(page).toHaveURL(/#\/people$/);
  await page.goto(`${baseUrl}/#/about`);
  await page.goBack();
  await expect(page).toHaveURL(/#\/people$/);
  await page.goBack();
  // Before #652 this was #/, which bounced forward to #/people again.
  expect(page.url()).not.toMatch(/#\/$/);
});
