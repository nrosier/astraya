/**
 * The header navigation (#421): the Tools menu on every screen, the person's chip and tabs in the
 * header instead of a strip above the page, and the Menu button that folds it on a phone.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { createPerson, gotoAndSettle, openTool } from './support.ts';

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
  for (const name of ['Birth record', 'Natal chart', 'Interpretation', 'Astrocartography']) {
    await expect(header.getByRole('link', { name, exact: true })).toBeVisible();
  }
  for (const name of ['Transits & Forecast', 'Progressions & Directions', 'Relationship Charts', 'Chart Variants']) {
    await expect(header.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator('.person-shelf')).toHaveCount(0);
  await expect(header.getByRole('link', { name: 'Birth record', exact: true })).toHaveAttribute('aria-current', 'page');

  // The person's tabs and the Tools menu share one open-at-a-time rule.
  await header.getByRole('button', { name: 'Chart Variants', exact: true }).click();
  await header.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(header.getByRole('navigation', { name: 'Chart Variants subtabs' })).toHaveCount(0);
  await expect(header.getByRole('navigation', { name: 'Tools subtabs' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);

  // Going to a tool leaves the person's tabs behind: it is not about their chart.
  await header.getByRole('link', { name: 'Planetary cycles', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Planetary cycles', level: 1 })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Natal chart', exact: true })).toHaveCount(0);
});

test('on a phone the navigation folds behind a Menu button, and nothing scrolls sideways', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  const header = page.getByRole('banner');

  await expect(header.getByRole('link', { name: 'Natal chart', exact: true })).toBeHidden();
  const menu = header.getByRole('button', { name: 'Menu', exact: true });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await expect(header.getByRole('button', { name: 'Close menu', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(header.getByRole('link', { name: 'Natal chart', exact: true })).toBeVisible();
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

test('the header keeps the navigation reachable and the page content clear of it while scrolling', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await page.getByRole('link', { name: 'Natal chart', exact: true }).click();
  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await page.locator('footer').scrollIntoViewIfNeeded();
  const header = page.getByRole('banner');
  await expect(header).toBeInViewport({ ratio: 1 });
  // The header is a real row of the page at its true height: scroll padding follows it.
  const padding = await page.evaluate('parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)');
  const box = await header.boundingBox();
  expect(padding).toBeGreaterThanOrEqual((box?.height ?? 0) - 1);
  await header.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(header.getByRole('link', { name: 'Eclipses', exact: true })).toBeVisible();
});
