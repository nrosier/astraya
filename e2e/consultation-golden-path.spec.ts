/**
 * The golden path for the consultation dashboard (#563): a person with a known birth time gets a
 * Consultation screen showing current transits, active timing techniques, and chart highlights,
 * each with a link to its own full canonical screen. Same real worker/DOM machinery
 * `transit-golden-path.spec.ts`/`synastry-golden-path.spec.ts` exercise, applied to the new
 * screen, which computes nothing new of its own.
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

test('a person with a known birth time gets a Consultation screen with transits, timing tracks and highlights', async () => {
  test.setTimeout(60_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);

  await page.getByRole('link', { name: 'Consultation', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /consultation/i })).toBeVisible();

  // The page is cast for the moment it opened, to the minute, and Now recasts it (#676).
  await expect(page.getByText(/^As of \d{4}-\d{2}-\d{2} \d{2}:\d{2}, your local time/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Now', exact: true }).click();

  // Summary first, then the grouped sections (#669), each one heading level below the title.
  await expect(page.getByRole('heading', { level: 2, name: 'At a glance' })).toBeVisible();
  for (const term of ['Sun', 'Moon', 'Ascendant', 'Chart ruler', 'Profection year']) {
    await expect(page.locator('.consultation-glance dt', { hasText: term }).first()).toBeVisible();
  }
  for (const heading of ['This year', 'Zodiacal releasing', 'Major transits now', 'Directions', 'Chart highlights']) {
    await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible();
  }
  // Boxes sharing a grid row share a height (#774); rows are boxes whose top edges match within 1px.
  const boxes = [];
  for (const section of await page.locator('.consultation-section').all()) {
    const rect = await section.boundingBox();
    if (rect !== null) boxes.push(rect);
  }
  expect(boxes.length).toBeGreaterThanOrEqual(5);
  for (const box of boxes) {
    const row = boxes.filter((other) => Math.abs(other.y - box.y) <= 1);
    for (const other of row) expect(Math.abs(other.height - box.height)).toBeLessThanOrEqual(1);
  }
  // Transits to the angles are listed apart from the ranked ones (#678).
  await expect(page.getByRole('heading', { level: 3, name: 'Transits to the Ascendant and Midheaven' })).toBeVisible();
  // No duplicate launchpad: one link per section, the rest in the page header.
  await expect(page.getByRole('heading', { level: 2, name: 'Next' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View all transits', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Open Patterns & condition', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open interpretation', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Build PDF', exact: true })).toBeVisible();
  // Detail a session rarely needs first is behind a disclosure.
  await expect(page.getByRole('button', { name: /More chart detail/ })).toBeVisible();

  // The link actually opens the full canonical screen (one home per feature).
  await page.getByRole('link', { name: 'View all transits', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /transits/i })).toBeVisible();
});
