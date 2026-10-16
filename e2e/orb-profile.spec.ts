/**
 * A person's own orb profile (#590): saved from the Transit screen, it survives a reload, changes
 * how many contacts the screen finds, and removing it brings the built-in orbs back. Real server,
 * store and ephemeris, as `transit-golden-path.spec.ts` uses.
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

test('a saved orb profile changes the transit contacts, persists, and can be removed', async ({ page }) => {
  test.setTimeout(90_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await page.getByRole('button', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('link', { name: 'Transits', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();

  const totalCount = async (): Promise<number> => {
    const text = (await page.locator('.transit-filter-count').textContent()) ?? '';
    const match = /of (\d+) shown$/.exec(text);
    if (match === null) throw new Error(`unexpected count text: ${text}`);
    return Number(match[1]);
  };
  const builtInTotal = await totalCount();

  await page.getByRole('button', { name: /Show orb profile/ }).click();
  await page.getByLabel('Profile name', { exact: true }).fill('Tight house');
  await page.getByRole('spinbutton', { name: /^Scale/ }).fill('-90');
  await page.mouse.move(0, 0);
  const axe = await new AxeBuilder({ page }).include('.primitive-disclosure').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await page.getByRole('button', { name: 'Save orb profile' }).click();
  await expect(page.getByText('Saved as revision 1.')).toBeVisible();

  await expect.poll(totalCount).toBeLessThan(builtInTotal);
  const tightTotal = await totalCount();

  await page.reload();
  await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();
  await expect.poll(totalCount).toBe(tightTotal);
  await expect(page.getByText('Tight house, revision 1')).toBeVisible();

  await page.getByRole('button', { name: /Show orb profile/ }).click();
  await page.getByRole('button', { name: 'Remove orb profile' }).click();
  await expect.poll(totalCount).toBe(builtInTotal);
});

test('own orb rules on the natal chart change its aspects, name themselves in the settings button, and survive a profile reset', async ({
  page,
}) => {
  test.setTimeout(90_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openNatalChart(page, 'Aspects');
  const rows = page.locator('table').first().locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  const builtIn = await rows.count();

  // A conjunction orb of 0° leaves only exact conjunctions; every other aspect keeps its tier.
  await openSettings(page);
  const card = page.locator('dialog.settings-card');
  await card.getByRole('button', { name: /Show aspect orbs/ }).click();
  await card.getByRole('group', { name: 'Conjunction', exact: true }).getByRole('spinbutton').first().fill('0');
  await card.getByRole('button', { name: 'Apply and redraw', exact: true }).click();
  await expect(card).toBeHidden();
  await expect(page.locator('button.extended-settings-trigger')).toContainText('Own orb rules');
  await expect.poll(() => rows.count()).toBeLessThan(builtIn);

  // The card reopens with the rule, the orb profile reads Custom, and the fixed preview line is gone.
  await openSettings(page);
  await expect(
    card.getByRole('radiogroup', { name: 'Orb profile' }).getByRole('radio', { name: /^Custom/ }),
  ).toBeChecked();
  await expect(card.getByText(/^Orbs now:/)).toHaveCount(0);
  await page.mouse.move(0, 0);
  const axe = await new AxeBuilder({ page }).include('dialog.settings-card').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // Choosing a built-in orb profile gives the orb definition back to the profile.
  await card
    .getByRole('radiogroup', { name: 'Orb profile' })
    .getByRole('radio', { name: /^Standard/ })
    .check();
  await card.getByRole('button', { name: 'Apply and redraw', exact: true }).click();
  await expect(card).toBeHidden();
  await expect(page.locator('button.extended-settings-trigger')).toHaveText('Extended settings');
  await expect.poll(() => rows.count()).toBe(builtIn);
});
