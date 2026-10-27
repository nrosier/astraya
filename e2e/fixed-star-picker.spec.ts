/**
 * The fixed-star picker in the Extended settings drawer's Special points tab (#803): search "Regulus", add it, Apply,
 * and the chart's fixed-star table checks the chosen star (and only it) instead of the seven-star preset. The test
 * person is born 22 August 1990, 12:00 in London: test data chosen because the Sun sits within 1° of Regulus and Mars
 * near Algol, so the preset shows both and the chosen list visibly shows only Regulus.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { newSeededContext } from './shared-people.ts';
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

test('search Regulus, add it, Apply: the chart checks the chosen star (#803)', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Star Picker',
    date: '1990-08-22',
    time: '12:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openNatalChart(page, 'Aspects');
  const starsTable = page.locator('.data-table', { has: page.getByText('Fixed stars', { exact: true }) });
  const starCells = starsTable.locator('tbody tr td:first-child');

  // Before: the seven-star preset, which finds Regulus and Algol for this person.
  await expect(starCells.filter({ hasText: 'Algol' }).first()).toBeVisible();
  await expect(page.getByText(/This table checks only 7 stars/)).toBeVisible();

  const card = page.locator('dialog.settings-card');
  const section = card.locator('fieldset.settings-card-group', { hasText: 'Search by name or designation' });

  // Stage Regulus, then Cancel: nothing changes.
  await openSettings(page, 'Special points');
  await section.getByLabel('Search by name or designation', { exact: true }).fill('Regulus');
  const result = section.locator('ul.fixed-star-results li').first();
  await expect(result).toContainText('Regulus');
  await expect(result).toContainText('alLeo');
  await expect(result).toContainText(/magnitude \d/);
  await section.getByRole('button', { name: 'Add Regulus', exact: true }).click();
  await expect(section.getByText('Draft, saved on Apply')).toBeVisible();
  await expect(section.getByText('1.0° uncited')).toBeVisible();
  await expect(section.getByText(/^Source file: sefstars\.txt · SHA-256 [0-9a-f]{8}$/)).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('dialog.settings-card').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await card.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card).toBeHidden();
  await expect(page.getByText(/This table checks only 7 stars/)).toBeVisible();

  // Add it and Apply: the person now carries Regulus, and the table checks it alone.
  await openSettings(page, 'Special points');
  await section.getByLabel('Search by name or designation', { exact: true }).fill('Regulus');
  await section.getByRole('button', { name: 'Add Regulus', exact: true }).click();
  await card.getByRole('button', { name: 'Apply and redraw', exact: true }).click();
  await expect(card).toBeHidden();
  await expect(page.getByText('This table checks only 1 star: Regulus.', { exact: false })).toBeVisible();
  await expect(starCells).toHaveText(['Regulus']);

  // It travels with the person: still there after a reload, and listed in the drawer without a draft tag.
  await page.reload();
  await page.waitForLoadState('load');
  await expect(starCells).toHaveText(['Regulus']);
  await openSettings(page, 'Special points');
  await expect(section.locator('tbody tr td:first-child')).toHaveText(['Regulus']);
  await expect(section.getByText('Draft, saved on Apply')).toHaveCount(0);
  await context.close();
});
