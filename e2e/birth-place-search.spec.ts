/**
 * The birth-place search (#290): the sole way to set the same Latitude/Longitude fields
 * `createPerson`/`support.ts` already exercises via the box inputs, since a search a
 * click-to-confirm result never silently sets them on its own. Coverage here is intentionally
 * e2e-only — see `BirthPlaceSearch.tsx`'s doc comment for why it has no unit test;
 * `forward-geocode.ts`'s own lookup logic has its Vitest unit tests in
 * `test/forward-geocode.test.ts`.
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

// Each test starts in a fresh context holding the three shared people (#799); none of them saves, edits or deletes one.
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

async function readFields(page: Page): Promise<{ latitude: number; longitude: number }> {
  const latitude = await labeledField(page, /^Latitude/, 'input[type="number"]').inputValue();
  const longitude = await labeledField(page, /^Longitude/, 'input[type="number"]').inputValue();
  return { latitude: Number(latitude), longitude: Number(longitude) };
}

// Real calls to Nominatim from an automated test run would be flaky (rate-limited) and a policy
// violation in its own right if run repeatedly in CI: https://operations.osmfoundation.org/policies/nominatim/.
async function stubNominatimSearch(page: Page, response: unknown, options: { status?: number } = {}): Promise<void> {
  await page.route('**/nominatim.openstreetmap.org/search**', async (route) => {
    await route.fulfill({
      status: options.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

async function startPersonWithoutCoordinates(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add a person', exact: true }).click();
  await labeledField(page, /^Name/, 'input[type="text"]').fill('New Person');
  await page.locator('input[type="date"]').fill('1990-06-15');
}

test('"Search for a place by name" stays visible whether or not coordinates already exist (#290)', async () => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await startPersonWithoutCoordinates(page);

  await expect(labeledField(page, /^Search for a place by name/, 'input[type="text"]')).toBeVisible();

  await labeledField(page, /^Latitude/, 'input[type="number"]').fill('51.5072');
  await labeledField(page, /^Longitude/, 'input[type="number"]').fill('-0.1276');

  await expect(labeledField(page, /^Search for a place by name/, 'input[type="text"]')).toBeVisible();
});

test('a single search match is still shown as a click-to-confirm dropdown, and picking it fills coordinates and Place of birth (#290)', async () => {
  await stubNominatimSearch(page, [{ lat: '48.8566', lon: '2.3522', display_name: 'Paris, Île-de-France, France' }]);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await startPersonWithoutCoordinates(page);

  await labeledField(page, /^Search for a place by name/, 'input[type="text"]').fill('Paris');
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  const result = page.getByRole('option', { name: /^Paris, Île-de-France, France/ });
  await expect(result).toBeVisible();
  await result.click();

  await expect(labeledField(page, /^Latitude/, 'input[type="number"]')).toHaveValue('48.8566');
  await expect(labeledField(page, /^Longitude/, 'input[type="number"]')).toHaveValue('2.3522');
  await expect(labeledField(page, /^Place of birth/, 'input[type="text"]')).toHaveValue('Paris, Île-de-France, France');
});

test('multiple search matches are each shown as a separate clickable result (#290)', async () => {
  await stubNominatimSearch(page, [
    { lat: '48.8566', lon: '2.3522', display_name: 'Paris, Île-de-France, France' },
    { lat: '33.6609', lon: '-95.5555', display_name: 'Paris, Texas, United States' },
  ]);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await startPersonWithoutCoordinates(page);

  await labeledField(page, /^Search for a place by name/, 'input[type="text"]').fill('Paris');
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  await expect(page.getByRole('option', { name: /^Paris, Île-de-France, France/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /^Paris, Texas, United States/ })).toBeVisible();

  await page.getByRole('option', { name: /^Paris, Texas, United States/ }).click();

  await expect(labeledField(page, /^Latitude/, 'input[type="number"]')).toHaveValue('33.6609');
  await expect(labeledField(page, /^Longitude/, 'input[type="number"]')).toHaveValue('-95.5555');
});

test('a search with no matches shows an inline "not found" message (#290)', async () => {
  await stubNominatimSearch(page, []);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await startPersonWithoutCoordinates(page);

  await labeledField(page, /^Search for a place by name/, 'input[type="text"]').fill('Nowhereville');
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  await expect(page.getByRole('status').filter({ hasText: 'No matching locations found' })).toBeVisible();
});

test('a search-request failure shows an inline message, and coordinates are still editable by hand (#290)', async () => {
  await stubNominatimSearch(page, [], { status: 503 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await startPersonWithoutCoordinates(page);

  await labeledField(page, /^Search for a place by name/, 'input[type="text"]').fill('Paris');
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'The place search failed' })).toBeVisible();

  await labeledField(page, /^Latitude/, 'input[type="number"]').fill('51.5072');
  await labeledField(page, /^Longitude/, 'input[type="number"]').fill('-0.1276');
  expect(await readFields(page)).toEqual({ latitude: 51.5072, longitude: -0.1276 });
});

/**
 * #969: the Search button must share the place input's top and bottom edges on every screen that
 * mounts `BirthPlaceSearch`. Measured with getBoundingClientRect, because jsdom has no layout.
 */
interface ControlEdges {
  readonly inputTop: number;
  readonly inputBottom: number;
  readonly buttonTop: number;
  readonly buttonBottom: number;
}

async function measureSearchControls(page: Page): Promise<ControlEdges> {
  const form = page
    .locator('form.birth-place-search-form')
    .filter({ has: page.locator('input[role="combobox"]') })
    .first();
  await expect(form).toBeVisible();
  const input = await form.locator('input[role="combobox"]').boundingBox();
  const button = await form.locator('button[type="submit"]').boundingBox();
  if (input === null || button === null) throw new Error('search input or button has no bounding box');
  return {
    inputTop: input.y,
    inputBottom: input.y + input.height,
    buttonTop: button.y,
    buttonBottom: button.y + button.height,
  };
}

function expectFlushControls(edges: ControlEdges): void {
  const tolerance = 0.5;
  expect(Math.abs(edges.buttonTop - edges.inputTop)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(edges.buttonBottom - edges.inputBottom)).toBeLessThanOrEqual(tolerance);
}

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
  { width: 3440, height: 1440 },
] as const;

const SCHEMES = ['light', 'dark'] as const;

for (const viewport of VIEWPORTS) {
  for (const colorScheme of SCHEMES) {
    const label = `${String(viewport.width)}x${String(viewport.height)} ${colorScheme}`;

    test(`#969 Search button is flush with the place input on the birth record (${label})`, async () => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await openSharedPerson(page, baseUrl, EINSTEIN);
      const idMatch = /#\/people\/([^/]+)/.exec(new URL(page.url()).hash);
      const id = idMatch?.[1];
      if (id === undefined) throw new Error(`no person id in ${page.url()}`);
      await gotoAndSettle(page, `${baseUrl}/#/people/${id}/birth-record`);
      expectFlushControls(await measureSearchControls(page));
    });

    test(`#969 Search button is flush with the place input on Horary (${label})`, async () => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await gotoAndSettle(page, `${baseUrl}/#/explore/horary`);
      expectFlushControls(await measureSearchControls(page));
    });

    test(`#969 Search button is flush with the place input on Electional (${label})`, async () => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await gotoAndSettle(page, `${baseUrl}/#/explore/electional`);
      expectFlushControls(await measureSearchControls(page));
    });

    test(`#969 Search button is flush with the place input on Rectification (${label})`, async () => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await gotoAndSettle(page, `${baseUrl}/#/explore/rectification`);
      expectFlushControls(await measureSearchControls(page));
    });
  }
}
