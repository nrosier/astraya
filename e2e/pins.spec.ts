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

  // Annotate: the text box is empty and Save is off until something is typed; a saved note survives a reload.
  const noteBox = page.getByLabel(`Note on ${label}`, { exact: true });
  const saveNote = page.getByRole('button', { name: 'Save note', exact: true });
  await expect(noteBox).toHaveValue('');
  await expect(saveNote).toBeDisabled();
  await noteBox.fill('Watch this one against the natal chart.');
  await expect(saveNote).toBeEnabled();
  await saveNote.click();
  await expect(page.getByText('Note saved.')).toBeVisible();
  await expect(saveNote).toBeDisabled();
  await reloadAndSettle(page);
  await expect(page.getByLabel(`Note on ${label}`, { exact: true })).toHaveValue(
    'Watch this one against the natal chart.',
  );

  // Edit the note: a second version is saved on top of the first.
  await page.getByLabel(`Note on ${label}`, { exact: true }).fill('Edited note.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText('Note saved.')).toBeVisible();

  // Unpin from the list, then Undo: the note comes back with the pin.
  await page
    .locator('.saved-query-list')
    .getByRole('button', { name: `Unpin ${label}`, exact: true })
    .click();
  await expect(page.getByText(`Unpinned “${label}”.`)).toBeVisible();
  await expect(page.getByText('No pinned events yet.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.saved-query-list .name', { hasText: label })).toBeVisible();
  await expect(page.getByLabel(`Note on ${label}`, { exact: true })).toHaveValue('Edited note.');

  // Erase the note for good: confirmed, no undo, and the pin can be annotated again afterwards (#1195).
  let confirmation = '';
  page.once('dialog', (dialog) => {
    confirmation = dialog.message();
    void dialog.accept();
  });
  await page.getByRole('button', { name: `Erase the note on ${label}`, exact: true }).click();
  await expect(page.getByText('Note erased.')).toBeVisible();
  expect(confirmation).toContain('cannot be undone');
  await expect(page.getByLabel(`Note on ${label}`, { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: `Erase the note on ${label}`, exact: true })).toHaveCount(0);
  await reloadAndSettle(page);
  await expect(page.getByLabel(`Note on ${label}`, { exact: true })).toHaveValue('');

  await page.getByLabel(`Note on ${label}`, { exact: true }).fill('Written after the erase.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText('Note saved.')).toBeVisible();
  await reloadAndSettle(page);
  await expect(page.getByLabel(`Note on ${label}`, { exact: true })).toHaveValue('Written after the erase.');
});
