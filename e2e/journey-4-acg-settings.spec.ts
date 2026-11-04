/**
 * Journey 4 of the final acceptance list (#514): "Configure and cancel Astrocartography settings, then apply
 * several settings in one pass." Everything goes through the one staged "Map settings" dialog on Einstein's
 * shared Astrocartography map.
 *
 * Step -> box text:
 *   1. Configure -> open Map settings, uncheck MC and tick Local Space in the draft.
 *   2. Cancel    -> Cancel, Escape and the close button each discard the draft: the map markup and the basis
 *                   line are unchanged and focus returns to the trigger.
 *   3. Apply several in one pass -> reopen, uncheck MC and IC, turn Local Space on, add Uranus, press Apply once:
 *                   the basis line names all of it, MC lines are gone, Local Space lines appear, and the map
 *                   was replaced exactly once (one recalculation, never emptied in between).
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

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

// A fresh context per test, holding the shared people; map settings are never saved on a person.
test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

test('map settings can be configured and cancelled without effect, then applied together in one pass', async () => {
  test.setTimeout(120_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Astrocartography', exact: true }).click();
  const map = page.locator('div.acg-map');
  await expect(map.locator('svg')).toBeVisible();
  const basis = page.locator('.map-basis');
  await expect(basis).toContainText('4 line types · 7 bodies · Local Space off');
  const trigger = page.getByRole('button', { name: /^Map settings/ });
  const dialog = page.getByRole('dialog', { name: 'Map settings' });
  const mcLines = map.locator('.acg-line-mc');
  // MC lines are vertical, so their box has no width and Playwright calls them hidden: assert they are drawn.
  await expect(mcLines).not.toHaveCount(0);
  const markup = await map.innerHTML();

  // 1 + 2. Configure, then cancel three ways: nothing reaches the map.
  for (const close of ['cancel', 'escape', 'close'] as const) {
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('MC (Midheaven)')).toBeChecked();
    await dialog.getByLabel('MC (Midheaven)').uncheck();
    await dialog.getByLabel('Show Local Space lines for the checked bodies').check();
    if (close === 'cancel') await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    else if (close === 'escape') await page.keyboard.press('Escape');
    else await dialog.getByRole('button', { name: 'Close without applying' }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(basis).toContainText('4 line types · 7 bodies · Local Space off');
    expect(await map.innerHTML()).toBe(markup);
  }
  await expect(mcLines).not.toHaveCount(0);

  // 3. Apply several settings in one pass: a single recalculation that swaps the map once.
  await page.evaluate(`(() => {
    window.__acgReplacements = 0;
    const map = document.querySelector('div.acg-map');
    new MutationObserver((records) => {
      for (const record of records) if (record.type === 'childList') window.__acgReplacements += 1;
    }).observe(map, { childList: true });
  })()`);
  await trigger.click();
  await dialog.getByLabel('MC (Midheaven)').uncheck();
  await dialog.getByLabel('IC (Nadir)').uncheck();
  await dialog.getByLabel('Show Local Space lines for the checked bodies').check();
  await dialog.getByLabel('Uranus').check();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(basis).toContainText('2 line types · 8 bodies · Local Space on');
  await expect(mcLines).toHaveCount(0);
  await expect(map.locator('.acg-line-local-space').first()).toBeVisible();
  await expect(map).not.toHaveAttribute('aria-busy', 'true');
  expect(await page.evaluate('window.__acgReplacements')).toBe(1);
});
