/**
 * Journey 2 of the final acceptance list (#514): "Apply a temporary chart override, then separately save a
 * calculation default." Both actions live in the chart's Extended settings drawer and must stay separate scopes.
 *
 * Step -> box text:
 *   1. Apply a chart override -> on Einstein's natal chart choose Whole Sign and press "Apply and redraw"; the
 *      trigger reports the change and reopening the drawer shows Whole Sign for this chart.
 *   2. The override is not a default -> a person created afterwards still starts on Placidus.
 *   3. Separately save a default -> on the same chart choose Sidereal (Lahiri) and press "Save as my default";
 *      the drawer closes and the open chart keeps its own Whole Sign (the save never redraws it).
 *   4. The default is a default -> a person created after that starts on Sidereal (Lahiri), while Einstein, who
 *      already holds a copy, keeps his own Whole Sign.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { closeSettings, createPerson, gotoAndSettle, openNatalChart, openSettings } from './support.ts';

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

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

// A fresh context per test: the copy of the shared people and this device's default are this test's alone.
test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

const NEW_PERSON = {
  time: '17:00',
  date: '1990-06-15',
  latitude: '51.5072',
  longitude: '-0.1276',
};

test('a chart override applied to one chart is kept apart from a calculation default saved for new people', async () => {
  test.setTimeout(120_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  const card = page.locator('dialog.settings-card');
  const houseSystem = card.getByLabel('House system', { exact: true });
  const profile = card.getByRole('radiogroup', { name: 'Calculation profile', exact: true });

  // 1. Apply a chart override: Whole Sign for this chart only.
  await openSettings(page);
  await expect(houseSystem).toHaveValue('P');
  await houseSystem.selectOption('W');
  await card.getByRole('button', { name: 'Apply and redraw', exact: true }).click();
  await expect(card).toBeHidden();
  await expect(page.locator('button.extended-settings-trigger')).toContainText('changed');
  await openSettings(page);
  await expect(houseSystem).toHaveValue('W');
  await closeSettings(page);

  // 2. The override is not a default: a new person still starts on Placidus.
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, { name: 'After Override', ...NEW_PERSON });
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await openSettings(page);
  await expect(houseSystem).toHaveValue('P');
  await closeSettings(page);

  // 3. Separately save a default: Sidereal (Lahiri), from Einstein's chart, without redrawing it.
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await openSettings(page);
  await profile.getByRole('radio', { name: /^Sidereal/ }).check();
  await card.getByRole('button', { name: 'Save as my default', exact: true }).click();
  await expect(card).toBeHidden();
  await openSettings(page);
  await expect(houseSystem).toHaveValue('W');
  await closeSettings(page);

  // 4. The default is a default: a new person gets it, Einstein keeps his own copy.
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, { name: 'After Default', ...NEW_PERSON });
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await openSettings(page);
  await expect(profile.getByRole('radio', { name: /^Sidereal/ })).toBeChecked();
  await closeSettings(page);

  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await openSettings(page);
  await expect(houseSystem).toHaveValue('W');
  await closeSettings(page);
});
