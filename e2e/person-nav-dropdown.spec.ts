/**
 * The person menu's sections (#882, replacing the #417 dropdowns): Transits & Forecast, Progressions &
 * Directions and Relationship Charts are one sidebar link each that opens the section's first sub-view,
 * with the sub-views as tabs on the page and no sub-menu in the sidebar.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { gotoAndSettle } from './support.ts';

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

async function personWithChart(page: Page): Promise<void> {
  await openSharedPerson(page, baseUrl, EINSTEIN);
}

const entry = (page: Page, name: string) => page.getByRole('banner').getByRole('link', { name, exact: true });
const tabs = (page: Page, name: string) => page.getByRole('navigation', { name: `${name} subtabs` });

const SECTIONS = [
  { name: 'Transits & Forecast', url: /#\/people\/[^/]+\/timing\/transits$/, tabs: ['Transits', 'Forecast'] },
  {
    name: 'Progressions & Directions',
    url: /#\/people\/[^/]+\/timing\/timeline$/,
    tabs: ['Timing timeline', 'Profections', 'Progressions', 'Solar Arc', 'Primary Directions (Placidus)'],
  },
  { name: 'Relationship Charts', url: /#\/people\/[^/]+\/relationships\/synastry$/, tabs: ['Synastry', 'Composite'] },
];

for (const section of SECTIONS) {
  test(`${section.name} is one sidebar link that opens its first sub-view, with the rest as tabs`, async () => {
    test.setTimeout(60_000);
    await personWithChart(page);

    await expect(page.getByRole('banner').getByRole('button', { name: section.name, exact: true })).toHaveCount(0);
    await entry(page, section.name).click();
    await expect(page).toHaveURL(section.url);
    await expect(page.locator('.app-nav-menu')).toHaveCount(0);
    await expect(entry(page, section.name)).toHaveAttribute('aria-current', 'page');
    const row = tabs(page, section.name);
    await expect(row).toBeVisible();
    await expect(row.getByRole('link')).toHaveText(section.tabs);
    await expect(row.getByRole('link').first()).toHaveAttribute('aria-current', 'page');
  });
}

test('choosing a tab opens that sub-view and keeps the section entry current', async () => {
  test.setTimeout(60_000);
  await personWithChart(page);

  await entry(page, 'Progressions & Directions').click();
  await tabs(page, 'Progressions & Directions').getByRole('link', { name: 'Profections', exact: true }).click();
  await expect(page).toHaveURL(/#\/people\/[^/]+\/timing\/profections$/);
  await expect(entry(page, 'Progressions & Directions')).toHaveAttribute('aria-current', 'page');
  await expect(tabs(page, 'Progressions & Directions').getByRole('link', { name: 'Profections' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('a chosen section tab survives a reload of the same route (#882)', async () => {
  test.setTimeout(60_000);
  await personWithChart(page);

  await entry(page, 'Progressions & Directions').click();
  await tabs(page, 'Progressions & Directions').getByRole('link', { name: 'Profections', exact: true }).click();
  await expect(page).toHaveURL(/#\/people\/[^/]+\/timing\/profections$/);
  const url = page.url();

  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(tabs(page, 'Progressions & Directions')).toBeVisible();
  await expect(
    tabs(page, 'Progressions & Directions').getByRole('link', { name: 'Profections', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    tabs(page, 'Progressions & Directions').getByRole('link', { name: 'Timing timeline', exact: true }),
  ).not.toHaveAttribute('aria-current', 'page');
  await expect(entry(page, 'Progressions & Directions')).toHaveAttribute('aria-current', 'page');
});

/**
 * Presses Tab from the current focus until `target` is focused. Bounded, so a tab row that Tab never reaches
 * fails with the element named instead of looping forever.
 */
async function tabUntilFocused(page: Page, target: Locator, description: string): Promise<void> {
  for (let presses = 0; presses < 300; presses += 1) {
    const focused = await target.evaluate(
      (el: { ownerDocument: { activeElement: unknown } }) => el === el.ownerDocument.activeElement,
    );
    if (focused) return;
    await page.keyboard.press('Tab');
  }
  const focused = await page.evaluate<string>(
    "document.activeElement ? document.activeElement.outerHTML.slice(0, 200) : '(nothing focused)'",
  );
  throw new Error(`Tab never reached ${description}; last focused element: ${focused}`);
}

// Each section: the sub-view the sidebar entry opens first, and a non-first sub-view reached by Tab + Enter.
const KEYBOARD_SECTIONS = [
  { name: 'Transits & Forecast', subView: 'Forecast', subViewUrl: /#\/people\/[^/]+\/timing\/forecast$/ },
  { name: 'Progressions & Directions', subView: 'Profections', subViewUrl: /#\/people\/[^/]+\/timing\/profections$/ },
  { name: 'Relationship Charts', subView: 'Composite', subViewUrl: /#\/people\/[^/]+\/relationships\/composite$/ },
];

for (const section of KEYBOARD_SECTIONS) {
  test(`${section.name}: every sub-view is reachable with Tab and Enter (#882)`, async () => {
    test.setTimeout(60_000);
    await personWithChart(page);

    await tabUntilFocused(page, entry(page, section.name), `the "${section.name}" sidebar entry`);
    await page.keyboard.press('Enter');
    await expect(entry(page, section.name)).toHaveAttribute('aria-current', 'page');

    const subView = tabs(page, section.name).getByRole('link', { name: section.subView, exact: true });
    await tabUntilFocused(page, subView, `the "${section.subView}" tab of ${section.name}`);
    await page.keyboard.press('Enter');
    await expect(subView).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveURL(section.subViewUrl);
  });
}

test('Tools: every tool tab is reachable with Tab and Enter (#882)', async () => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await tabUntilFocused(page, entry(page, 'Tools'), 'the Tools sidebar entry');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/explore\/cycles$/);

  const eclipses = tabs(page, 'Tools').getByRole('link', { name: 'Eclipses', exact: true });
  await tabUntilFocused(page, eclipses, 'the "Eclipses" tool tab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/explore\/eclipses$/);
  await expect(eclipses).toHaveAttribute('aria-current', 'page');
});

test('the section tab row has no automatically detectable accessibility violations', async () => {
  test.setTimeout(60_000);
  await personWithChart(page);

  await entry(page, 'Transits & Forecast').click();
  await expect(tabs(page, 'Transits & Forecast')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});
