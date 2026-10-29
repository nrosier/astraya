/**
 * The golden path for composite charts (#169): two people with known birth times, opening the
 * Composite screen from the first person's page, picking the second from the in-screen
 * dropdown, and the synthetic midpoint chart renders with its own wheel and data tables.
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

test('two people with known birth times get a Composite screen with a wheel and data tables', async () => {
  test.setTimeout(60_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Relationship Charts', exact: true }).click();
  await page.getByRole('link', { name: 'Composite', exact: true }).click();
  await expect(page.getByRole('heading', { name: /composite/i, level: 1 })).toBeVisible();

  await page.getByLabel('Compose with').selectOption({ label: 'Max Born' });

  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Placements' })).toBeVisible();

  // #359: the composite chart now also renders real interpretive text via `ReportView`,
  // reusing `report.ts`'s `assembleReport` the same way the natal Report tab already does.
  await expect(page.locator('.report-section').first()).toBeVisible();
  await expect(page.locator('.report-paragraph p').first()).not.toBeEmpty();
});

test('a person with an unknown birth time is told a composite needs one', async () => {
  await openSharedPerson(page, baseUrl, MARIC);

  await page.getByRole('link', { name: 'Relationship Charts', exact: true }).click();
  await page.getByRole('link', { name: 'Composite', exact: true }).click();
  await expect(page.getByText(/needs midpoint houses from both people/)).toBeVisible();
});
