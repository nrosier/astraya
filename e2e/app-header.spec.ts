/**
 * The sticky header (#421): one bar across the top of every screen holding the name, the sync and
 * account status, the language and the theme, in place of the two fixed corners they used to sit in.
 * It stays in view while a long page scrolls, opens the sign-in box beneath itself and inside the
 * screen, offers a skip link as the first thing a keyboard reaches, and is hidden when printing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { createPerson, gotoAndSettle, openNatalChart } from './support.ts';

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

test('one header holds the name, account, language and theme, and the old fixed corners are gone', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  const header = page.getByRole('banner');
  await expect(header).toBeVisible();
  await expect(header.getByRole('link', { name: 'Astraya, back to the people list' })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(header.locator('.language-toggle')).toBeVisible();
  await expect(header.locator('.theme-toggle:not(.language-toggle)')).toBeVisible();
  await expect(page.locator('.locale-bar')).toHaveCount(0);
  await expect(page.locator('.account-bar')).toHaveCount(0);
  // It is a real page-flow header at the top, not an overlay in a corner.
  const box = await header.boundingBox();
  expect(box?.y).toBe(0);
  expect(box?.width).toBe(page.viewportSize()?.width);
});

test('the header stays in view and usable while a long page scrolls', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openNatalChart(page);
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  // Scroll to the very bottom of the long chart page.
  await page.locator('footer').scrollIntoViewIfNeeded();
  const header = page.getByRole('banner');
  await expect(header).toBeInViewport({ ratio: 1 });
  expect((await header.boundingBox())?.y).toBe(0);

  // And it is clickable down there: the theme toggle works without scrolling back up.
  const themeToggle = header.locator('.theme-toggle:not(.language-toggle)');
  const before = await page.locator('html').getAttribute('data-theme');
  await themeToggle.click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', before ?? '');
});

test('the first Tab reaches a skip link that moves focus to the content without changing the route', async ({
  page,
}) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  // Visible once focused, and inside the screen.
  expect((await skip.boundingBox())?.y).toBeGreaterThanOrEqual(0);

  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  // This app routes on the hash: following the link as an anchor would have changed the route.
  expect(new URL(page.url()).hash).toBe('#/people');
});

test('the sign-in box opens beneath the button, inside the screen, and can be used', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  const button = page.getByRole('banner').getByRole('button', { name: 'Sign in', exact: true });
  // Measured before opening: once the box is open its own submit button is also called "Sign in".
  const buttonBox = await button.boundingBox();
  await button.click();
  const popover = page.locator('.accountpanel-popover');
  await expect(popover).toBeVisible();

  const popoverBox = await popover.boundingBox();
  const viewport = page.viewportSize();
  if (buttonBox === null || popoverBox === null || viewport === null) throw new Error('not laid out');
  expect(popoverBox.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height);
  expect(popoverBox.x).toBeGreaterThanOrEqual(0);
  expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(viewport.width);
  // Right-aligned with its trigger, not hanging off the left edge.
  expect(Math.abs(popoverBox.x + popoverBox.width - (buttonBox.x + buttonBox.width))).toBeLessThan(2);
  // Not covered by anything: the username field takes input.
  await page.getByLabel('Username', { exact: true }).fill('someone');
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('someone');
});

test('on a phone-width screen the header and the sign-in box stay inside the screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  const header = page.getByRole('banner');
  for (const control of [
    header.getByRole('button', { name: 'Sign in', exact: true }),
    header.locator('.language-toggle'),
    header.locator('.theme-toggle:not(.language-toggle)'),
  ]) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 375).toBe(true);
  }
  await header.getByRole('button', { name: 'Sign in', exact: true }).click();
  const box = await page.locator('.accountpanel-popover').boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
});

test('scrolling to an anchor or focusing a field leaves room for the header, and printing hides it', async ({
  page,
}) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await expect(page.locator('html')).toHaveCSS('scroll-padding-top', /^[\d.]+px$/);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('banner')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await expect(page.getByRole('banner')).toBeVisible();
});

test('the header has no automatically detectable accessibility violations', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  const results = await new AxeBuilder({ page }).include('header').analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  // The whole page too: a new banner landmark and a skip link must not break the landmark rules.
  const whole = await new AxeBuilder({ page }).analyze();
  expect(whole.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
});
