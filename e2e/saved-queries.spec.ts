/**
 * Saved event-search queries (#1061): a reader names the Event search form's parameters and saves them, reloads, and
 * reopens the query into the form; deletes it and undoes the delete; and erases one permanently. Real server, real
 * browser storage, signed out (the op-log works without an account).
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

test('save, reload, reopen, delete with Undo, and erase a saved event-search query (#1061)', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await openTool(page, 'Ephemeris research');
  await expect(page.getByRole('heading', { level: 2, name: 'Saved queries' })).toBeVisible();
  await expect(page.getByText('No saved queries yet.', { exact: false })).toBeVisible();

  // Save the form as it stands after changing the range and one filter.
  await page.getByLabel('From', { exact: true }).fill('2027-03-01');
  await page.getByLabel('To', { exact: true }).fill('2027-09-30');
  await page.getByLabel('Station body', { exact: true }).selectOption('mars');
  await page.getByLabel('Query name', { exact: true }).fill('Mars stations 2027');
  await page.getByRole('button', { name: 'Save query', exact: true }).click();
  await expect(page.getByText('Saved “Mars stations 2027”.')).toBeVisible();
  await expect(page.getByLabel('Query name', { exact: true })).toHaveValue('');
  await expect(page.locator('.saved-query-list .name', { hasText: 'Mars stations 2027' })).toBeVisible();
  await expect(page.getByText('2027-03-01 to 2027-09-30 (UTC)', { exact: false })).toBeVisible();

  // Reload: the query is still there, and the form is back at its defaults.
  await reloadAndSettle(page);
  await expect(page.locator('.saved-query-list .name', { hasText: 'Mars stations 2027' })).toBeVisible();
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('2026-01-01');

  // Reopen: the form is restored, and no search ran.
  await page.getByRole('button', { name: 'Open Mars stations 2027', exact: true }).click();
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('2027-03-01');
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('2027-09-30');
  await expect(page.getByLabel('Station body', { exact: true })).toHaveValue('mars');
  await expect(page.getByText(/events found/)).toHaveCount(0);

  // Delete, then Undo from the confirmation line.
  await page.getByRole('button', { name: 'Delete Mars stations 2027', exact: true }).click();
  await expect(page.getByText('Deleted “Mars stations 2027”.')).toBeVisible();
  await expect(page.locator('.saved-query-list .name', { hasText: 'Mars stations 2027' })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 3, name: 'Deleted queries' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Deleted queries' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open Mars stations 2027', exact: true })).toBeVisible();

  // Delete again, reload, and Undo from the Deleted list: the delete survived the reload.
  await page.getByRole('button', { name: 'Delete Mars stations 2027', exact: true }).click();
  // The confirmation appears only once the write is durable, so waiting for it makes the reload deterministic.
  await expect(page.getByText('Deleted “Mars stations 2027”.')).toBeVisible();
  await reloadAndSettle(page);
  await expect(page.getByRole('button', { name: 'Open Mars stations 2027', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo delete of Mars stations 2027', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Mars stations 2027', exact: true })).toBeVisible();

  // Erase permanently: confirmed, then gone from both lists and after a reload.
  await page.getByRole('button', { name: 'Delete Mars stations 2027', exact: true }).click();
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('Mars stations 2027');
    void dialog.accept();
  });
  await page.getByRole('button', { name: 'Erase Mars stations 2027 permanently', exact: true }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Deleted queries' })).toHaveCount(0);
  await reloadAndSettle(page);
  await expect(page.locator('.saved-query-list')).toHaveCount(0);
  await expect(page.getByText('No saved queries yet.', { exact: false })).toBeVisible();
});

test('an over-long name is refused before it is saved (#1061)', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await openTool(page, 'Ephemeris research');
  await page.getByLabel('Query name', { exact: true }).fill('x'.repeat(501));
  await expect(page.getByText('The name is longer than 500 characters.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save query', exact: true })).toBeDisabled();
  await page.getByLabel('Query name', { exact: true }).fill('x'.repeat(500));
  await expect(page.getByRole('button', { name: 'Save query', exact: true })).toBeEnabled();
});
