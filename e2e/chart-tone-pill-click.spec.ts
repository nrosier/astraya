/**
 * The Hard, Soft and Minor tone pills on the instrument bar take a click on their words, on every chart screen that
 * shows them (#1853). On horary and the shared-link chart an aspect-controls fallback sat over the bar and ate the click;
 * on composite and relocated the report that follows the chart was pulled up over the bar. These checks hit-test the
 * pill's label text and click it with the mouse, on natal, horary, composite, relocated and shared-link. The preset
 * control sits in the shared controls row above the view tabs, not inside the wheel dial. On composite and relocated the
 * report's tabs start below the pill row and stay clickable.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { gotoAndSettle, openChart, openNatalChart } from './support.ts';

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

const TONES = ['Hard', 'Soft', 'Minor'] as const;

interface LabelHit {
  readonly x: number;
  readonly y: number;
  readonly hit: boolean;
  /** What is on top at the point, so a miss says what took the click. */
  readonly top: string;
}

/**
 * The centre of the tone pill's label text, in viewport pixels, and whether the topmost element there is the pill or
 * sits inside it. A click on the word reaches the pill only when `hit` is true.
 */
async function labelHit(page: Page, tone: string): Promise<LabelHit | null> {
  return page.evaluate(`(() => {
    const pill = [...document.querySelectorAll('.chart-instrument-bar-tones button')].find(
      (b) => b.textContent?.trim() === ${JSON.stringify(tone)},
    );
    if (pill === undefined) return null;
    const range = document.createRange();
    range.selectNodeContents(pill);
    const box = range.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const top = document.elementFromPoint(x, y);
    const r = (n) => { const b = n.getBoundingClientRect(); return Math.round(b.left) + ',' + Math.round(b.top) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height); };
    const describe = top === null ? 'nothing (off screen)' : top.tagName + '.' + String(top.className) + ' [' + r(top) + '] pill [' + r(pill) + '] point (' + Math.round(x) + ',' + Math.round(y) + ')';
    return { x, y, hit: top !== null && (pill === top || pill.contains(top)), top: describe };
  })()`);
}

/** Clicks each tone pill on its word and checks aria-pressed flips and flips back. */
async function expectToneWordsToggle(page: Page, screen: string): Promise<void> {
  const group = page.getByRole('group', { name: 'Aspect families on the wheel', exact: true });
  for (const tone of TONES) {
    const pill = group.getByRole('button', { name: tone, exact: true });
    await expect(pill, `${screen} ${tone} pill is shown`).toBeVisible();
    // On composite and horary the instrument bar sits below the 800px fold; mouse.click does not scroll, so bring it in first.
    await pill.scrollIntoViewIfNeeded();
    const before = await pill.getAttribute('aria-pressed');
    const target = await labelHit(page, tone);
    expect(target, `${screen} ${tone} pill is in the instrument bar`).not.toBeNull();
    if (target === null) return;
    expect(target.hit, `${screen} ${tone}: the label point is not on the pill; on top is ${target.top}`).toBe(true);
    await page.mouse.click(target.x, target.y);
    const flipped = before === 'true' ? 'false' : 'true';
    await expect(pill, `${screen} ${tone} flips on a click on its word`).toHaveAttribute('aria-pressed', flipped);
    await page.mouse.click(target.x, target.y);
    await expect(pill, `${screen} ${tone} flips back`).toHaveAttribute('aria-pressed', before ?? 'true');
  }
}

/** The shared controls row carries the preset control; the wheel dial carries no aspect-family fallback. */
async function expectControlsInRow(page: Page, screen: string): Promise<void> {
  await expect(
    page.locator('.chart-workbench-dial > .aspect-family-filter'),
    `${screen} no fallback in dial`,
  ).toHaveCount(0);
  await expect(
    page.locator('.chart-controls-row .primitive-pill-select').first(),
    `${screen} preset control in the controls row`,
  ).toBeVisible();
}

/**
 * The report that follows the chart starts below the pill row, and its first tab is the top element at its own centre,
 * so the tabs stay usable (#1853).
 */
