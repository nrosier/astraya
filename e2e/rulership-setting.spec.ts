/**
 * The planetary-rulers choice (#426), end to end: modern by default, changed from a screen that shows
 * rulers, followed by the tables, kept on this device across a reload, and shared between screens.
 * The person has Scorpio rising and Pluto in Scorpio, where the three choices disagree.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { createPerson, gotoAndSettle, openNatalChart, openSettings } from './support.ts';

/** One of the planetary-rulers option cards (#513): a named radiogroup of Modern / Traditional / Both. */
function rulersOption(scope: Page | Locator, title: 'Modern' | 'Traditional' | 'Both'): Locator {
  return scope
    .getByRole('radiogroup', { name: 'Planetary rulers', exact: true })
    .getByRole('radio', { name: new RegExp(`^${title}`) });
}

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
  await page.getByRole('link', { name: 'Patterns & condition', exact: true }).click();

  // The control sits in the chart's Extended settings card, under "Rulership & dignities".
  await openSettings(page);
  const plutoChain = page
    .getByRole('table', { name: 'Dispositors' })
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name: 'Pluto', exact: true }) })
    .getByRole('cell')
    .nth(1);

  // Modern (the default): Pluto rules Scorpio, so Pluto in Scorpio is its own dispositor.
  await expect(rulersOption(page, 'Modern')).toBeChecked();
  await expect(plutoChain).toHaveText('Pluto');

  // Traditional: Mars rules Scorpio, so Pluto's dispositor is Mars.
  await rulersOption(page, 'Traditional').check();
  await expect(plutoChain).toContainText('Pluto → Mars');

  // Both: the chain follows the modern ruler, and the other ruler is shown beside it.
  await rulersOption(page, 'Both').check();
  await expect(plutoChain).toHaveText('Pluto (+ Mars)');

  // Kept on this device: still Both after a reload.
  await rulersOption(page, 'Traditional').check();
  await page.reload();
  await page.waitForEvent('load', { timeout: 5_000 }).catch(() => undefined);
  await page.getByRole('link', { name: 'Patterns & condition', exact: true }).click();
  await openSettings(page);
  await expect(rulersOption(page, 'Traditional')).toBeChecked();
  await expect(plutoChain).toContainText('Pluto → Mars');

  // The control and its explanation are accessible.
  const axe = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

test.describe('with the shared people (#799)', () => {
  let context: BrowserContext;
  let page: Page;

  // A fresh context per test, holding the shared people (#799).
  test.beforeEach(async ({ browser }) => {
    context = await newSeededContext(browser, baseUrl);
    page = await context.newPage();
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('the choice is shared by the other screens that show rulers (profections and transits)', async () => {
    test.setTimeout(90_000);

    await openSharedPerson(page, baseUrl, EINSTEIN);

    // Profections: the control is there, and it shows the choice made elsewhere.
    await page.getByRole('button', { name: 'Progressions & Directions', exact: true }).click();
    await page.getByRole('link', { name: 'Profections', exact: true }).click();
    await expect(rulersOption(page, 'Both')).toBeVisible();
    await rulersOption(page, 'Both').check();
    await expect(page.getByRole('table').first()).toBeVisible();

    // Transits: the rulers are a preference, not part of the filter (#513) — the staged "Change filters" dialog points to
    // Preferences, where the same choice is shown.
    await page.getByRole('button', { name: 'Transits & Forecast', exact: true }).click();
    await page.getByRole('link', { name: 'Transits', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /transits/i })).toBeVisible();
    await page.getByRole('button', { name: 'Change filters', exact: true }).click();
    await expect(rulersOption(page, 'Both')).toHaveCount(0);
    await page.getByRole('link', { name: 'change them in Preferences' }).click();
    await expect(rulersOption(page, 'Both')).toBeChecked();
  });
});
