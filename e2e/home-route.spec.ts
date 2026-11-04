/**
 * The home route (#1058): `#/` renders in place. With a last-viewed person it is that person's timing timeline;
 * with nobody stored, or a stored id that is gone, it is a person picker; and Back and reload never loop.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
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
    await expect(page.getByRole('heading', { name: /timing timeline/i, level: 1 })).toContainText(EINSTEIN.name);
    await expect(page).toHaveURL(/#\/$/);
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
    await page.goto(`${baseUrl}/#/`);
    const heading = page.getByRole('heading', { name: /timing timeline/i, level: 1 });
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
