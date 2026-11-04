/**
 * Journey 3 of the final acceptance list (#514): enter a target date, change the Primary Directions
 * time key, and filter transits. Both controls are the real shared primitives on the real screens:
 * the time key is the Naibod/Ptolemy `ChoiceGroup` on the Primary Directions page, and the transit
 * filter is the "Show" preset `ChoiceGroup` plus the "Change filters" dialog on the Transits page.
 *
 * Step -> box text:
 *   1. "Enter a target date"          -> the Primary Directions "As of" date field sets the age (third test).
 *   2. "change the Primary Directions time key" -> Naibod to Ptolemy changes the basis line and the arc (first test).
 *   3. "filter transits"              -> the Transits "Show" presets narrow and restore the list (second test).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';

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

// A fresh context per test, holding the shared people (#799); no test here saves, edits or deletes one.
test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

/** The transit contacts count, e.g. "Important · 4 of 12 shown", as its shown and total numbers. */
async function transitCount(page: Page): Promise<readonly [number, number]> {
  const text = (await page.locator('.filter-summary-count').textContent()) ?? '';
  const match = /· (\d+) of (\d+) shown$/.exec(text);
  if (match === null) throw new Error(`unexpected count text: ${text}`);
  return [Number(match[1]), Number(match[2])];
}

test('the Primary Directions time key can be changed to Ptolemy and the arc for the age follows it', async () => {
  test.setTimeout(60_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('link', { name: 'Primary Directions (Placidus)', exact: true }).click();

  const keyGroup = page.getByRole('radiogroup', { name: 'Time key', exact: true });
  const arcLine = page.getByText(/Arc for this age: /);
  await expect(arcLine).toBeVisible();
  await expect(keyGroup.getByLabel('Naibod (0°59′08″ a year)', { exact: true })).toBeChecked();
  const naibodArc = await arcLine.textContent();
  const basis = page.locator('.page-header-basis');
  await expect(basis).toContainText('Tropical · Placidus · Naibod key · Placidus semi-arcs, in zodiaco · ±1° of arc');

  await keyGroup.getByLabel('Ptolemy (1° a year)', { exact: true }).check();
  await expect(keyGroup.getByLabel('Ptolemy (1° a year)', { exact: true })).toBeChecked();
  await expect(keyGroup.getByLabel('Naibod (0°59′08″ a year)', { exact: true })).not.toBeChecked();
  await expect(basis).toContainText('Ptolemy key');

  // The key drives the calculation, so the arc for the same age must change (Ptolemy is 1° a year, Naibod ~0.9856°).
  await expect(arcLine).not.toHaveText(naibodArc ?? '');
});

test('the transit filter narrows the list of transits, and choosing All restores them', async () => {
  test.setTimeout(60_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('link', { name: 'Transits', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();

  const rows = page.getByRole('table', { name: 'Contacts' }).locator('tbody tr');
  const [, total] = await transitCount(page);
  const show = page.getByRole('radiogroup', { name: 'Show', exact: true });

  await show.getByLabel('Personal', { exact: true }).check();
  await expect(page.locator('.filter-summary-count')).toContainText('Personal');
  const [narrowed] = await transitCount(page);
  expect(narrowed).toBeLessThan(total);
  await expect(rows).toHaveCount(narrowed);

  await show.getByLabel('All', { exact: true }).check();
  await expect(rows).toHaveCount(total);
  const [restored] = await transitCount(page);
  expect(restored).toBe(total);
});

test('a target date entered on Primary Directions sets the age, and a date before birth is refused in words', async () => {
  test.setTimeout(60_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('link', { name: 'Primary Directions (Placidus)', exact: true }).click();
  const asOf = page.getByLabel('As of', { exact: true });
  const age = page.getByLabel('Age (years)', { exact: true });
  await expect(page.getByText(/Arc for this age: /)).toBeVisible();

  // Forty years after the 1879-03-14 birth: the age shown is the one the typed date implies.
  await asOf.fill('1919-03-14');
  await expect(age).toHaveValue(/^(39\.99|40\.00|40\.01)$/);

  // A date before birth gets the shipped explanation instead of a made-up arc.
  await asOf.fill('1870-01-01');
  await expect(page.getByText('This date is before birth; primary directions start at birth.')).toBeVisible();
  await expect(page.getByText(/Arc for this age: /)).toHaveCount(0);
});
