/**
 * The home route (#1058): `#/` renders in place. With a last-viewed person it is that person's timing timeline
 * and the full sidebar (#965); with nobody stored, or a stored id that is gone, it is a person picker; and Back and reload never loop.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { gotoAndSettle } from './support.ts';

let dir: string;
let app: FastifyInstance;
let baseUrl: string;

/**
 * Waits until the person page's id is stored as the last-viewed person. AppNav writes it in an effect after
 * the page commits, so the URL changing is not enough: navigating away earlier lets `#/` read the seeded id.
 */
async function waitForLastPersonWritten(page: Page): Promise<void> {
  const match = /#\/people\/([^/]+)\//.exec(page.url());
  if (match?.[1] === undefined) throw new Error(`not on a person page: ${page.url()}`);
  const personId = match[1];
  // A function plus argument, not a string: the app's CSP blocks string evaluation.
  await page.waitForFunction((id) => localStorage.getItem('astraya:lastPersonId') === id, personId);
}

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

test('with nobody stored, #/ shows the first-use empty state and stays on #/', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/`);
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  await expect(page.getByText('Nobody yet.', { exact: false })).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
});

test('with people but none viewed, #/ shows the picker; choosing one shows their timeline', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  try {
    await gotoAndSettle(page, `${baseUrl}/#/`);
    // The seeded state remembers a viewed person; clear it so nobody is "last viewed".
    await page.evaluate("localStorage.removeItem('astraya:lastPersonId')");
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
    await page.getByLabel('Person', { exact: true }).selectOption({ label: EINSTEIN.name });
    await expect(page.getByRole('heading', { name: /timing timeline/i, level: 2 })).toContainText(EINSTEIN.name);
    await expect(page).toHaveURL(/#\/$/);
  } finally {
    await context.close();
  }
});

test('on #/ with a last-viewed person, the person section links are in the sidebar (#965)', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  try {
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.waitForURL(/#\/people\/[^/]+\//);
    await waitForLastPersonWritten(page);
    await page.goto(`${baseUrl}/#/`);
    await expect(page.getByRole('heading', { name: /timing timeline/i, level: 2 })).toContainText(EINSTEIN.name);
    const nav = page.locator('nav#app-nav');
    await expect(nav.getByRole('link', { name: 'Overview', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Tools', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'PDF', exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('a stored id that no longer exists falls back to the picker', async ({ browser }) => {
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  try {
    await gotoAndSettle(page, `${baseUrl}/#/`);
    await page.evaluate("localStorage.setItem('astraya:lastPersonId', 'p-zzzzzzzzzzzzzzzz')");
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Person', { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('after viewing a person, #/ shows their timeline, survives reload, and Back does not loop', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  try {
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.waitForURL(/#\/people\/[^/]+\//);
    await waitForLastPersonWritten(page);
    await page.goto(`${baseUrl}/#/`);
    const heading = page.getByRole('heading', { name: /timing timeline/i, level: 2 });
    await expect(heading).toContainText(EINSTEIN.name);
    await expect(page).toHaveURL(/#\/$/);
    await page.reload();
    await expect(heading).toContainText(EINSTEIN.name);
    await expect(page).toHaveURL(/#\/$/);
    await page.goto(`${baseUrl}/#/about`);
    await page.goBack();
    await expect(page).toHaveURL(/#\/$/);
    await expect(heading).toContainText(EINSTEIN.name);
  } finally {
    await context.close();
  }
});