async function expectReportBelowPills(page: Page, screen: string): Promise<void> {
  const bar: Locator = page.locator('.chart-instrument-bar').first();
  const tabRow: Locator = page.locator('.report .tab-row').first();
  const firstTab: Locator = page.locator('.report .tab').first();
  await expect(tabRow, `${screen} report tab row is shown`).toBeVisible();
  const barBox = await bar.boundingBox();
  const rowBox = await tabRow.boundingBox();
  expect(barBox, `${screen} instrument bar has a box`).not.toBeNull();
  expect(rowBox, `${screen} report tab row has a box`).not.toBeNull();
  if (barBox === null || rowBox === null) return;
  expect(rowBox.y, `${screen} report tab row starts below the instrument bar`).toBeGreaterThanOrEqual(
    barBox.y + barBox.height,
  );

  await firstTab.scrollIntoViewIfNeeded();
  const tabBox = await firstTab.boundingBox();
  expect(tabBox, `${screen} first report tab has a box`).not.toBeNull();
  if (tabBox === null) return;
  const onTop = await page.evaluate(`(() => {
    const tab = document.querySelector('.report .tab');
    if (tab === null) return false;
    const r = tab.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top !== null && (tab === top || tab.contains(top));
  })()`);
  expect(onTop, `${screen} first report tab is clickable at its centre`).toBe(true);
}

test.describe('Tone pills take clicks on their words (#1853)', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    context = await newSeededContext(browser, baseUrl);
    page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('natal: a click on the word toggles the tone pill', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expectToneWordsToggle(page, 'natal');
    await expectControlsInRow(page, 'natal');
  });

  test('composite: a click on the word toggles the tone pill, and the report tabs sit below it', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('link', { name: 'Relationship Charts', exact: true }).click();
    await page.getByRole('tab', { name: 'Composite', exact: true }).click();
    await page.getByLabel('Compose with').selectOption({ label: 'Max Born' });
    await expectToneWordsToggle(page, 'composite');
    await expectControlsInRow(page, 'composite');
    await expectReportBelowPills(page, 'composite');
  });

  test('relocated: a click on the word toggles the tone pill, and the report tabs sit below it', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openChart(page, 'Relocated');
    await page.getByLabel('Relocation latitude', { exact: true }).fill('-33.8688');
    await page.getByLabel('Relocation longitude', { exact: true }).fill('151.2093');
    await page.getByLabel('Save this location as', { exact: true }).fill('Sydney');
    await page.getByRole('button', { name: 'Save location', exact: true }).click();
    await expect(page.locator('.chart-workbench-dial .chart-wheel svg').first()).toBeVisible();
    await expectToneWordsToggle(page, 'relocated');
    await expectControlsInRow(page, 'relocated');
    await expectReportBelowPills(page, 'relocated');
  });

  test('horary: a click on the word toggles the tone pill', async () => {
    test.setTimeout(90_000);
    await gotoAndSettle(page, `${baseUrl}/#/explore/horary`);
    await page.getByLabel('Date the question was asked').fill('2024-03-08');
    await page.getByLabel('Local time').fill('12:00');
    await page.getByLabel('Latitude', { exact: true }).fill('51.5072');
    await page.getByLabel('Longitude', { exact: true }).fill('-0.1276');
    await page.getByRole('button', { name: 'Cast chart', exact: true }).click();
    await expect(page.locator('.chart-workbench-dial .chart-wheel svg').first()).toBeVisible();
    await expectToneWordsToggle(page, 'horary');
    await expectControlsInRow(page, 'horary');
  });

  test('shared link: a click on the word toggles the tone pill', async () => {
    test.setTimeout(90_000);
    await gotoAndSettle(page, `${baseUrl}/#/shared?d=1879-03-14&t=11:30&la=48.4011&lo=9.9876&v=1`);
    await expect(page.locator('.chart-workbench-dial .chart-wheel svg').first()).toBeVisible();
    await expectToneWordsToggle(page, 'shared');
    await expectControlsInRow(page, 'shared');
  });
});
