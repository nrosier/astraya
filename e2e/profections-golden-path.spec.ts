/**
 * The golden path for profections (#168): enter birth data with a known time, open the
 * Profections screen from the person page, and the Year/Month table renders with a CSV
 * download — the same real worker/DOM/download machinery `chart-golden-path.spec.ts`
 * exercises for the chart, applied to the new screen.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, MARIC, newSeededContext, openSharedPerson } from './shared-people.ts';

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

// A fresh context per test, holding the shared people (#799); no test here saves, edits or deletes one.
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

test('a person with a known birth time gets a Profections screen with a Year/Month table', async () => {
  test.setTimeout(60_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);

  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('link', { name: 'Profections', exact: true }).click();
  await expect(page.getByRole('heading', { name: /profections/i, level: 1 })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Year' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Month' })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('albert-einstein-profections.csv');

  // The profected houses are explained in the reviewed corpus text, not the mechanical fallback (#427).
  await expect(page.getByRole('heading', { name: 'What the profected houses mean', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Year: \d+(st|nd|rd|th) house$/, level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Month: \d+(st|nd|rd|th) house$/, level: 3 })).toBeVisible();
  const meaning = page.locator('.profection-meanings p').first();
  await expect(meaning).not.toContainText('is the profected house for this period');
  expect((await meaning.textContent())?.length ?? 0).toBeGreaterThan(40);
});

test('a person with an unknown birth time is told profections need one', async () => {
  await openSharedPerson(page, baseUrl, MARIC);

  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('link', { name: 'Profections', exact: true }).click();
  await expect(page.getByText(/need a known birth time/)).toBeVisible();
});
