/**
 * The header navigation (#421, #506/#509): the Tools menu on every screen, the person's chip and
 * tabs in the header instead of a strip above the page, and the Menu button that folds it on a
 * phone. At >=64rem (Playwright's default viewport) `WorkspaceShell.tsx` lays this header out as
 * a left rail instead of a bar across the top of the page; below 64rem it stays the original
 * horizontal bar with its own folding panel, unchanged.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Download } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import {
  closeSettings,
  createPerson,
  gotoAndSettle,
  openChart,
  openNatalChart,
  openSettings,
  openTool,
} from './support.ts';

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

const ADA = {
  name: 'Ada Lovelace',
  date: '1815-12-10',
  time: '07:45:00',
  latitude: '51.5072',
  longitude: '-0.1276',
};

test('the Tools menu is in the header on every screen and opens each tool', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  const header = page.getByRole('banner');

  await header.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(header.getByRole('navigation', { name: 'Tools subtabs' })).toBeVisible();
  for (const name of [
    'Planetary cycles',
    'Eclipses',
    'Horary chart',
    'Electional search',
    'Birth-time rectification',
  ]) {
    await expect(header.getByRole('link', { name, exact: true })).toBeVisible();
  }
  // Choosing one closes the menu and opens the screen; the menu then marks it as the current page.
  await header.getByRole('link', { name: 'Eclipses', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Eclipses', level: 1 })).toBeVisible();
  await expect(header.getByRole('navigation', { name: 'Tools subtabs' })).toHaveCount(0);
  await header.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(header.getByRole('link', { name: 'Eclipses', exact: true })).toHaveAttribute('aria-current', 'page');

  // It is there on screens that have nothing to do with a person, and Escape closes it.
  await page.keyboard.press('Escape');
  await expect(header.getByRole('navigation', { name: 'Tools subtabs' })).toHaveCount(0);
  await gotoAndSettle(page, `${baseUrl}/#/about`);
  await expect(header.getByRole('button', { name: 'Tools', exact: true })).toBeVisible();
  await openTool(page, 'Horary chart');
  await expect(page.getByRole('heading', { name: 'Horary chart', level: 1 })).toBeVisible();
});

test('a person’s screens carry their name and tabs in the header, with no strip above the page', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  const header = page.getByRole('banner');

  await expect(header.getByText('Ada Lovelace', { exact: true })).toBeVisible();
  for (const name of ['Birth record', 'Interpretation', 'Astrocartography']) {
    await expect(header.getByRole('link', { name, exact: true })).toBeVisible();
  }
  // The charts cast for this person are one menu, and the families come after it.
  await expect(header.getByRole('button', { name: 'Charts', exact: true })).toBeVisible();
  for (const name of ['Transits & Forecast', 'Progressions & Directions', 'Relationship Charts']) {
    await expect(header.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator('.person-shelf')).toHaveCount(0);
  await expect(header.getByRole('link', { name: 'Birth record', exact: true })).toHaveAttribute('aria-current', 'page');

  // The person's tabs and the Tools menu share one open-at-a-time rule.
  await header.getByRole('button', { name: 'Charts', exact: true }).click();
  await header.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(header.getByRole('navigation', { name: 'Charts subtabs' })).toHaveCount(0);
  await expect(header.getByRole('navigation', { name: 'Tools subtabs' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);

  // Going to a tool keeps the person's tabs in the header (#453): a tool is not about their
  // chart, but losing the way back to it just for visiting one is its own kind of friction.
  await header.getByRole('link', { name: 'Planetary cycles', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Planetary cycles', level: 1 })).toBeVisible();
  await expect(header.getByText('Ada Lovelace', { exact: true })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Charts', exact: true })).toBeVisible();
  // None of the person's tabs is "current" on a tool page — it genuinely isn't one of them.
  await expect(header.getByRole('link', { name: 'Birth record', exact: true })).not.toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('a tool page remembers the last person visited, and returning to their tabs needs no re-pick (#453)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  const header = page.getByRole('banner');
  await openTool(page, 'Eclipses');
  await expect(page.getByRole('heading', { name: 'Eclipses', level: 1 })).toBeVisible();

  // Still Ada's tabs, carried over from the person's screen the tool was opened from.
  await expect(header.getByText('Ada Lovelace', { exact: true })).toBeVisible();
  await header.getByRole('link', { name: 'Birth record', exact: true }).click();
  await expect(page).toHaveURL(/#\/person\//);
  await expect(header.getByText('Ada Lovelace', { exact: true })).toBeVisible();

  // The People list itself is not a tool page: it should not show a stale person's tabs.
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await expect(header.getByText('Ada Lovelace', { exact: true })).toHaveCount(0);

  // Reopening a tool straight from the People list (no person page visited this time) still
  // remembers Ada from before, since nothing has overwritten that memory in between.
  await openTool(page, 'Horary chart');
  await expect(header.getByText('Ada Lovelace', { exact: true })).toBeVisible();
});

test('on a phone the navigation folds behind a Menu button, and nothing scrolls sideways', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  const header = page.getByRole('banner');

  await expect(header.getByRole('button', { name: 'Charts', exact: true })).toBeHidden();
  const menu = header.getByRole('button', { name: 'Menu', exact: true });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await expect(header.getByRole('button', { name: 'Close menu', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(header.getByRole('button', { name: 'Charts', exact: true })).toBeVisible();
  expect(await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);

  // A group opens in place inside the panel; choosing a tool closes the whole menu and opens the screen.
  await header.getByRole('button', { name: 'Tools', exact: true }).click();
  await header.getByRole('link', { name: 'Eclipses', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Eclipses', level: 1 })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Menu', exact: true })).toHaveAttribute('aria-expanded', 'false');

  // Escape closes the open menu and returns focus to its button.
  await header.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(header.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
});

test('the rail (#506/#509) keeps the navigation reachable while the page scrolls, clear of the content it sits beside, not above', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await page.locator('footer').scrollIntoViewIfNeeded();
  const header = page.getByRole('banner');
  // The rail is sticky to the left at its full height, so it stays reachable through any amount
  // of vertical scroll — unlike the old top bar, nothing above the content needs clearing by
  // scroll padding, since the rail no longer occupies any space above it (`app.css`'s `min-width:
  // 64rem` override replaces the measured-header-height scroll padding with a small constant).
  await expect(header).toBeInViewport({ ratio: 1 });
  const padding = await page.evaluate('parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)');
  expect(padding).toBeLessThanOrEqual(20);
  await header.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(header.getByRole('link', { name: 'Eclipses', exact: true })).toBeVisible();
});

test('the rail holds brand then navigation; the account cluster sits apart from it, top-right of the content, with and without a person', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  const layout = async (): Promise<void> => {
    const brand = await page.getByRole('link', { name: 'Astraya, back to the people list' }).boundingBox();
    const nav = await page.getByRole('navigation', { name: 'Main', exact: true }).boundingBox();
    const signIn = await page.getByRole('button', { name: 'Sign in', exact: true }).boundingBox();
    if (brand === null || nav === null || signIn === null) throw new Error('fixture bug: missing rail element');
    // The navigation starts below the brand inside the rail, whatever its own height (a person's
    // many tabs make it taller, not shorter above it).
    expect(nav.y).toBeGreaterThanOrEqual(brand.y + brand.height);
    // Account/language/theme are not navigation (#506/#509): they sit apart from the rail
    // entirely, fixed to the content area's top-right corner, clear of the rail's own right edge.
    expect(signIn.x).toBeGreaterThanOrEqual(nav.x + nav.width);
  };
  await layout();
  await createPerson(page, ADA);
  await layout();
});

test('the Charts menu lists the chart types, and the page keeps the type and the section in the URL', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  const header = page.getByRole('banner');

  await header.getByRole('button', { name: 'Charts', exact: true }).click();
  const menu = header.getByRole('navigation', { name: 'Charts subtabs' });
  await expect(menu.getByRole('link')).toHaveText(['Natal', 'Draconic', 'Harmonic', 'Solar return', 'Lunar return']);

  // Choosing a type opens that chart and closes the menu; natal needs no query.
  await menu.getByRole('link', { name: 'Draconic', exact: true }).click();
  await expect(page.getByRole('heading', { name: /draconic/i, level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/#\/chart\/[^?]+\?type=draconic$/);
  await expect(menu).toHaveCount(0);

  // The sections are tabs on the page, and the open one is in the URL beside the type.
  await page.getByRole('tab', { name: 'Aspects', exact: true }).click();
  await expect(page).toHaveURL(/\?type=draconic&section=aspects$/);

  // The type selector on the page switches type and keeps the section.
  const selector = page.getByRole('navigation', { name: 'Chart type' });
  await selector.getByRole('link', { name: 'Natal', exact: true }).click();
  await expect(page).toHaveURL(/#\/chart\/[^?]+\?section=aspects$/);
  await expect(page.getByRole('heading', { name: 'Aspects', level: 2 })).toBeVisible();
  await expect(selector.getByRole('link', { name: 'Natal', exact: true })).toHaveAttribute('aria-current', 'page');

  // The menu marks the open type.
  await header.getByRole('button', { name: 'Charts', exact: true }).click();
  await expect(menu.getByRole('link', { name: 'Natal', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');

  // A reload keeps the section; the wheel needs no query.
  await page.reload();
  await page.waitForEvent('load', { timeout: 5_000 }).catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'Aspects', level: 2 })).toBeVisible();
  await page.getByRole('tab', { name: 'Chart wheel', exact: true }).click();
  await expect(page).toHaveURL(/#\/chart\/[^?]+$/);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);

  // The old links to the draconic and harmonic screens still land on the Charts page.
  const personId = /#\/chart\/([^?]+)/.exec(page.url())?.[1];
  await page.goto(`${baseUrl}/#/draconic/${personId ?? ''}`);
  await expect(page.getByRole('heading', { name: /draconic/i, level: 1 })).toBeVisible();
});

test('a solar return and a lunar return are charts like any other, with their contacts to the natal chart', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);

  // A house system chosen on the natal chart applies to the returns, which share its Extended settings.
  await openNatalChart(page);
  await openSettings(page);
  await page.getByLabel('House system', { exact: true }).selectOption('W');
  await page.getByRole('button', { name: 'Apply and redraw', exact: true }).click();

  await openChart(page, 'Solar return');
  await expect(page.getByRole('heading', { name: /solar return/i, level: 1 })).toBeVisible();
  await openSettings(page);
  await expect(page.getByLabel('House system', { exact: true })).toHaveValue('W');
  await closeSettings(page);
  await page.getByLabel('Year').fill('2025');
  await expect(page.getByText(/Exact return: 2025-12-/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Contacts to the natal chart' })).toBeVisible();
  await page.getByRole('tab', { name: 'Positions', exact: true }).click();
  await expect(page).toHaveURL(/\?type=solar-return&section=positions$/);

  // Cast somewhere else: the same moment, another Ascendant.
  await page.getByRole('radio', { name: 'Another place' }).check();
  await page.getByLabel('Latitude').fill('-33.87');
  await page.getByLabel('Longitude').fill('151.21');
  await expect(page.getByText(/Exact return: 2025-12-/)).toBeVisible({ timeout: 30_000 });

  await openChart(page, 'Lunar return');
  await expect(page.getByRole('heading', { name: /lunar return/i, level: 1 })).toBeVisible();
  await page.getByLabel('On or after').fill('2025-03-01');
  await expect(page.getByText(/Exact return: 2025-03-/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('table', { name: 'Contacts to the natal chart' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('the Export menu lists the open chart’s own exports under "This page"', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  const header = page.getByRole('banner');

  const read = async (download: Download): Promise<string> => {
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf-8');
  };

  // Full-data export and the people CSV moved to Preferences → Data & privacy (#506/#510,
  // e2e/preferences.spec.ts covers them); this menu no longer has them.
  await header.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(header.getByRole('button', { name: 'Everything (one file)', exact: true })).toHaveCount(0);
  await expect(header.getByRole('button', { name: 'People (CSV)', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // On a chart, its own exports are listed under "This page", and the wheel no longer carries buttons.
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export PDF…', exact: true })).toHaveCount(0);
  await header.getByRole('button', { name: 'Export', exact: true }).click();
  for (const name of [
    'Image (SVG)',
    'Image (PNG), Small (600px)',
    'Image (PNG), Medium (1200px)',
    'Image (PNG), Large (2400px)',
    'Document (PDF, via print)…',
  ]) {
    await expect(header.getByRole('button', { name, exact: true })).toBeVisible();
  }
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
  const [svg] = await Promise.all([
    page.waitForEvent('download'),
    header.getByRole('button', { name: 'Image (SVG)', exact: true }).click(),
  ]);
  expect(svg.suggestedFilename()).toBe('ada-lovelace-chart.svg');
  expect(await read(svg)).toContain('<svg');

  // Leaving the chart takes its exports away; the PDF builder link stays.
  await openTool(page, 'Eclipses');
  await header.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(header.getByRole('button', { name: 'Image (SVG)', exact: true })).toHaveCount(0);
  await expect(header.getByRole('link', { name: 'Build custom PDF…', exact: true })).toBeVisible();
});
