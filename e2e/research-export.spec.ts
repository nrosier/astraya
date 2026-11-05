/**
 * Saved queries, pins and annotations in the full export and restore (#1194): a reader saves a query, pins an event and
 * writes a note, exports everything, and restores the file into a second, empty browser profile, where they all appear.
 * Restoring the same file again changes nothing. Real server, real browser storage, signed out.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { gotoAndSettle, openTool } from './support.ts';

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

test('export everything, then restore into an empty profile (#1194)', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await openTool(page, 'Ephemeris research');

  // A saved query.
  await page.getByLabel('Query name', { exact: true }).fill('Round trip query');
  await page.getByRole('button', { name: 'Save query', exact: true }).click();
  await expect(page.getByText('Saved “Round trip query”.')).toBeVisible();

  // A pinned event with a note.
  await page.getByLabel('From', { exact: true }).fill('2027-03-01');
  await page.getByLabel('To', { exact: true }).fill('2027-04-30');
  await page.getByRole('button', { name: 'Search events', exact: true }).click();
  await expect(page.getByText(/events found/)).toBeVisible({ timeout: 90_000 });
  const pinButtons = page.getByRole('button', { name: /^Pin /, pressed: false });
  const label = (await pinButtons.first().getAttribute('aria-label'))?.replace(/^Pin /, '') ?? '';
  expect(label).not.toBe('');
  await pinButtons.first().click();
  await page.getByLabel(`Note on ${label}`, { exact: true }).fill('Carried through the export.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText('Note saved.')).toBeVisible();

  // Export everything.
  await gotoAndSettle(page, `${baseUrl}/#/preferences/data`);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON (Full)', exact: true }).click(),
  ]);
  const file = await download.path();
  const archive = JSON.parse(readFileSync(file, 'utf8')) as {
    version: number;
    research?: {
      savedQueries: { name: string }[];
      pins: { target: { label: string }; annotation?: { revisions: { text: string }[] } }[];
    };
  };
  expect(archive.version).toBe(4);
  expect(archive.research?.savedQueries.map((query) => query.name)).toEqual(['Round trip query']);
  expect(archive.research?.pins).toHaveLength(1);
  expect(archive.research?.pins[0]?.target.label).toBe(label);
  expect(archive.research?.pins[0]?.annotation?.revisions.map((revision) => revision.text)).toEqual([
    'Carried through the export.',
  ]);

  // A second, empty profile restores the file.
  const context = await browser.newContext();
  const other = await context.newPage();
  await gotoAndSettle(other, `${baseUrl}/#/preferences/data`);
  const chooser = other.waitForEvent('filechooser');
  await other.getByRole('button', { name: 'Restore from File...', exact: true }).click();
  await (await chooser).setFiles(file);
  await expect(
    other.getByText(/Research: 1 new saved query, 1 new pin, 1 new note version; 0 already here/),
  ).toBeVisible();
  other.once('dialog', (dialog) => void dialog.accept());
  await other.getByRole('button', { name: 'Apply restore', exact: true }).click();
  await expect(other.getByText(/Added 1 saved query, 1 pin and 1 note version\./)).toBeVisible();

  await openTool(other, 'Ephemeris research');
  await expect(other.locator('.saved-query-list .name', { hasText: 'Round trip query' })).toBeVisible();
  await expect(other.locator('.saved-query-list .name', { hasText: label })).toBeVisible();
  await expect(other.getByLabel(`Note on ${label}`, { exact: true })).toHaveValue('Carried through the export.');

  // The same file again adds nothing.
  await gotoAndSettle(other, `${baseUrl}/#/preferences/data`);
  const again = other.waitForEvent('filechooser');
  await other.getByRole('button', { name: 'Restore from File...', exact: true }).click();
  await (await again).setFiles(file);
  await expect(
    other.getByText(/Research: 0 new saved queries, 0 new pins, 0 new note versions; 2 already here/),
  ).toBeVisible();
  await context.close();
});
