/**
 * Overlay settings is a modal drawer (#1080): on a 390x844 phone, focus stays inside it while Tab is pressed, and every
 * way out (Escape, Cancel, Close, Apply) returns focus to the Chart actions toggle the drawer was opened from.
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

// A fresh context per test, holding the shared people (#799).
test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test('Overlay settings is modal on a phone: focus stays inside and returns to Chart actions on every close (#1080)', async () => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'Charts', exact: true }).click();
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  const chartActions = page.getByRole('button', { name: 'Chart actions', exact: true });
  const trigger = page.locator('.chart-overlay-settings button.chart-overlay-trigger');
  const dialog = page.locator('.chart-overlay-settings dialog');
  const focusInside = (): Promise<boolean> =>
    page.evaluate<boolean>(
      "(() => { const d = document.querySelector('.chart-overlay-settings dialog'); const a = document.activeElement; return d !== null && a !== null && a !== d && d.contains(a); })()",
    );

  for (const closer of ['Escape', 'Cancel', 'Close', 'Apply'] as const) {
    await chartActions.click();
    await trigger.click();
    await expect(dialog).toBeVisible();
    expect(
      await page.evaluate<boolean>("document.querySelector('.chart-overlay-settings dialog').matches(':modal')"),
    ).toBe(true);

    // Tab and Shift+Tab many times: focus never leaves the drawer.
    for (let step = 0; step < 30; step += 1) {
      await page.keyboard.press('Tab');
      expect(await focusInside()).toBe(true);
    }
    for (let step = 0; step < 30; step += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusInside()).toBe(true);
    }

    if (closer === 'Escape') {
      await page.keyboard.press('Escape');
    } else if (closer === 'Cancel') {
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    } else if (closer === 'Close') {
      await dialog.getByRole('button', { name: 'Close without applying', exact: true }).click();
    } else {
      await dialog.getByRole('checkbox', { name: 'Transit ring', exact: true }).check();
      await dialog.getByLabel('Transit date', { exact: true }).fill('2025-01-01');
      await dialog.getByRole('button', { name: 'Apply overlays', exact: true }).click();
    }
    await expect(dialog).toBeHidden();
    // The trigger is hidden at this width, so focus goes to the Chart actions toggle that opened it.
    await expect(chartActions).toBeFocused();
  }
});
