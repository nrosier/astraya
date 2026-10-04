/**
 * The planetary-rulers choice (#426), end to end: modern by default, changed from a screen that shows
 * rulers, followed by the tables, kept on this device across a reload, and shared between screens.
 * The person has Scorpio rising and Pluto in Scorpio, where the three choices disagree.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { createPerson, gotoAndSettle, openNatalChart, openSettings } from './support.ts';

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

test('the rulers choice is modern by default, drives the dispositor table, and is kept across a reload', async ({
  page,
}) => {
  test.setTimeout(90_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  // London, 15 June 1990, 17:00: Scorpio rising, and Pluto in Scorpio (the schemes disagree about both).
  await createPerson(page, {
    name: 'Scorpio Rising',
    date: '1990-06-15',
    time: '17:00:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await page.getByRole('tab', { name: 'Dignities', exact: true }).click();

  // The control sits in the chart's Extended settings card, under "On this device".
  await openSettings(page);
  const rulers = page.getByLabel('Planetary rulers', { exact: true });
  const plutoChain = page
    .getByRole('table', { name: 'Dispositors' })
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name: 'Pluto', exact: true }) })
    .getByRole('cell')
    .nth(1);

  // Modern (the default): Pluto rules Scorpio, so Pluto in Scorpio is its own dispositor.
  await expect(rulers).toHaveValue('modern');
  await expect(plutoChain).toHaveText('Pluto');

  // Traditional: Mars rules Scorpio, so Pluto's dispositor is Mars.
  await rulers.selectOption('traditional');
  await expect(plutoChain).toContainText('Pluto → Mars');

  // Both: the chain follows the modern ruler, and the other ruler is shown beside it.
  await rulers.selectOption('both');
  await expect(plutoChain).toHaveText('Pluto (+ Mars)');

  // Kept on this device: still Both after a reload.
  await rulers.selectOption('traditional');
  await page.reload();
  await page.waitForEvent('load', { timeout: 5_000 }).catch(() => undefined);
  await page.getByRole('tab', { name: 'Dignities', exact: true }).click();
  await openSettings(page);
  await expect(page.getByLabel('Planetary rulers', { exact: true })).toHaveValue('traditional');
  await expect(plutoChain).toContainText('Pluto → Mars');

  // The control and its explanation are accessible.
  const axe = await new AxeBuilder({ page }).include('.rulership-setting').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

test('the choice is shared by the other screens that show rulers (profections and transits)', async ({ page }) => {
  test.setTimeout(90_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Scorpio Rising',
    date: '1990-06-15',
    time: '17:00:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });

  // Profections: the control is there, and it shows the choice made elsewhere.
  await page.getByRole('button', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('link', { name: 'Profections', exact: true }).click();
  const rulers = page.getByLabel('Planetary rulers', { exact: true });
  await expect(rulers).toBeVisible();
  await rulers.selectOption('both');
  await expect(page.getByRole('table').first()).toBeVisible();

  // Transits: inside the filter's adjust section, and set to the same value.
  await page.getByRole('button', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('link', { name: 'Transits', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /transits/i })).toBeVisible();
  await page.getByText('Adjust the filter', { exact: true }).click();
  await expect(page.getByLabel('Planetary rulers', { exact: true })).toHaveValue('both');
});
