/**
 * The chart's Extended settings card (#442): a summary button that opens a modal card, groups tagged by how they
 * apply, Apply and Cancel, starting points, and the phone layout.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { closeSettings, createPerson, gotoAndSettle, openNatalChart, openSettings } from './support.ts';

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

const ADA = {
  name: 'Ada Lovelace',
  date: '1815-12-10',
  time: '07:45:00',
  latitude: '51.5072',
  longitude: '-0.1276',
};

test('the settings open as a card, apply together or are dropped, and the button says what changed', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  const trigger = page.locator('button.extended-settings-trigger');
  await expect(trigger).toHaveText('Extended settings');

  // The groups, in the order a chart is set up, each saying how it applies.
  await openSettings(page);
  const card = page.locator('dialog.settings-card');
  await expect(card.getByRole('heading', { name: 'Extended settings', level: 2 })).toBeVisible();
  await expect(card.locator('fieldset.settings-card-group > legend')).toHaveText([
    'Chart frame',
    'Bodies and points',
    'Aspects and orbs',
    'Wheel colours',
    'Rulership & dignities',
    'How planetary and zodiac symbols are displayed',
    'On this device',
  ]);
  await expect(card.getByText('Saved on this device and applied at once.').first()).toBeVisible();
  await expect(card.getByRole('button', { name: /^Apply and redraw/ })).toBeDisabled();

  // Cancel drops the draft: nothing is applied and the button still says nothing.
  await card.getByLabel('House system', { exact: true }).selectOption('W');
  await card.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card).toBeHidden();
  await expect(trigger).toHaveText('Extended settings');
  await openSettings(page);
  await expect(card.getByLabel('House system', { exact: true })).toHaveValue('P');
  await closeSettings(page);

  // A starting point fills the profile in one go; applying it redraws and the button names what changed.
  await openSettings(page);
  // Target the first select element in the rulership-setting paragraph (the preset select, not the other settings)
  await card.locator('.rulership-setting select').first().selectOption('traditional');
  await expect(card.getByText('also sets the planetary rulers to Traditional')).toBeVisible();
  await card.getByRole('button', { name: 'Apply and redraw', exact: true }).click();
  await expect(card).toBeHidden();
  await expect(trigger).toContainText('Part of Fortune');
  await expect(trigger).toContainText('Chiron hidden');
  await expect(trigger).toContainText('changed');
  await openSettings(page);
  await expect(card.getByLabel('Planetary rulers', { exact: true })).toHaveValue('traditional');
  await expect(card.locator('.rulership-setting select').first()).toHaveValue('traditional');

  // The orbs now in force are spelled out, not only a percentage.
  await card.getByRole('slider', { name: 'Orb scale' }).fill('-10');
  await expect(card.getByText(/major aspects 6[.,]3°/)).toBeVisible();

  // Escape closes without applying.
  await card.getByLabel('House system', { exact: true }).selectOption('P');
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await openSettings(page);
  await expect(card.getByLabel('House system', { exact: true })).toHaveValue('W');

  const results = await new AxeBuilder({ page }).include('dialog.settings-card').analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('the card works on a phone: it fills the screen, scrolls inside, and keeps Apply in reach', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Charts', exact: true }).click();
  await page.getByRole('link', { name: 'Natal', exact: true }).click();
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  await openSettings(page);
  const card = page.locator('dialog.settings-card');
  const box = await card.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(388);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(790);
  await expect(card.getByRole('button', { name: /^Apply and redraw/ })).toBeInViewport();
  await expect(card.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
  expect(
    await page.evaluate(
      "document.querySelector('dialog.settings-card').scrollWidth - document.querySelector('dialog.settings-card').clientWidth",
    ),
  ).toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page }).include('dialog.settings-card').analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('opening and cancelling the card keeps what is selected on the wheel (applying redraws, which clears it)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  await page.getByRole('tab', { name: 'Positions', exact: true }).click();
  await page.getByRole('button', { name: 'Show Sun on the chart', exact: true }).click();
  await expect(page.locator('tr.data-table-row-selected')).toContainText('Sun');

  await openSettings(page);
  await closeSettings(page);
  await expect(page.locator('tr.data-table-row-selected')).toContainText('Sun');
});

test('the card is not part of the printed page', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('button.extended-settings-trigger')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('button.extended-settings-trigger')).toBeVisible();
});

test('the Apply button enables when only Symbols are changed (#459)', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  await openSettings(page);
  const card = page.locator('dialog.settings-card');
  const applyButton = card.getByRole('button', { name: /^Apply and redraw/ });

  // Initially disabled
  await expect(applyButton).toBeDisabled();

  // Change only the symbol class - should enable the apply button
  await card.getByLabel('Symbols', { exact: true }).selectOption('drawn');

  // The button should now be enabled
  await expect(applyButton).toBeEnabled();

  await closeSettings(page);
});
