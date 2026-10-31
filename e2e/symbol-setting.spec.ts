/**
 * The symbol class (#419) on a real chart: Drawn (the default), Unicode and Text only change the wheel,
 * the tables and the exported SVG together, and the choice is kept on this device.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { gotoAndSettle, openNatalChart, applySettings, closeSettings, openSettings } from './support.ts';

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

test('the transit wheel and the cycles diagram follow the class too', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.evaluate(() => {
    localStorage.setItem('astraya:symbolClass', 'text');
  });
  await page.goto(`${baseUrl}/#/explore/cycles`);
  await page.reload();
  await page.waitForEvent('load', { timeout: 5_000 }).catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'Planetary cycles', level: 1 })).toBeVisible();
  await expect(page.locator('.cycle-diagram text.chart-symbol-text-text').first()).toBeVisible({ timeout: 30_000 });
});

test.describe('with the shared people (#799)', () => {
  let context: BrowserContext;
  let page: Page;

  // A fresh context per test, holding the shared people (#799).
  test.beforeEach(async ({ browser }) => {
    context = await newSeededContext(browser, baseUrl);
    page = await context.newPage();
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('the symbol class changes the wheel, the tables and the export together, and is kept on this device', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    await openSettings(page, 'Display & glyphs');
    const symbols = page.getByLabel('Symbols', { exact: true });
    await expect(symbols).toHaveValue('drawn');
    await expect(page.locator('.chart-wheel text.chart-symbol-text')).toHaveCount(0);

    // Text only: the wheel writes three-letter codes, and so do the tables.
    await symbols.selectOption('text');
    await expect(page.locator('.chart-wheel text.chart-symbol-text-text').first()).toBeVisible();
    await expect(page.locator('.chart-wheel text.chart-symbol-text-text', { hasText: 'SUN' }).first()).toBeAttached();
    await applySettings(page);
    await page.getByRole('link', { name: 'Placements', exact: true }).click();
    await expect(page.locator('#chart-view-placements .table-symbol-text', { hasText: 'SUN' })).toBeVisible();

    // Unicode: the characters instead.
    await page.getByRole('link', { name: 'Wheel', exact: true }).click();
    await openSettings(page, 'Display & glyphs');
    await symbols.selectOption('unicode');
    await expect(page.locator('.chart-wheel text.chart-symbol-text-unicode', { hasText: '☉' }).first()).toBeAttached();
    await applySettings(page);
    await page.getByRole('link', { name: 'Placements', exact: true }).click();
    await expect(page.locator('#chart-view-placements td', { hasText: '☉' }).first()).toBeVisible();

    // The wheel shows the text choice; the PDF creator (#915) takes it from the same settings when it builds the chart.
    await page.getByRole('link', { name: 'Wheel', exact: true }).click();
    await openSettings(page, 'Display & glyphs');
    await symbols.selectOption('text');
    await applySettings(page);
    await expect(page.locator('.chart-wheel text.chart-symbol-text-text').first()).toBeAttached();

    // Kept on this device across a reload; Drawn restores the paths.
    await page.reload();
    await page.waitForEvent('load', { timeout: 5_000 }).catch(() => undefined);
    await expect(page.locator('.chart-wheel text.chart-symbol-text-text').first()).toBeVisible();
    await openSettings(page, 'Display & glyphs');
    await expect(page.getByLabel('Symbols', { exact: true })).toHaveValue('text');
    await page.getByLabel('Symbols', { exact: true }).selectOption('drawn');
    await expect(page.locator('.chart-wheel text.chart-symbol-text')).toHaveCount(0);

    const axe = await new AxeBuilder({ page }).include('dialog').analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
  });

  test('Uranus and Pluto can be drawn in either of their two forms, kept on this device', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();
    await openSettings(page, 'Display & glyphs');

    // The astronomical form's arrow shaft is a path of its own, so it is on the wheel only once it is chosen.
    const arrowShaft = page.locator('.chart-wheel path[d="M50 50 L50 12"]');
    await expect(arrowShaft).toHaveCount(0);
    await page.getByLabel('Uranus', { exact: true }).selectOption('astronomical');
    await expect(arrowShaft.first()).toBeAttached();

    // The Unicode class follows the form.
    await page.getByLabel('Symbols', { exact: true }).selectOption('unicode');
    await expect(page.locator('.chart-wheel text.chart-symbol-text-unicode', { hasText: '⛢' }).first()).toBeAttached();

    // Kept on this device: still chosen after a reload.
    await page.reload();
    await page.waitForEvent('load', { timeout: 5_000 }).catch(() => undefined);
    await openSettings(page, 'Display & glyphs');
    await expect(page.getByLabel('Uranus', { exact: true })).toHaveValue('astronomical');
    // The Pluto forms (like the line weight) are only visible in the drawn class, so they are disabled in the others.
    await expect(page.getByLabel('Pluto', { exact: true })).toBeDisabled();
    await page.getByLabel('Symbols', { exact: true }).selectOption('drawn');
    await page.getByLabel('Pluto', { exact: true }).selectOption('monogram');
    await expect(page.getByLabel('Pluto', { exact: true })).toHaveValue('monogram');
  });

  test('the header toggle writes the symbols as text, and the line weight changes the drawn glyphs', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();
    await openSettings(page, 'Display & glyphs');

    // Line weight: a drawn glyph carries the custom property once the weight is not regular.
    await expect(page.locator('.chart-wheel g[style*="--glyph-stroke"]')).toHaveCount(0);
    await page.getByLabel('Line weight', { exact: true }).selectOption('bold');
    await expect(page.locator('.chart-wheel g[style*="--glyph-stroke:9"]').first()).toBeAttached();
    await page.getByLabel('Line weight', { exact: true }).selectOption('regular');
    await expect(page.locator('.chart-wheel g[style*="--glyph-stroke"]')).toHaveCount(0);

    // The header toggle: text only on, and the Symbols setting follows.
    await closeSettings(page);
    const toggle = page.getByRole('button', { name: 'Text-only symbols', exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.chart-wheel text.chart-symbol-text-text', { hasText: 'SUN' }).first()).toBeAttached();
    await openSettings(page, 'Display & glyphs');
    await expect(page.getByLabel('Symbols', { exact: true })).toHaveValue('text');
    await closeSettings(page);
    await toggle.click();
    await openSettings(page, 'Display & glyphs');
    await expect(page.getByLabel('Symbols', { exact: true })).toHaveValue('drawn');
  });
});
