/**
 * The Preferences workspace (#506/#510): reachable from the header's top-right cluster on every
 * screen, holds General/Astrology defaults/Appearance & accessibility/Data & privacy, and every
 * control there writes the same shared device/account preference the rest of the app already
 * reads — this spec exists to catch a regression where this page's own copy of a setting drifts
 * from the one everywhere else reads, not to re-test each setting's own behavior (covered by
 * `rulership-setting.spec.ts`, `symbol-setting.spec.ts`, etc.).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Download } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { newSeededContext, SHARED_PEOPLE } from './shared-people.ts';
import { gotoAndSettle } from './support.ts';

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

test('Preferences is reachable from every screen, has three tabs, and every tab has no automatically detectable accessibility violations', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('link', { name: 'Preferences', exact: true }).click();
  await expect(page).toHaveURL(/#\/preferences$/);
  await expect(page.getByRole('heading', { name: 'Preferences', level: 1 })).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Preferences sections' });
  await expect(tabs.getByRole('tab')).toHaveText([
    'Appearance & accessibility',
    'Astrology defaults',
    'Data & privacy',
  ]);
  // Opens on Appearance, where the language now lives, and says what the tab's settings are stored as.
  await expect(tabs.getByRole('tab', { name: 'Appearance & accessibility' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Appearance & accessibility' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name: 'EN' })).toBeChecked();
  await expect(page.getByText(/^This device\./).first()).toBeVisible();
  // The link marks itself current while here, same convention as every other nav link.
  await expect(page.getByRole('link', { name: 'Preferences', exact: true })).toHaveAttribute('aria-current', 'page');
  for (const name of ['Appearance & accessibility', 'Astrology defaults', 'Data & privacy']) {
    await tabs.getByRole('tab', { name }).click();
    await expect(page.getByRole('tabpanel', { name })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations, name).toEqual([]);
  }
});

test('the tabs follow the arrow keys, keep one panel on screen, and do not add history entries (#650)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('link', { name: 'Preferences', exact: true }).click();
  const tabs = page.getByRole('tablist', { name: 'Preferences sections' });
  const appearance = tabs.getByRole('tab', { name: 'Appearance & accessibility' });
  await appearance.focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Astrology defaults' })).toBeFocused();
  await expect(tabs.getByRole('tab', { name: 'Astrology defaults' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/#\/preferences\/astrology$/);
  // One panel at a time: the other tabs' controls are not in the page.
  await expect(page.getByRole('radiogroup', { name: 'Planetary rulers' })).toBeVisible();
  await expect(page.getByLabel('Motion', { exact: true })).toHaveCount(0);
  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab', { name: 'Data & privacy' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(appearance).toHaveAttribute('aria-selected', 'true');
  // Three switches later, Back still leaves Preferences instead of stepping through the tabs.
  await page.goBack();
  await expect(page).toHaveURL(/#\/people$/);
});

for (const width of [390, 1280]) {
  test(`the Preferences tab row is the shared scrolling row at ${String(width)}px and the arrows still move focus (#818)`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await gotoAndSettle(page, `${baseUrl}/#/preferences`);
    const scroller = page.locator('.tab-row--always .tab-row__scroll');
    await expect(scroller).toHaveCSS('overflow-x', 'auto');
    await expect(scroller).toHaveCSS('touch-action', 'pan-x');
    await expect(scroller).toHaveCSS('overscroll-behavior-x', 'contain');
    await expect(scroller).toHaveCSS('scrollbar-width', 'none');
    await expect(page.locator('.tab-row--always .tab-row__fade--start')).toHaveCount(1);
    await expect(page.locator('.tab-row--always .tab-row__fade--end')).toHaveCount(1);
    await expect(page.locator('.tab-row--always .tab-row__fade--end')).toHaveCSS('pointer-events', 'none');
    const metrics = await page.evaluate<{ readonly scrollWidth: number; readonly clientWidth: number }>(`(() => {
      const el = document.querySelector('.tab-row--always .tab-row__scroll');
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    })()`);
    if (width === 390) {
      // Three long labels do not fit a phone: the row scrolls instead of wrapping, and the end fade points at them.
      expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
      await expect(page.locator('.tab-row--always .tab-row__fade--end')).toHaveCSS('opacity', '1');
    } else {
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
      await expect(page.locator('.tab-row--always .tab-row__fade--end')).toHaveCSS('opacity', '0');
    }
    // Never a sideways page scroll, whatever the row does.
    expect(await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(1);
    // The tablist semantics and arrow behaviour are unchanged inside the scroller.
    const tabs = page.getByRole('tablist', { name: 'Preferences sections' });
    await tabs.getByRole('tab', { name: 'Appearance & accessibility' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab', { name: 'Astrology defaults' })).toBeFocused();
    await expect(tabs.getByRole('tab', { name: 'Astrology defaults' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(tabs.getByRole('tab', { name: 'Data & privacy' })).toBeFocused();
    await expect(tabs.getByRole('tab', { name: 'Data & privacy' })).toBeInViewport();
  });
}

test('an old #/preferences/general link opens Appearance, where the language moved (#650)', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/preferences/general`);
  await expect(page.getByRole('tabpanel', { name: 'Appearance & accessibility' })).toBeVisible();
});

test('a section link opens Preferences at that heading and moves focus there (#509)', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/preferences/data`);
  await expect(page.getByRole('tabpanel', { name: 'Data & privacy' })).toBeFocused();
  await gotoAndSettle(page, `${baseUrl}/#/preferences/astrology`);
  await expect(page.getByRole('tabpanel', { name: 'Astrology defaults' })).toBeFocused();
  // An unknown section is not a guess at one: the hash falls back to People.
  await gotoAndSettle(page, `${baseUrl}/#/preferences/nope`);
  await expect(page.getByRole('heading', { name: 'Preferences', level: 1 })).toHaveCount(0);
});

test('Motion and Density are device preferences: applied at once, kept across a reload, and compact never shrinks touch targets (#510)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/preferences/appearance`);
  const root = page.locator('html');
  await expect(root).not.toHaveAttribute('data-motion', /.*/);
  await expect(root).not.toHaveAttribute('data-density', /.*/);

  await page.getByLabel('Motion', { exact: true }).selectOption('reduced');
  await page.getByLabel('Density', { exact: true }).selectOption('compact');
  await expect(root).toHaveAttribute('data-motion', 'reduced');
  await expect(root).toHaveAttribute('data-density', 'compact');
  // Reduce motion really switches transitions off, everywhere.
  const duration = await page.evaluate(
    "getComputedStyle(document.querySelector('.primitive-field select')).transitionDuration",
  );
  expect(duration).toBe('1e-05s');

  await page.reload();
  await expect(root).toHaveAttribute('data-motion', 'reduced');
  await expect(root).toHaveAttribute('data-density', 'compact');
  await expect(page.getByLabel('Motion', { exact: true })).toHaveValue('reduced');

  // A compact select is tighter than a standard one on a fine pointer…
  const density = page.getByLabel('Density', { exact: true });
  const heightOf = async (): Promise<number> => (await density.boundingBox())?.height ?? 0;
  await expect.poll(heightOf).toBeGreaterThan(0);
  const compact = await heightOf();
  await density.selectOption('standard');
  await expect(root).not.toHaveAttribute('data-density', /.*/);
  await expect.poll(heightOf).toBeGreaterThan(compact);
});

