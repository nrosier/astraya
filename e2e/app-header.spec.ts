/**
 * The sticky header (#421, #506/#509): holds the name, the sync and account status, the language
 * and the theme, in place of the two fixed corners they used to sit in. At >=64rem (Playwright's
 * default viewport) `WorkspaceShell.tsx` lays the navigation out as a left rail rather than a bar
 * across the top; the account/language/theme cluster is not navigation, so it does not move into
 * the rail with it — it stays fixed in the content area's top-right corner instead, same place
 * (and same downward-opening sign-in box) the old top-bar design always put it. The rail itself
 * stays in view while a long page scrolls, offers a skip link as the first thing a keyboard
 * reaches, and is hidden when printing.
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
  // It is a real page-flow element at the leading edge (the left rail at >=64rem), not an overlay
  // in a corner — it starts at the very top-left, and its own content fits inside its own width.
  const box = await header.boundingBox();
  expect(box?.x).toBe(0);
  expect(box?.y).toBe(0);
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

  // Scroll to the very bottom of the long chart page. A sticky element whose own height equals the
  // viewport's can land a fraction of a pixel short of its top:0 anchor when the document's total
  // height isn't a whole number of pixels (ordinary sub-pixel text layout, not a real gap) — the
  // ratio and y-position checks allow for that instead of demanding exact equality.
  await page.locator('footer').scrollIntoViewIfNeeded();
  const header = page.getByRole('banner');
  await expect(header).toBeInViewport({ ratio: 0.99 });
  expect((await header.boundingBox())?.y).toBeGreaterThan(-1);

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

test('the sign-in dialog opens centred, inside the screen, and takes input', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  const button = page.getByRole('banner').getByRole('button', { name: 'Sign in', exact: true });
  await button.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const dialogBox = await dialog.boundingBox();
  const viewport = page.viewportSize();
  if (dialogBox === null || viewport === null) throw new Error('not laid out');
  expect(dialogBox.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(viewport.width);
  expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(viewport.height);
  // Not covered by anything: the username field takes input.
  await dialog.getByLabel('Username', { exact: true }).fill('someone');
  await expect(dialog.getByLabel('Username', { exact: true })).toHaveValue('someone');
});

test('on a phone-width screen the header and the sign-in dialog stay inside the screen', async ({ page }) => {
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
  const box = await page.getByRole('dialog').boundingBox();
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
