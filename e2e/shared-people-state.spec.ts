/**
 * The saved shared-people state (#799) behaves like a real profile: the three people show with no
 * per-test creation, survive a reload under the service worker, a second tab in the same context
 * does not corrupt them, and the saved file is never mutated.
 *
 * No UI reports a read-only tab, so case 3 observes the Web Lock itself (`astraya-writer:*`, tab-lock.ts)
 * through `navigator.locks.query()`.
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
  seedPointerPath,
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

/** Names of the writer locks currently held on this origin (`navigator.locks.query()`). */
function heldWriterLocks(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(
    `navigator.locks.query().then((state) => (state.held ?? []).map((lock) => lock.name ?? '').filter((name) => name.startsWith('astraya-writer:')))`,
  );
}

/** Names of the writer locks queued (pending, not granted) on this origin. */
function pendingWriterLocks(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(
    `navigator.locks.query().then((state) => (state.pending ?? []).map((lock) => lock.name ?? '').filter((name) => name.startsWith('astraya-writer:')))`,
  );
}

function seedFileText(): string {
  const pointer = JSON.parse(readFileSync(seedPointerPath(), 'utf-8')) as { statePath: string };
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

test('a second tab holds no writer lock: one tab owns it, and both tabs read the seeded data', async ({ browser }) => {
  const context = await newSeededContext(browser, baseUrl);
  const first = await context.newPage();
  await gotoAndSettle(first, `${baseUrl}/#/people`);
  await expectSharedPeople(first);

  const second = await context.newPage();
  await gotoAndSettle(second, `${baseUrl}/#/people`);
  await expectSharedPeople(second);

  // store.ts takes `astraya-writer:<db name>` per tab with ifAvailable; exactly one tab may hold it.
  for (const page of [first, second]) {
    expect(await heldWriterLocks(page)).toHaveLength(1);
    expect(await pendingWriterLocks(page)).toEqual([]);
  }

  // The holder is the first tab: closing it frees the lock, and the second (which never queued: no pending writer locks above) does not take it.
  await first.close();
  await expect.poll(async () => (await heldWriterLocks(second)).length).toBe(0);

  // The read-only tab still reads the same records.
  await second.reload();
  await expectSharedPeople(second);
  await openSharedPerson(second, baseUrl, MARIC);
  await expect(second.locator('input[type="date"]')).toHaveValue(MARIC.date);
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
