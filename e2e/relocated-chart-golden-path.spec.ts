/**
 * Relocated-chart workflow (#559/#572): a saved location recasts houses and angles while the
 * side-by-side comparison remains available after reopening the chart.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { createPerson, gotoAndSettle, openChart } from './support.ts';

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

test('a saved relocation renders a chart and natal-vs-relocated comparison (#559)', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openChart(page, 'Relocated');

  await page.getByLabel('Relocation latitude', { exact: true }).fill('-33.8688');
  await page.getByLabel('Relocation longitude', { exact: true }).fill('151.2093');
  await page.getByLabel('Save this location as', { exact: true }).fill('Sydney');
  await page.getByRole('button', { name: 'Save location', exact: true }).click();
  await expect(page.getByRole('option', { name: /Sydney \(-33\.8688, 151\.2093\)/ })).toBeAttached();

  await expect(page.locator('div.chart-wheel')).toBeVisible();
  const comparison = page.getByRole('table', { name: 'Natal vs. relocated' });
  await expect(comparison).toBeVisible();
  await expect(comparison).toContainText('Ascendant');
  await expect(comparison).toContainText('Midheaven');

  await page.reload();
  await page.waitForLoadState('load');
  await expect(page.getByLabel('Saved locations', { exact: true })).toContainText('Sydney');
  await page.getByLabel('Saved locations', { exact: true }).selectOption({ label: 'Sydney (-33.8688, 151.2093)' });
  await expect(page.getByRole('table', { name: 'Natal vs. relocated' })).toBeVisible();
});
