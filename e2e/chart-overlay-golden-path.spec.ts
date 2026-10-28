/**
 * Canonical-chart overlay workflow (#558/#571, #817): independently configured transit and progressed
 * rings turn the natal wheel into a labelled triwheel, then each can be removed without touching
 * the remaining ring.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { chooseExport, openNatalChart } from './support.ts';

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

// A fresh context per test, holding the shared people (#799).
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

test('a natal, transit, and progressed triwheel is independently configurable (#558)', async () => {
  test.setTimeout(90_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  // The panel is a right slide-over drawer beside the wheel (#817), closed by default; the wheel stays visible while it
  // is open, and Apply closes it again.
  const trigger = page.locator('.chart-overlay-settings button.chart-overlay-trigger');
  const dialog = page.locator('.chart-overlay-settings dialog');
  await expect(dialog).toBeHidden();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-placement', 'right');
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  const drawerBox = await dialog.boundingBox();
  const wheelBox = await page.locator('div.chart-wheel').boundingBox();
  if (drawerBox === null || wheelBox === null) throw new Error('expected layout boxes');
  expect(drawerBox.x + drawerBox.width).toBeGreaterThan(1200);
  expect(drawerBox.x).toBeGreaterThan(wheelBox.x);
  await dialog.getByRole('checkbox', { name: 'Transit ring', exact: true }).check();
  await dialog.getByLabel('Transit date', { exact: true }).fill('2025-01-01');
  await dialog.getByRole('checkbox', { name: 'Secondary progressed ring', exact: true }).check();
  await dialog.getByLabel('Progressed to date', { exact: true }).fill('2025-01-01');
  await dialog.getByRole('checkbox', { name: 'Show inter-ring aspects', exact: true }).check();
  await dialog.getByRole('button', { name: 'Apply overlays', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

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
  expect(readFileSync(downloadPath, 'utf8')).toContain('data-ring-legend="2"');

  await trigger.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Move Secondary progressed ring inward', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply overlays', exact: true }).click();
  await expect(page.locator('[data-ring-legend="1"]')).toContainText('Secondary progressed ring');
  await expect(page.locator('[data-ring-legend="2"]')).toContainText('Transit');

  await trigger.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Transit ring', exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Apply overlays', exact: true }).click();
  await expect(legends).toHaveCount(2);
  await expect(page.locator('[data-ring-legend="0"]')).toContainText('Natal');
  await expect(page.locator('[data-ring-legend="1"]')).toContainText('Secondary progressed ring');

  // Cancel (and Escape) discard the draft and keep the applied rings.
  await trigger.click();
  await dialog.getByRole('checkbox', { name: 'Secondary progressed ring', exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(legends).toHaveCount(2);
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
