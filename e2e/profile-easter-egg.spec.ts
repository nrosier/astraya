/**
 * The birth-record easter egg (#697), end to end: the server's setting reaches the page, a matching person's birth
 * record shows the overlay, and another person's does not. The digests are of made-up values.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { createPerson, gotoAndSettle } from './support.ts';

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

let dir: string;
let app: FastifyInstance;
let baseUrl: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-e2e-'));
  process.env.LOG_LEVEL = 'silent';
  process.env.ASTRAYA_EASTER_EGG = `${sha256('2001-02-03')}:${sha256('example')}`;
  app = await build({ dbPath: join(dir, 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

test.afterAll(async () => {
  delete process.env.ASTRAYA_EASTER_EGG;
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test('a matching person’s birth record shows the overlay, and it removes itself', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Jo Example',
    date: '2001-02-03',
    time: '12:00:00',
    latitude: '52.37',
    longitude: '4.90',
  });
  await page.getByRole('link', { name: 'Birth record', exact: true }).click();
  const overlay = page.locator('canvas.profile-overlay');
  await expect(overlay).toBeAttached();
  await expect(overlay).toHaveAttribute('aria-hidden', 'true');
  await expect(overlay).toHaveCSS('pointer-events', 'none');
  await expect(overlay).not.toBeAttached({ timeout: 25_000 });
});

test('nothing runs when the reader asks for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Jo Example',
    date: '2001-02-03',
    time: '12:00:00',
    latitude: '52.37',
    longitude: '4.90',
  });
  await page.getByRole('link', { name: 'Birth record', exact: true }).click();
  await page.waitForTimeout(1_500);
  await expect(page.locator('canvas.profile-overlay')).toHaveCount(0);
});

test.describe('with the shared people (#799)', () => {
  let context: BrowserContext;
  let page: Page;

  // A fresh context per test, holding the shared people; no test here saves, edits or deletes one.
  test.beforeEach(async ({ browser }) => {
    context = await newSeededContext(browser, baseUrl);
    page = await context.newPage();
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('another person’s birth record does not', async () => {
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('link', { name: 'Birth record', exact: true }).click();
    await page.waitForTimeout(1_500);
    await expect(page.locator('canvas.profile-overlay')).toHaveCount(0);
  });
});
