/**
 * Journey 6 of the final acceptance list (#514): recover from a zero-result filter and from invalid
 * input. Both use the copy the app already ships: the transit filter's zero-result StatusMessage
 * ("No transits match the … filter", with its own "Clear filters" action) and the person form's
 * latitude range error. No new UI is asserted here.
 *
 * Step -> box text ("Recover from incomplete data, a zero-result filter, an offline network action, and a
 * calculation failure"):
 *   1. incomplete data      -> a new person with only a name: Save is off, the "Fill in the fields" hint says why,
 *                              and completing the record enables Save.
 *   2. a zero-result filter -> the transit filter's empty state and its "Clear filters" action.
 *   3. an offline network action -> with `context.setOffline(true)` the birth-place search is refused in words and
 *                              disabled, manual coordinates still save, and going back online restores the search.
 *   4. a calculation failure -> Primary Directions for a birthplace beyond the polar circle shows the shipped
 *                              `undefinedAtLatitude` message (PrimaryDirectionsView.messages.ts), with no arc; the
 *                              limit is `isDefinedAtLatitude` (|latitude| < 90 - obliquity), not a number chosen
 *                              here. Longyearbyen, Svalbard (78.2232 N, 15.6267 E) is far past it. Correcting the
 *                              place brings the arc back.
 * The latitude range error is kept as a bonus recovery for invalid input.
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
  await page.getByRole('tab', { name: 'Transits', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();
  const [, total] = await transitCount(page);

  // Untick every transiting and natal body in the filter dialog: nothing can match.
  await page.getByRole('button', { name: 'Which transits to show', exact: true }).click();
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
  await expect(page.getByRole('heading', { level: 2, name: /transits/i }).first()).toBeVisible();
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

/** Opens People and starts a new person with a name, as the first step of the incomplete-data, offline and failure journeys. */
async function startNewPerson(page: Page, name: string): Promise<void> {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('button', { name: 'Add a person', exact: true }).click();
  await labeledField(page, /^Name/, 'input[type="text"]').fill(name);
}

test('incomplete data: Save stays off with a reason beside it, and filling the missing fields turns it on', async () => {
  await startNewPerson(page, 'Incomplete Data');
  const save = page.getByRole('button', { name: /^(Save changes|Saved)$/ });

  // 1. The record is not complete: the button is disabled and the shipped hint says what to do.
  await expect(save).toBeDisabled();
  await expect(page.getByText('Fill in the fields marked above to save.')).toBeVisible();

  // 2. Complete it; the hint goes away and Save is available.
  await page.locator('input[type="date"]').fill('1990-06-15');
  await labeledField(page, /^Latitude/, 'input[type="number"]').fill('51.5072');
  await labeledField(page, /^Longitude/, 'input[type="number"]').fill('-0.1276');
  await expect(page.getByText('Fill in the fields marked above to save.')).toHaveCount(0);
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByLabel('Status: Saved on this device', { exact: true })).toBeVisible();
});

test('offline: a network-only action says it needs a connection, keeps manual entry, and recovers when back online', async () => {
  await startNewPerson(page, 'Offline Check');
  const search = labeledField(page, /^Search for a place by name/, 'input[type="text"]');
  const searchButton = page.getByRole('button', { name: 'Search', exact: true });
  const offlineNotice = page.getByText(
    'You are offline. This needs a connection; everything calculated on this device keeps working. You can still enter the coordinates yourself.',
  );
  await search.fill('Utrecht');
  await expect(searchButton).toBeEnabled();
  await expect(offlineNotice).toHaveCount(0);

  // 1. Go offline: the search is refused in words and the button is off.
  await context.setOffline(true);
  await expect(offlineNotice).toBeVisible();
  await expect(searchButton).toBeDisabled();

  // 2. What does not need the network still works: the coordinates can be typed and the person saved.
  await page.locator('input[type="date"]').fill('1990-06-15');
  await labeledField(page, /^Latitude/, 'input[type="number"]').fill('52.0907');
  await labeledField(page, /^Longitude/, 'input[type="number"]').fill('5.1214');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByLabel('Status: Saved on this device', { exact: true })).toBeVisible();

  // 3. Back online: the notice goes and the search is available again.
  await context.setOffline(false);
  await expect(offlineNotice).toHaveCount(0);
  await expect(searchButton).toBeEnabled();
});

// The shipped calculation-failure copy: Primary Directions says the birthplace has no Placidus semi-arcs. The rule is
// `isDefinedAtLatitude` in src/astrology/primary-directions.ts: defined only while |latitude| < 90 - obliquity, so
// the polar circle is the obliquity's complement and Longyearbyen (78.2232 N, 15.6267 E, Svalbard) lies beyond it.
test('calculation failure: Primary Directions at a birthplace beyond the polar circle explains why, and correcting the place recovers', async () => {
  test.setTimeout(90_000);
  await startNewPerson(page, 'Polar Birth');
  await page.locator('input[type="date"]').fill('1990-06-15');
  await labeledField(page, /^How the time is known/, 'select').selectOption('recorded');
  await page.locator('input[type="time"]').fill('12:00');
  await labeledField(page, /^Latitude/, 'input[type="number"]').fill('78.2232');
  await labeledField(page, /^Longitude/, 'input[type="number"]').fill('15.6267');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByLabel('Status: Saved on this device', { exact: true })).toBeVisible();

  // 1. The calculation cannot be made: the shipped message says so, and no arc is invented.
  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('tab', { name: 'Primary Directions (Placidus)', exact: true }).click();
  await expect(
    page.getByText(
      /Primary directions by Placidus semi-arcs cannot be calculated for this birthplace: at or beyond the polar circles/,
    ),
  ).toBeVisible();
  await expect(page.getByText(/Arc for this age: /)).toHaveCount(0);

  // 2. The rest of the app still works, and correcting the birthplace restores the calculation.
  await page.getByRole('link', { name: 'Birth record', exact: true }).click();
  await labeledField(page, /^Latitude/, 'input[type="number"]').fill('52.0907');
  await labeledField(page, /^Longitude/, 'input[type="number"]').fill('5.1214');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByLabel('Status: Saved on this device', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('tab', { name: 'Primary Directions (Placidus)', exact: true }).click();
  await expect(page.getByText(/Arc for this age: /)).toBeVisible();
  await expect(page.getByText(/cannot be calculated for this birthplace/)).toHaveCount(0);
});
