/**
 * The saved shared-people state (#799) behaves like a real profile: the three people show with no
 * per-test creation, survive a reload under the service worker, a second tab in the same context
 * does not corrupt them, and the saved file is never mutated.
 *
 * Finding: no UI reports a read-only tab. `tab-lock.ts` only makes `store.writable` false, and the
 * sole consumer outside the store is `use-calculation-settings-migration.ts`; so case 3 asserts the
 * read path and data integrity, not a notice.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import {
  BORN,
  EINSTEIN,
  MARIC,
  SEED_POINTER_PATH,
  SHARED_PEOPLE,
  newSeededContext,
  openSharedPerson,
} from './shared-people.ts';
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

async function expectSharedPeople(page: Page): Promise<void> {
  for (const person of SHARED_PEOPLE) {
    await expect(page.getByRole('link', { name: new RegExp(`^${person.name}`) })).toBeVisible();
  }
}

function seedFileText(): string {
  const pointer = JSON.parse(readFileSync(SEED_POINTER_PATH, 'utf-8')) as { statePath: string };
  return readFileSync(pointer.statePath, 'utf-8');
}

test('a context from the saved state lists the three shared people', async ({ browser }) => {
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await expectSharedPeople(page);
  await context.close();
});

test('the people survive a reload, and the service worker does not serve a stale page', async ({ browser }) => {
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await expectSharedPeople(page);

  // The app registers sw.js (pwa/register.ts); wait until it controls the page, then reload under it.
  await page.evaluate<unknown>('navigator.serviceWorker.ready.then(() => true)');
  await page.reload();
  await page.waitForLoadState('load');
  await expectSharedPeople(page);
  expect(await page.evaluate<boolean>('navigator.serviceWorker.controller !== null')).toBe(true);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

  await openSharedPerson(page, baseUrl, EINSTEIN);
  await expect(page.locator('input[type="date"]')).toHaveValue(EINSTEIN.date);
  await context.close();
});

test('a second tab in the same context reads the seeded data without corrupting it', async ({ browser }) => {
  const context = await newSeededContext(browser, baseUrl);
  const first = await context.newPage();
  await gotoAndSettle(first, `${baseUrl}/#/people`);
  await expectSharedPeople(first);

  const second = await context.newPage();
  await gotoAndSettle(second, `${baseUrl}/#/people`);
  await expectSharedPeople(second);
  // No notice exists for a read-only tab (see header), so none must appear.
  await expect(second.getByText(/read-only|another tab/i)).toHaveCount(0);

  // Both tabs still read the same three records, and the writer tab is unaffected.
  await second.reload();
  await expectSharedPeople(second);
  await first.reload();
  await expectSharedPeople(first);
  await openSharedPerson(first, baseUrl, MARIC);
  await expect(first.locator('input[type="date"]')).toHaveValue(MARIC.date);
  await context.close();
});

test('the saved state is untouched, and a fresh context still shows the same three people', async ({ browser }) => {
  const before = seedFileText();
  const used = await newSeededContext(browser, baseUrl);
  const usedPage = await used.newPage();
  await openSharedPerson(usedPage, baseUrl, BORN);
  await used.close();

  expect(seedFileText()).toBe(before);
  const fresh = await newSeededContext(browser, baseUrl);
  const page = await fresh.newPage();
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await expectSharedPeople(page);
  await expect(page.getByRole('link', { name: /^(Albert Einstein|Mileva Marić|Max Born)/ })).toHaveCount(3);
  await fresh.close();
});
