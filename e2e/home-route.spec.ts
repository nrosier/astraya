/**
 * The root (#1730, reverses #1058): `#/` and any unknown hash are the People page, and the address bar shows
 * `#/people` once the root loads. The People list keeps the last-viewed person's sections in the sidebar (#1730,
 * reversing #914's exclusion). Back from the People page does not loop back to `/`.
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
 * the page commits, so the URL changing is not enough: navigating away earlier lets `/` read the seeded id.
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

test('with nobody stored, / shows the People page and the address bar becomes #/people', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/`);
  await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/#\/people$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/#\/people$/);
});

test('an unknown hash also lands on the People page, at #/people (#1730)', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/no-such-screen`);
  await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/#\/people$/);
});

test('after viewing Einstein, / shows the People page and the sidebar keeps his sections (#1730)', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  try {
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.waitForURL(/#\/people\/[^/]+\//);
    await waitForLastPersonWritten(page);
    await page.goto(`${baseUrl}/`);
    await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/#\/people$/);
    const nav = page.locator('nav#app-nav');
    await expect(nav.getByRole('link', { name: 'Overview', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Tools', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'PDF', exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('Back from the People page does not loop back to /, and a reload stays on #/people (#1730)', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  try {
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.waitForURL(/#\/people\/[^/]+\//);
    await waitForLastPersonWritten(page);
    await page.goto(`${baseUrl}/`);
    await expect(page).toHaveURL(/#\/people$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/#\/people$/);
    await page.goto(`${baseUrl}/#/about`);
    await page.goBack();
    await expect(page).toHaveURL(/#\/people$/);
    await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('#/people/<id>/timing/timeline still opens the timing timeline (#1730)', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  try {
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.waitForURL(/#\/people\/[^/]+\//);
    const personId = /#\/people\/([^/]+)\//.exec(page.url())?.[1];
    if (personId === undefined) throw new Error(`not on a person page: ${page.url()}`);
    await gotoAndSettle(page, `${baseUrl}/#/people/${personId}/timing/timeline`);
    await expect(page.getByRole('heading', { name: /timing timeline/i, level: 2 })).toContainText(EINSTEIN.name);
  } finally {
    await context.close();
  }
});

test('the root People page renders at 390x844 and 1920x1080 (#1730)', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1920, height: 1080 },
  ]) {
    const context = await newSeededContext(browser, baseUrl, { viewport });
    const page = await context.newPage();
    try {
      await gotoAndSettle(page, `${baseUrl}/`);
      await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible();
      await expect(page).toHaveURL(/#\/people$/);
    } finally {
      await context.close();
    }
  }
});
