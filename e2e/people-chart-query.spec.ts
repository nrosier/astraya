/**
 * The People page chart query (#1731): the list is visible on load with the query panel collapsed; the quick filter
 * narrows the list as you type; a run filters the same list in place, with the status line and the Chart query (n)
 * badge, and never runs while the query is edited; people the query cannot evaluate sit under the matches with their
 * reason; Clear and Reset bring the full list back; a saved search reopens into the query without running. Uses the
 * shared seed people (Einstein, Marić with no birth time, Born), at 1280x800 and 390x844.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { newSeededContext } from './shared-people.ts';
import { gotoAndSettle } from './support.ts';

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

/** The names in the main people list, in order (not the not-evaluable group, not the saved list). */
async function listedNames(page: Page): Promise<string[]> {
  return page.locator('main > ul.people a.person .name').allTextContents();
}

function conditionRow(page: Page): Locator {
  return page.locator('#chart-query-panel li.cond').first();
}

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`the chart query filters the one list in place at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const context = await newSeededContext(browser, baseUrl, { viewport });
    const page = await context.newPage();
    try {
      await gotoAndSettle(page, `${baseUrl}/#/people`);
      await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible();
      await expect.poll(() => listedNames(page)).toHaveLength(3);

      // Collapsed on load.
      const toggle = page.getByRole('button', { name: 'Chart query', exact: true });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#chart-query-panel')).toBeHidden();

      // The quick filter narrows the list as you type.
      const filter = page.getByRole('search', { name: 'Find people' }).getByRole('textbox');
      await filter.fill('einstein');
      await expect.poll(() => listedNames(page)).toEqual(['Albert Einstein']);
      await filter.fill('');
      await expect.poll(() => listedNames(page)).toHaveLength(3);

      // Editing the query never runs it.
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await conditionRow(page).getByLabel('Sign', { exact: true }).selectOption({ label: 'Pisces' });
      await expect(page.locator('.people-query-status')).toHaveCount(0);
      await expect.poll(() => listedNames(page)).toHaveLength(3);

      // A run filters the same list, with the status line and the badge.
      await page.getByRole('button', { name: 'Run search', exact: true }).click();
      await expect(page.locator('.people-query-status')).toContainText('Showing 1 of 3 people matching', {
        timeout: 60_000,
      });
      await expect.poll(() => listedNames(page)).toEqual(['Albert Einstein']);
      await expect(page.getByRole('button', { name: 'Chart query (1)', exact: true })).toBeVisible();

      // Clear brings the full list back, and the badge goes.
      await page.locator('.people-query-status').getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(page.locator('.people-query-status')).toHaveCount(0);
      await expect.poll(() => listedNames(page)).toHaveLength(3);
      await expect(page.getByRole('button', { name: 'Chart query', exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test('a house condition lists the person with no birth time under Could not be evaluated', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  try {
    await gotoAndSettle(page, `${baseUrl}/#/people`);
    await expect.poll(() => listedNames(page)).toHaveLength(3);
    await page.getByRole('button', { name: 'Chart query', exact: true }).click();
    await conditionRow(page).getByLabel('Condition', { exact: true }).selectOption({ label: 'Body in house' });
    await page.getByRole('button', { name: 'Run search', exact: true }).click();
    const group = page.locator('.people-not-evaluable');
    await expect(group).toContainText('Could not be evaluated', { timeout: 60_000 });
    await expect(group).toContainText('Mileva Marić');
    await expect(group).toContainText('No birth time');
    expect(await listedNames(page)).not.toContain('Mileva Marić');

    // Reset puts the starting condition back and clears the filter.
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(group).toHaveCount(0);
    await expect.poll(() => listedNames(page)).toHaveLength(3);
  } finally {
    await context.close();
  }
});

test('a saved search reopens into the query from Saved searches, and does not run', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  try {
    await gotoAndSettle(page, `${baseUrl}/#/people`);
    await expect.poll(() => listedNames(page)).toHaveLength(3);
    await page.getByRole('button', { name: 'Chart query', exact: true }).click();
    await conditionRow(page).getByLabel('Sign', { exact: true }).selectOption({ label: 'Pisces' });
    await page.getByLabel('Search name', { exact: true }).fill('Pisces suns');
    await page.getByRole('button', { name: 'Save search', exact: true }).click();
    await expect(page.locator('#chart-query-panel')).toContainText('Saved “Pisces suns”.');

    // Reset, then reopen the saved search: the condition comes back, and nothing runs.
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(conditionRow(page).getByLabel('Sign', { exact: true })).not.toHaveValue('11');
    await page.getByRole('button', { name: 'Saved searches', exact: true }).click();
    const card = page.getByRole('dialog', { name: 'Saved searches' });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Reopen Pisces suns', exact: true }).click();
    await expect(card).toBeHidden();
    await expect(page.locator('#chart-query-panel')).toBeVisible();
    await expect(conditionRow(page).getByLabel('Sign', { exact: true })).toHaveValue('11');
    await expect(page.locator('.people-query-status')).toHaveCount(0);
    await expect.poll(() => listedNames(page)).toHaveLength(3);
  } finally {
    await context.close();
  }
});