test('the rulers choice changed here is the same one chart screens read, and survives a reload', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('link', { name: 'Preferences', exact: true }).click();
  await page.getByRole('tab', { name: 'Astrology defaults' }).click();
  const group = page.getByRole('radiogroup', { name: 'Planetary rulers', exact: true });
  await expect(group.getByRole('radio', { name: /^Modern/ })).toBeChecked();
  await group.getByRole('radio', { name: /^Traditional/ }).check();

  await page.reload();
  await page.waitForEvent('load', { timeout: 5_000 }).catch(() => undefined);
  await expect(group.getByRole('radio', { name: /^Traditional/ })).toBeChecked();

  // Reset so this test leaves no state behind for the suite's shared ASTRAYA_DB_PATH-free run.
  await group.getByRole('radio', { name: /^Modern/ }).check();
});

test('exporting everything and the people CSV both produce real downloads', async ({ browser }) => {
  test.setTimeout(60_000);
  // The shared people (#799): the export is read-only, so a context holding them stands in for a device with data.
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('link', { name: 'Preferences', exact: true }).click();
  await page.getByRole('tab', { name: 'Data & privacy' }).click();

  const read = async (download: Download): Promise<string> => {
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf-8');
  };

  const [everything] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export everything (one file)', exact: true }).click(),
  ]);
  expect(everything.suggestedFilename()).toMatch(/^astraya-export-\d{4}-\d{2}-\d{2}\.json$/);
  const archive = JSON.parse(await read(everything)) as { people: { displayName: string }[] };
  expect(archive.people.map((p) => p.displayName).sort()).toEqual(SHARED_PEOPLE.map((p) => p.name).sort());
  await expect(page.getByText('everything exported.', { exact: false })).toBeVisible();

  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export people (CSV)', exact: true }).click(),
  ]);
  expect(await read(csv)).toContain('Albert Einstein,1879-03-14,11:30:00,recorded');
  await context.close();
});
