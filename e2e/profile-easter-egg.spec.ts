/**
 * The birth-record easter egg (#697), end to end: a signed-in reader's birth record is checked on the server (#1808), a
 * matching person's shows the overlay, and another person's does not. The configured date and name are made up.
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { createPerson, gotoAndSettle, signIn } from './support.ts';

/**
 * The page's overlay decision, as a deterministic signal instead of a sleep (#1368): the one
 * `POST /api/profile-overlay/check` response the birth-record screen waits on per page load, then two animation frames so
 * the answer (`checkFeatureFlag`) and the overlay's canvas set-up have run. Start watching BEFORE the
 * navigation that triggers the request. The positive control below shows this same wait is enough to see the overlay.
 */
const watchOverlayDecision = (page: Page): Promise<unknown> =>
  page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/profile-overlay/check' && response.ok(),
  );

async function overlayDecided(page: Page, decision: Promise<unknown>): Promise<void> {
  await decision;
  await page.evaluate(
    'new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(undefined))))',
  );
}

/** The overlay canvases in the page right now, read once with no retrying, so the wait alone decides the result. */
const overlaysNow = async (page: Page): Promise<number> =>
  Number(await page.evaluate("document.querySelectorAll('canvas.profile-overlay').length"));

const BOOTSTRAP_TOKEN = 'e2e-bootstrap-token';
const USERNAME = 'alice';
const PASSWORD = 'correct-horse-battery-e2e';

let dir: string;
let app: FastifyInstance;
let baseUrl: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-e2e-'));
  process.env.LOG_LEVEL = 'silent';
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
  process.env.ASTRAYA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.ASTRAYA_EASTER_EGG = '2001-02-03:example';
  app = await build({ dbPath: join(dir, 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const response = await fetch(new URL('/api/setup', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: BOOTSTRAP_TOKEN, username: USERNAME, password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`bootstrap failed with status ${String(response.status)}`);
});

test.afterAll(async () => {
  delete process.env.ASTRAYA_EASTER_EGG;
  delete process.env.ASTRAYA_ENCRYPTION_KEY;
  delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test('a matching person’s birth record shows the overlay, and it removes itself', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await signIn(page, USERNAME, PASSWORD);
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
  const decision = watchOverlayDecision(page);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await signIn(page, USERNAME, PASSWORD);
  await createPerson(page, {
    name: 'Jo Example',
    date: '2001-02-03',
    time: '12:00:00',
    latitude: '52.37',
    longitude: '4.90',
  });
  await page.getByRole('link', { name: 'Birth record', exact: true }).click();
  await overlayDecided(page, decision);
  expect(await overlaysNow(page)).toBe(0);
  await expect(page.locator('canvas.profile-overlay')).toHaveCount(0);
});

test('positive control: the same wait sees the overlay for a matching person', async ({ page }) => {
  test.setTimeout(60_000);
  const decision = watchOverlayDecision(page);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await signIn(page, USERNAME, PASSWORD);
  await createPerson(page, {
    name: 'Jo Example',
    date: '2001-02-03',
    time: '12:00:00',
    latitude: '52.37',
    longitude: '4.90',
  });
  await page.getByRole('link', { name: 'Birth record', exact: true }).click();
  await overlayDecided(page, decision);
  expect(await overlaysNow(page)).toBe(1);
});

test('a signed-out reader sends no check and sees nothing (#1808)', async ({ page }) => {
  const checks: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/profile-overlay/check') checks.push(request.url());
  });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Jo Example',
    date: '2001-02-03',
    time: '12:00:00',
    latitude: '52.37',
    longitude: '4.90',
  });
  await page.getByRole('link', { name: 'Birth record', exact: true }).click();
  await page.evaluate(
    'new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(undefined))))',
  );
  expect(checks).toEqual([]);
  expect(await overlaysNow(page)).toBe(0);
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
    await gotoAndSettle(page, `${baseUrl}/#/people`);
    await signIn(page, USERNAME, PASSWORD);
    const decision = watchOverlayDecision(page);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('link', { name: 'Birth record', exact: true }).click();
    await overlayDecided(page, decision);
    expect(await overlaysNow(page)).toBe(0);
    await expect(page.locator('canvas.profile-overlay')).toHaveCount(0);
  });
});
