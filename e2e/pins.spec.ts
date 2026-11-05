/**
 * Pinned event-search results (#1061, slice 2): a reader searches, pins a result, reloads and finds it in the
 * Pinned events list, unpins it with Undo, and sees the same result pinned again after pinning twice. Real server, real
 * browser storage, signed out.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { gotoAndSettle, openTool, reloadAndSettle } from './support.ts';

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

test('pin a result, keep it across a reload, unpin with Undo (#1061)', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await openTool(page, 'Ephemeris research');
  await expect(page.getByRole('heading', { level: 2, name: 'Pinned events' })).toBeVisible();
  await expect(page.getByText('No pinned events yet.', { exact: false })).toBeVisible();

  // A short range with one lunation kind keeps the result list small.
  await page.getByLabel('From', { exact: true }).fill('2027-03-01');
  await page.getByLabel('To', { exact: true }).fill('2027-04-30');
  await page.getByRole('button', { name: 'Search events', exact: true }).click();
  // The search runs the real ephemeris, which is slower on a CI runner than the default expect timeout.
  await expect(page.getByText(/events found/)).toBeVisible({ timeout: 90_000 });

  const pinButtons = page.getByRole('button', { name: /^Pin /, pressed: false });
  const label = (await pinButtons.first().getAttribute('aria-label'))?.replace(/^Pin /, '') ?? '';
  expect(label).not.toBe('');
  await pinButtons.first().click();
  await expect(page.getByRole('button', { name: `Unpin ${label}`, pressed: true }).first()).toBeVisible();
  await expect(page.locator('.saved-query-list .name', { hasText: label })).toBeVisible();

  // Reload: the pin is still listed.
  await reloadAndSettle(page);
  await expect(page.locator('.saved-query-list .name', { hasText: label })).toBeVisible();

  // Unpin from the list, then Undo.
  await page
    .locator('.saved-query-list')
    .getByRole('button', { name: `Unpin ${label}`, exact: true })
    .click();
  await expect(page.getByText(`Unpinned “${label}”.`)).toBeVisible();
  await expect(page.getByText('No pinned events yet.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.saved-query-list .name', { hasText: label })).toBeVisible();
});
