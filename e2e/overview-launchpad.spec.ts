/**
 * The person Overview as a launchpad (#1173): a birth-data health checklist with a fix for each item, a "continue where
 * you left off" section that shows only what exists, and one "now" line that links to Consultation.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, MARIC, newSeededContext, openSharedPerson } from './shared-people.ts';
import { openNatalChart } from './support.ts';

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

async function openOverview(): Promise<void> {
  await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /^Overview/, level: 1 })).toBeVisible();
}

test('lists what is uncertain in the birth data, and the fix link puts the cursor in that field', async () => {
  test.setTimeout(60_000);
  await openSharedPerson(page, baseUrl, MARIC);
  await openOverview();

  const health = page.getByRole('region', { name: 'Birth data' });
  await expect(health.getByText('The birth time is unknown, so houses and angles are not shown.')).toBeVisible();
  await health.getByRole('link', { name: 'Change how the time is known' }).click();
  await expect(page).toHaveURL(/\/birth-record\?focus=accuracy$/);
  await expect(page.getByLabel('How the time is known')).toBeFocused();
});

test('offers no resume section until a chart is opened, then continues there', async () => {
  test.setTimeout(90_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openOverview();

  // The seeded record is a real 1879 birth: the checklist names what is shaky about it, each with its own fix link.
  const health = page.getByRole('region', { name: 'Birth data' });
  const items = health.getByRole('listitem');
  expect(await items.count()).toBeGreaterThan(0);
  await expect(items.first().getByRole('link')).toBeVisible();
  // Nothing to resume yet: the section is not there at all, not an empty heading.
  await expect(page.getByRole('heading', { name: 'Continue where you left off' })).toHaveCount(0);

  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await openOverview();
  await page
    .getByRole('region', { name: 'Continue where you left off' })
    .getByRole('link', { name: 'The chart you last opened' })
    .click();
  await expect(page.locator('div.chart-wheel')).toBeVisible();
});

test('shows one "now" line that links to Consultation', async () => {
  test.setTimeout(90_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openOverview();

  const now = page.getByRole('link', { name: /^Now: profected year in .+, lord .+\. See Consultation\.$/ });
  await expect(now).toBeVisible({ timeout: 60_000 });
  await now.click();
  await expect(page).toHaveURL(/\/consultation$/);
});

test('offers comparing with another person once there are two people, and goes to the relationship screen', async () => {
  test.setTimeout(60_000);
  // The shared people hold more than one person, so the goal is there; with a single person it is not offered.
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openOverview();
  const compare = page.getByRole('link', { name: 'Compare with another person', exact: true });
  await expect(compare).toBeVisible();
  await compare.click();
  await expect(page).toHaveURL(/\/relationships\/synastry$/);
});
