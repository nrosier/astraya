/**
 * Canonical-chart overlay workflow (#558/#571): independently configured transit and progressed
 * rings turn the natal wheel into a labelled triwheel, then each can be removed without touching
 * the remaining ring.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { chooseExport, createPerson, gotoAndSettle, openNatalChart } from './support.ts';

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

test('a natal, transit, and progressed triwheel is independently configurable (#558)', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  await page.getByRole('button', { name: 'Overlay settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Overlay settings', exact: true });
  await dialog.getByRole('checkbox', { name: 'Transit ring', exact: true }).check();
  await dialog.getByLabel('Transit date', { exact: true }).fill('2025-01-01');
  await dialog.getByRole('checkbox', { name: 'Secondary progressed ring', exact: true }).check();
  await dialog.getByLabel('Progressed to date', { exact: true }).fill('2025-01-01');
  await dialog.getByRole('checkbox', { name: 'Show inter-ring aspects', exact: true }).check();
  await dialog.getByRole('button', { name: 'Apply overlays', exact: true }).click();

  const legends = page.locator('[data-ring-legend]');
  await expect(legends).toHaveCount(3);
  await expect(page.locator('[data-ring-legend="0"]')).toContainText('Natal');
  await expect(page.locator('[data-ring-legend="1"]')).toContainText('Transit');
  await expect(page.locator('[data-ring-legend="2"]')).toContainText('Secondary progressed ring');
  await expect(page.getByRole('region', { name: 'Ring calculation basis' })).toContainText('Natal');
  await expect(page.getByRole('region', { name: 'Ring calculation basis' })).toContainText('Transit');
  await expect(page.getByRole('region', { name: 'Ring calculation basis' })).toContainText('Secondary progressed ring');
  await expect(page.locator('[data-ring-a="1"][data-ring-b="0"]')).not.toHaveCount(0);

  const downloadPromise = page.waitForEvent('download');
  await chooseExport(page, 'Image (SVG)');
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (downloadPath === null) throw new Error('SVG export did not produce a downloadable file');
  expect(readFileSync(downloadPath, 'utf8')).toContain('data-ring-legend="2"');

  await page.getByRole('button', { name: 'Overlay settings', exact: true }).click();
  await dialog.getByRole('button', { name: 'Move Secondary progressed ring inward', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply overlays', exact: true }).click();
  await expect(page.locator('[data-ring-legend="1"]')).toContainText('Secondary progressed ring');
  await expect(page.locator('[data-ring-legend="2"]')).toContainText('Transit');

  await page.getByRole('button', { name: 'Overlay settings', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Transit ring', exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Apply overlays', exact: true }).click();
  await expect(legends).toHaveCount(2);
  await expect(page.locator('[data-ring-legend="0"]')).toContainText('Natal');
  await expect(page.locator('[data-ring-legend="1"]')).toContainText('Secondary progressed ring');
});
