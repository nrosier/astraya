/**
 * The person menu's sections (#882, replacing the #417 dropdowns): Transits & Forecast, Progressions &
 * Directions and Relationship Charts are one sidebar link each that opens the section's first sub-view,
 * with the sub-views as tabs on the page and no sub-menu in the sidebar.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';

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

test('the section tab row has no automatically detectable accessibility violations', async () => {
  test.setTimeout(60_000);
  await personWithChart(page);

  await entry(page, 'Transits & Forecast').click();
  await expect(tabs(page, 'Transits & Forecast')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});
