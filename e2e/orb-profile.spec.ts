/**
 * The orbs are the device's Extended settings (#590, #824): a rule set in the drawer's Bodies & orbs tab changes the natal aspects,
 * and it changes the Transit screen's contacts too, since transits use the same orbs. Real server,
 * store and ephemeris, as `transit-golden-path.spec.ts` uses.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { openNatalChart, openSettings } from './support.ts';

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

test('a rule set on the card changes the transit contacts too (#590)', async () => {
  test.setTimeout(90_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('link', { name: 'Transits', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();

  const totalCount = async (): Promise<number> => {
    const text = (await page.locator('.filter-summary-count').textContent()) ?? '';
    const match = /of (\d+) shown$/.exec(text);
    if (match === null) throw new Error(`unexpected count text: ${text}`);
    return Number(match[1]);
  };
  const builtInTotal = await totalCount();

  // The orbs are set on the Charts page, where the card lives; the Transit screen then uses them.
  await openNatalChart(page);
  await openSettings(page, 'Bodies & orbs');
  const card = page.locator('dialog.settings-card');
  await card.getByRole('button', { name: /Show aspect orbs/ }).click();
  await card.getByRole('group', { name: 'Conjunction', exact: true }).getByRole('spinbutton').first().fill('0');
  await card.getByRole('button', { name: 'Apply and redraw', exact: true }).click();
  await expect(card).toBeHidden();

  await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('link', { name: 'Transits', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();
  await expect.poll(totalCount).toBeLessThan(builtInTotal);
});

test('own orb rules on the natal chart change its aspects, name themselves in the settings button, and survive a profile reset', async () => {
  test.setTimeout(90_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openNatalChart(page, 'Aspects');
  const rows = page.locator('table').first().locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  const builtIn = await rows.count();

  // A conjunction orb of 0° leaves only exact conjunctions; every other aspect keeps its tier.
  await openSettings(page, 'Bodies & orbs');
  const card = page.locator('dialog.settings-card');
  await card.getByRole('button', { name: /Show aspect orbs/ }).click();
  await card.getByRole('group', { name: 'Conjunction', exact: true }).getByRole('spinbutton').first().fill('0');
  await card.getByRole('button', { name: 'Apply and redraw', exact: true }).click();
  await expect(card).toBeHidden();
  await expect(page.locator('button.extended-settings-trigger')).toContainText('Own orb rules');
  await expect.poll(() => rows.count()).toBeLessThan(builtIn);

  // The card reopens with the rule, the orb profile reads Custom, and the fixed preview line is gone.
  await openSettings(page, 'Bodies & orbs');
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
