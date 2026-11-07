/**
 * The Back link returns to the page the reader came from (#652), not to a fixed parent. From a person's chart,
 * Documents then Back lands on the chart again; opened fresh in a new tab, the same page's Back goes to People,
 * because there is nowhere inside the app to go back to.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { gotoAndSettle, openNatalChart } from './support.ts';

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

test('opened fresh, Documents has no back link and its one heading is the builder', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await gotoAndSettle(page, `${baseUrl}/#/documents`);
  await expect(page.getByRole('heading', { name: 'Build a PDF', level: 1 })).toBeVisible();
  // The Documents page has no bespoke back link (#916); the people list is one click away in the header.
  await expect(page.getByRole('link', { name: '← Back' })).toHaveCount(0);
  await context.close();
});

test('opened directly, a screen has no back link at all (#1225)', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await gotoAndSettle(page, `${baseUrl}/#/about`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('p.back')).toHaveCount(0);
  await context.close();
});

test('the bare #/ stays on #/ and Back never loops (#1058)', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/`);
  await expect(page).toHaveURL(/#\/$/);
  await page.goto(`${baseUrl}/#/about`);
  await page.goBack();
  await expect(page).toHaveURL(/#\/$/);
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

  test('Documents is reached from the header with the chart still in the sidebar (#916)', async () => {
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);

    await page.getByRole('banner').getByRole('link', { name: 'PDF', exact: true }).click();
    await expect(page).toHaveURL(/#\/documents$/);
    await expect(page.getByRole('heading', { name: 'Build a PDF', level: 1 })).toBeVisible();
  });

  test('Back names the page the reader came from and sits above the heading, and a tab switch is not a back step (#1225)', async () => {
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const chartTitle = await page.title();
    await page.getByRole('link', { name: 'About & Licence' }).click();

    const back = page.locator('p.back a');
    await expect(back).toHaveText(`← ${chartTitle.replace(/ – Astraya$/, '')}`);
    const backBox = await back.boundingBox();
    const headingBox = await page.getByRole('heading', { level: 1 }).boundingBox();
    expect(backBox?.y ?? 0).toBeLessThan(headingBox?.y ?? 0);

    await back.click();
    await expect(page.locator('div.chart-wheel')).toBeVisible();
  });

  test('the Back link keeps one place above the heading on every screen that has one, at each viewport in both themes (#1225)', async () => {
    const viewports = [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
      { width: 3440, height: 1440 },
    ] as const;
    await openSharedPerson(page, baseUrl, EINSTEIN);
    const id = /#\/people\/([^/]+)/.exec(page.url())?.[1] ?? '';
    expect(id).not.toBe('');
    const hashes = [
      '#/about',
      '#/changelog',
      `#/people/${id}/consultation`,
      `#/people/${id}/charts/natal/wheel`,
      `#/people/${id}/interpretation`,
      `#/people/${id}/timing/transits`,
      `#/people/${id}/timing/timeline`,
      `#/people/${id}/relationships/synastry`,
      '#/explore/cycles',
    ];
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate(`localStorage.setItem('astraya.theme', '${theme}')`);
      await page.reload();
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        let reference: number | undefined;
        for (const hash of hashes) {
          // A hash change inside the app is a new page, so a previous page is known and the link shows.
          await page.evaluate(`window.location.hash = '${hash}'`);
          const label = `${hash} at ${String(viewport.width)}x${String(viewport.height)} (${theme})`;
          const back = page.locator('p.back a');
          await expect(back, `${label}: has a Back link`).toBeVisible();
          await expect(page.locator('p.back')).toHaveCount(1);
          const mainTop = (await page.locator('#main-content').boundingBox())?.y ?? 0;
          const backBox = await back.boundingBox();
          const headingBox = await page.getByRole('heading', { level: 1 }).first().boundingBox();
          expect(backBox, label).not.toBeNull();
          expect(headingBox, label).not.toBeNull();
          expect(backBox?.y ?? 0, `${label}: Back is above the heading`).toBeLessThan(headingBox?.y ?? 0);
          const offset = (backBox?.y ?? 0) - mainTop;
          reference ??= offset;
          expect(offset, `${label}: Back keeps one vertical place`).toBe(reference);
        }
      }
    }
  });
});
