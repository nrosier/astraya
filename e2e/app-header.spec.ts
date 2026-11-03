/**
 * The sticky header (#421, #506/#509): holds the name, the sync and account status, the language
 * and the theme, in place of the two fixed corners they used to sit in. At >=64rem (Playwright's
 * default viewport) `WorkspaceShell.tsx` lays the navigation out as a left rail rather than a bar
 * across the top; the utilities (sync, account, Preferences, language, symbols, theme) sit in a
 * container at the rail's foot (#882), in its own flow and not `position: fixed`. The rail itself
 * stays in view while a long page scrolls, offers a skip link as the first thing a keyboard
 * reaches, and is hidden when printing.
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { gotoAndSettle, openNatalChart, signIn } from './support.ts';

// Phone (below 64rem: the utilities keep the header's own wrapped row), a laptop and an ultra-wide
// monitor (the rail stays 16rem wide however wide the screen is).
const RAIL_FOOT_VIEWPORTS = [
  { width: 390, height: 844, rail: false },
  { width: 1280, height: 800, rail: true },
  { width: 3440, height: 1440, rail: true },
] as const;

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
  // The sync dot is grey while the data is only on this device (#964); the manual sync button is ↻.
  await expect(header.locator('.syncbadge-dot')).toHaveAttribute('data-state', 'local');
  // Language and theme are now segmented controls in the profile popover (#964), not footer pills.
  await expect(header.locator('.language-toggle')).toHaveCount(0);
  await expect(header.locator('.theme-toggle')).toHaveCount(0);
  await expect(page.locator('.locale-bar')).toHaveCount(0);
  await expect(page.locator('.account-bar')).toHaveCount(0);
  // It is a real page-flow element at the leading edge (the left rail at >=64rem), not an overlay
  // in a corner — it starts at the very top-left, and its own content fits inside its own width.
  const box = await header.boundingBox();
  expect(box?.x).toBe(0);
  expect(box?.y).toBe(0);
});

for (const { width, height, rail } of RAIL_FOOT_VIEWPORTS) {
  test(`the utilities sit in the header's foot container and fit inside it at ${String(width)}px wide (#882)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await gotoAndSettle(page, `${baseUrl}/#/people`);
    const header = page.getByRole('banner');
    const foot = header.locator('.app-header-end');
    const headerBox = await header.boundingBox();
    const footBox = await foot.boundingBox();
    if (headerBox === null || footBox === null) throw new Error('not laid out');

    // The utilities in the one container: the sync bar, the account tile (a guest's Sign in) and the symbol toggle (#964).
    for (const control of [
      foot.locator('.syncbadge'),
      foot.getByRole('button', { name: 'Sign in', exact: true }),
      foot.locator('.symbol-toggle'),
    ]) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      if (box === null) throw new Error('not laid out');
      // Each control fits inside its container, and the container fits inside the header.
      expect(box.x).toBeGreaterThanOrEqual(footBox.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(footBox.x + footBox.width + 1);
    }
    expect(footBox.x).toBeGreaterThanOrEqual(headerBox.x - 1);
    expect(footBox.x + footBox.width).toBeLessThanOrEqual(headerBox.x + headerBox.width + 1);
    expect(await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(1);

    if (rail) {
      // At >=64rem the rail is 16rem wide at every width (16rem of the 87.5% root size, so 224px), and
      // the container is in its flow, not fixed.
      const rootPx = await page.evaluate<number>('parseFloat(getComputedStyle(document.documentElement).fontSize)');
      const railPx = 16 * rootPx;
      await expect(foot).toHaveCSS('position', 'static');
      expect(headerBox.width).toBeCloseTo(railPx, 0);
      expect(footBox.x + footBox.width).toBeLessThanOrEqual(railPx + 1);
      // At the foot: below the navigation, and ending at the rail's bottom edge less its 1rem padding.
      const navBox = await page.getByRole('navigation', { name: 'Main', exact: true }).boundingBox();
      if (navBox === null) throw new Error('not laid out');
      expect(footBox.y).toBeGreaterThanOrEqual(navBox.y + navBox.height - 1);
      // The sidebar footer (version, licence, update notice) is the very last block, ending at that
      // edge; the utilities sit directly above it.
      const sidebarFooterBox = await header.locator('.sidebar-footer').boundingBox();
      if (sidebarFooterBox === null) throw new Error('not laid out');
      expect(footBox.y + footBox.height).toBeLessThanOrEqual(sidebarFooterBox.y + 1);
      expect(
        Math.abs(sidebarFooterBox.y + sidebarFooterBox.height - (headerBox.y + headerBox.height) + 16),
      ).toBeLessThanOrEqual(2);
    } else {
      // Below 64rem nothing about the bar changed: the controls stay in the header's own row.
      await expect(foot).not.toHaveCSS('position', 'fixed');
    }
  });
}

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

test('the sync popover closes on Escape, a click outside and focus leaving the badge (#1081)', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  const badge = page.locator('button.syncbadge-label');
  const popover = page.locator('.syncbadge-popover');

  // Escape closes it even after focus has moved on, and returns focus to the badge.
  await badge.click();
  await expect(popover).toBeVisible();
  await page.getByRole('heading', { name: 'People', level: 1 }).click();
  await badge.click();
  await expect(popover).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(badge).toBeFocused();

  // A click elsewhere on the page closes it.
  await badge.click();
  await expect(popover).toBeVisible();
  await page.getByRole('heading', { name: 'People', level: 1 }).click();
  await expect(popover).toBeHidden();

  // A disclosure: Tab from the badge reaches the popover's link and keeps it open; Tab past it closes it.
  await badge.click();
  const link = popover.getByRole('link');
  await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  await expect(popover).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(popover).toBeHidden();
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
    header.locator('.symbol-toggle'),
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

  test('the header stays in view and usable while a long page scrolls', async () => {
    test.setTimeout(60_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    // Scroll to the very bottom of the long chart page. A sticky element whose own height equals the
    // viewport's can land a fraction of a pixel short of its top:0 anchor when the document's total
    // height isn't a whole number of pixels (ordinary sub-pixel text layout, not a real gap) — the
    // ratio and y-position checks allow for that instead of demanding exact equality.
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    const header = page.getByRole('banner');
    await expect(header).toBeInViewport({ ratio: 0.99 });
    expect((await header.boundingBox())?.y).toBeGreaterThan(-1);

    // And it is clickable down there: the profile popover's theme control works without scrolling back up (#964).
    const menu = header
      .locator('[aria-haspopup="true"].profile-tile, [aria-haspopup="true"].profile-tile-menu')
      .first();
    await menu.click();
    const dark = page.locator('.profile-popover').getByRole('radio', { name: /Dark$/ });
    await dark.check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // #1047: Light and System sit beside Dark; System clears the explicit override and stores 'system'.
    await page
      .locator('.profile-popover')
      .getByRole('radio', { name: /Light$/ })
      .check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page
      .locator('.profile-popover')
      .getByRole('radio', { name: /System$/ })
      .check();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    expect(await page.evaluate(() => localStorage.getItem('astraya.theme'))).toBe('system');
    await page.keyboard.press('Escape');
  });

  test('the popover theme radiogroup is operated by keyboard alone (#1047)', async () => {
    await gotoAndSettle(page, `${baseUrl}/#/people`);
    const header = page.getByRole('banner');
    await header
      .locator('[aria-haspopup="true"].profile-tile, [aria-haspopup="true"].profile-tile-menu')
      .first()
      .click();
    const popover = page.locator('.profile-popover');
    await expect(popover).toBeVisible();

    // The Theme control is announced as a radiogroup named "Theme", with three native radio options.
    const group = popover.getByRole('radiogroup', { name: 'Theme', exact: true });
    await expect(group).toBeVisible();
    const light = group.getByRole('radio', { name: /Light$/ });
    const dark = group.getByRole('radio', { name: /Dark$/ });
    const system = group.getByRole('radio', { name: /System$/ });
    await expect(group.getByRole('radio')).toHaveCount(3);

    // The seeded context starts with no explicit override: System is the checked option.
    await expect(system).toBeChecked();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');

    // Focus the group's current option from the keyboard side, then move with the arrow keys only.
    await system.focus();
    await expect(system).toBeFocused();

    // ArrowRight wraps from the last option (System) to the first (Light), selecting it.
    await page.keyboard.press('ArrowRight');
    await expect(light).toBeFocused();
    await expect(light).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('astraya.theme'))).toBe('light');

    // ArrowRight moves to Dark and selects it.
    await page.keyboard.press('ArrowRight');
    await expect(dark).toBeFocused();
    await expect(dark).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('astraya.theme'))).toBe('dark');

    // Space on the already-checked Dark option leaves the selection unchanged.
    await page.keyboard.press('Space');
    await expect(dark).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // ArrowLeft moves back to Light.
    await page.keyboard.press('ArrowLeft');
    await expect(light).toBeFocused();
    await expect(light).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // ArrowLeft wraps from Light to System, which clears the explicit override and stores 'system'.
    await page.keyboard.press('ArrowLeft');
    await expect(system).toBeFocused();
    await expect(system).toBeChecked();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    expect(await page.evaluate(() => localStorage.getItem('astraya.theme'))).toBe('system');

    await page.keyboard.press('Escape');
  });
});

// The sync dot turns green (#964) and the ↻ button runs a manual sync only once a signed-in
// session starts the real sync engine. That needs its own server with a bootstrapped admin, so
// it stays apart from the signed-out server above.
test.describe('signed in: the sync dot and the manual sync button (#964)', () => {
  const USERNAME = 'header-sync-user';
  const PASSWORD = 'correct-horse-battery-header';
  const BOOTSTRAP = 'e2e-header-bootstrap-token';
  let signedDir: string;
  let signedApp: FastifyInstance;
  let signedUrl: string;

  test.beforeAll(async () => {
    signedDir = mkdtempSync(join(tmpdir(), 'astraya-e2e-header-sync-'));
    process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP;
    process.env.ASTRAYA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    signedApp = await build({ dbPath: join(signedDir, 'astraya.db') });
    await signedApp.listen({ port: 0, host: '127.0.0.1' });
    const address = signedApp.server.address();
    if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
    signedUrl = `http://127.0.0.1:${String(address.port)}`;
    const response = await fetch(new URL('/api/setup', signedUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: BOOTSTRAP, username: USERNAME, password: PASSWORD }),
    });
    if (!response.ok) throw new Error(`bootstrap failed with status ${String(response.status)}`);
  });

  test.afterAll(async () => {
    await signedApp.close();
    rmSync(signedDir, { recursive: true, force: true });
    delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
    delete process.env.ASTRAYA_ENCRYPTION_KEY;
  });

  test('a signed-in device with synced data shows the green dot, and the sync button runs a sync', async ({ page }) => {
    await gotoAndSettle(page, `${signedUrl}/#/people`);
    await signIn(page, USERNAME, PASSWORD);
    const header = page.getByRole('banner');
    await expect(page.getByText('Synced', { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    // Green (synced), not grey (local), once the engine has reached its synced state.
    await expect(header.locator('.syncbadge-dot')).toHaveAttribute('data-state', 'synced');

    // The ↻ button is present and enabled, and clicking it sends a real request to the relay.
    const syncButton = header.getByRole('button', { name: 'Sync now', exact: true });
    await expect(syncButton).toBeEnabled();
    const opsRequest = page.waitForResponse((response) => response.url().includes('/api/ops'));
    await syncButton.click();
    expect((await opsRequest).ok()).toBe(true);
    await expect(header.locator('.syncbadge-dot')).toHaveAttribute('data-state', 'synced');
  });

  test('the profile popover stays inside a narrow sidebar at 390px without clipping or scrolling the page (#964)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAndSettle(page, `${signedUrl}/#/people`);
    await signIn(page, USERNAME, PASSWORD);
    const header = page.getByRole('banner');

    await header.locator('.profile-tile[aria-haspopup="true"]').click();
    const popover = page.locator('.profile-popover');
    await expect(popover).toBeVisible();
    const preferences = popover.getByRole('link', { name: 'Preferences', exact: true });
    await expect(preferences).toBeVisible();

    const viewport = page.viewportSize();
    if (viewport === null) throw new Error('no viewport');
    const popoverBox = await popover.boundingBox();
    const headerBox = await header.boundingBox();
    const linkBox = await preferences.boundingBox();
    if (popoverBox === null || headerBox === null || linkBox === null) throw new Error('not laid out');

    // The popover lies within the viewport horizontally: not running off either screen edge.
    expect(popoverBox.x).toBeGreaterThanOrEqual(0);
    expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(viewport.width);
    // The header is a plain flow block here (not a clipping scroller), so the popover must sit inside
    // the header's horizontal extent as well as the viewport.
    expect(popoverBox.x).toBeGreaterThanOrEqual(headerBox.x - 1);
    expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(headerBox.x + headerBox.width + 1);

    // The Preferences link is not clipped: it has a box and that box intersects the viewport.
    expect(linkBox.x + linkBox.width).toBeGreaterThan(0);
    expect(linkBox.x).toBeLessThan(viewport.width);
    expect(linkBox.y + linkBox.height).toBeGreaterThan(0);
    expect(linkBox.y).toBeLessThan(viewport.height);

    // Opening the menu adds no horizontal page scroll.
    expect(
      await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth'),
    ).toBeLessThanOrEqual(0);
  });
});
