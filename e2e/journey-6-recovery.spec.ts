/**
 * Journey 6 of the final acceptance list (#514): recover from a zero-result filter and from invalid
 * input. Both use the copy the app already ships: the transit filter's zero-result StatusMessage
 * ("No transits match the … filter", with its own "Clear filters" action) and the person form's
 * latitude range error. No new UI is asserted here.
 *
 * Not covered: a calculation failure. The only shipped copy for one is the Primary Directions
 * polar-latitude message, which needs a birthplace above the polar circle to reproduce, so it is
 * left to its own spec rather than invented here.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { gotoAndSettle, labeledField } from './support.ts';

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

// A fresh context per test, holding the shared people (#799). The invalid-input test creates its
// own person in that context and never saves an edit to a shared one.
test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

/** The transit contacts count, e.g. "Custom · 0 of 12 shown", as its shown and total numbers. */
async function transitCount(page: Page): Promise<readonly [number, number]> {
  const text = (await page.locator('.filter-summary-count').textContent()) ?? '';
  const match = /· (\d+) of (\d+) shown$/.exec(text);
  if (match === null) throw new Error(`unexpected count text: ${text}`);
  return [Number(match[1]), Number(match[2])];
}

test('a filter that matches no transits shows the empty state, and Clear filters restores them', async () => {
  test.setTimeout(60_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('link', { name: 'Transits', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();
  const [, total] = await transitCount(page);

  // Untick every transiting and natal body in the filter dialog: nothing can match.
  await page.getByRole('button', { name: 'Change filters', exact: true }).click();
  await page
    .getByRole('group', { name: 'Transiting planets' })
    .getByRole('button', { name: 'Clear', exact: true })
    .click();
  await page.getByRole('group', { name: 'Natal points' }).getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();

  await expect(
    page.getByText('No transits match the Custom filter. Widen it, or clear the filters to see all of them.'),
  ).toBeVisible();
  // The page still works: the screen heading is there and the count reads zero of the full set.
  await expect(page.getByRole('heading', { level: 1, name: /transits/i })).toBeVisible();
  const [zeroShown] = await transitCount(page);
  expect(zeroShown).toBe(0);

  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  const [restored] = await transitCount(page);
  expect(restored).toBe(total);
  await expect(page.getByText(/No transits match the/)).toHaveCount(0);
});

test('a latitude outside -90 to 90 shows a clear message, and correcting it clears the message', async () => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('button', { name: 'Add a person', exact: true }).click();
  await labeledField(page, /^Name/, 'input[type="text"]').fill('Range Check');
  await page.locator('input[type="date"]').fill('1990-06-15');

  await labeledField(page, /^Latitude/, 'input[type="number"]').fill('95');
  await expect(page.getByText('Latitude runs from -90 (south) to 90 (north).')).toBeVisible();

  await labeledField(page, /^Latitude/, 'input[type="number"]').fill('45.2');
  await expect(page.getByText('Latitude runs from -90 (south) to 90 (north).')).toHaveCount(0);
  await expect(labeledField(page, /^Latitude/, 'input[type="number"]')).toHaveValue('45.2');
});
