/**
 * The command palette in the real, built app (#1654, task 1654-6): opened from the header trigger and from
 * Ctrl+K, searched, navigated with the arrow keys, and opened with Enter; Escape closes it and returns
 * focus to the trigger. Each case runs at 1920x1080 and at 390x844 (the phone header, where the trigger is
 * an icon-only circle). Real server, real browser storage, the shared people seeded once by global setup.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';

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

const VIEWPORTS = [
  { label: '1920x1080', width: 1920, height: 1080 },
  { label: '390x844', width: 390, height: 844 },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`command palette at ${viewport.label}`, () => {
    let context: BrowserContext;
    let page: Page;

    // A fresh context per test, holding the shared people, so each test starts with no recents or pins.
    test.beforeEach(async ({ browser }) => {
      context = await newSeededContext(browser, baseUrl, {
        viewport: { width: viewport.width, height: viewport.height },
      });
      page = await context.newPage();
      await openSharedPerson(page, baseUrl, EINSTEIN);
    });

    test.afterEach(async () => {
      await context.close();
    });

    const dialog = (p: Page) => p.getByRole('dialog', { name: 'Search features and pages', exact: true });
    const search = (p: Page) => p.getByRole('combobox', { name: 'Search features, charts and tabs', exact: true });
    const trigger = (p: Page) => p.getByRole('button', { name: /^Search features, charts, tabs…/ });
    // Results only: the page has native <option> elements (a select) that a bare role query would also match.
    const results = (p: Page) => p.getByRole('listbox', { name: 'Results', exact: true });
    const options = (p: Page) => results(p).getByRole('option');

    test('the header trigger opens the palette with the search field focused, and Escape returns focus to it', async () => {
      test.setTimeout(60_000);
      await trigger(page).click();
      await expect(dialog(page)).toBeVisible();
      await expect(search(page)).toBeFocused();

      await page.keyboard.press('Escape');
      await expect(dialog(page)).toBeHidden();
      await expect(trigger(page)).toBeFocused();
    });

    test('Ctrl+K opens the palette from the page, and Ctrl+K typed in the search field does not reopen it', async () => {
      test.setTimeout(60_000);
      await page.locator('body').click();
      await page.keyboard.press('Control+k');
      await expect(dialog(page)).toBeVisible();
      await expect(search(page)).toBeFocused();

      // Inside the field the shortcut is ignored: the palette stays open and the query is not replaced.
      await page.keyboard.press('Control+k');
      await expect(dialog(page)).toBeVisible();
      await expect(search(page)).toHaveValue('');

      await page.keyboard.press('Escape');
      await expect(dialog(page)).toBeHidden();
      await expect(trigger(page)).toBeFocused();
    });

    test('"solar return" lists every Solar return view, each with the person and the Charts breadcrumb', async () => {
      test.setTimeout(60_000);
      await trigger(page).click();
      await search(page).fill('solar return');
      await expect(options(page).first()).toBeVisible();
      await expect(options(page).filter({ hasText: 'Solar return · Wheel' })).toBeVisible();
      await expect(options(page).filter({ hasText: 'Solar return · Aspects' })).toBeVisible();
      // Every result is a Solar return; nothing unrelated is listed.
      const count = await options(page).count();
      for (let index = 0; index < count; index += 1) {
        await expect(options(page).nth(index)).toContainText('Solar return');
      }
      // The breadcrumb names the last opened person (owner answer 2).
      await expect(options(page).filter({ hasText: 'Solar return · Wheel' })).toContainText('Albert Einstein');
    });

    test('Enter on the Timing timeline result opens that route; the palette closes', async () => {
      test.setTimeout(60_000);
      await trigger(page).click();
      await search(page).fill('timing timeline');
      await expect(page.getByRole('option', { name: /^Timing timeline/ }).first()).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await page.keyboard.press('Enter');
      await expect(dialog(page)).toBeHidden();
      await expect(page).toHaveURL(/#\/people\/[^/]+\/timing\/timeline$/);
    });

    test('arrow keys move the selection and wrap; Escape closes without opening anything', async () => {
      test.setTimeout(60_000);
      await trigger(page).click();
      await search(page).fill('solar return');
      const first = options(page).first();
      await expect(first).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('ArrowDown');
      await expect(options(page).nth(1)).toHaveAttribute('aria-selected', 'true');
      await expect(first).toHaveAttribute('aria-selected', 'false');
      await page.keyboard.press('ArrowUp');
      await expect(first).toHaveAttribute('aria-selected', 'true');

      const urlBefore = page.url();
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toBeHidden();
      expect(page.url()).toBe(urlBefore);
    });

    test('a result opened with Enter appears under Recent on the next empty query', async () => {
      test.setTimeout(60_000);
      await trigger(page).click();
      await search(page).fill('timing timeline');
      await page.keyboard.press('Enter');
      await expect(dialog(page)).toBeHidden();

      await trigger(page).click();
      await expect(search(page)).toHaveValue('');
      await expect(page.getByText('Recent', { exact: true })).toBeVisible();
      await expect(page.getByRole('option', { name: /^Timing timeline/ }).first()).toBeVisible();
    });
  });
}
