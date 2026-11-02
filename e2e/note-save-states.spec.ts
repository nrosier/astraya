/**
 * Note autosave states (#919): the Birth Record notes card and the Consultation notes card save through the
 * op-log on their own. Typing shows Saving..., then Autosaved; with the browser offline the line reads Saved on
 * this device; leaving the page flushes an edit that has not waited out the 750 ms debounce; an over-limit note
 * shows the error and keeps its text; and the page Save button never reacts to a notes edit (owner decision,
 * 2026-11-02). English and Dutch.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { setLanguage } from './support.ts';
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

// A fresh context per test: these tests write notes, and each starts from the seeded people.
test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

const BIRTH_LINE = '.birth-record-card--notes .note-save-status';
const CONSULTATION_LINE = '.consultation-notes-head .note-save-status';

test('birth record notes: Saving then Autosaved, the page Save never reacts, and a reload keeps the note (#919)', async () => {
  test.setTimeout(60_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Birth record', exact: true }).click();

  const save = page.locator('.birth-record-save button');
  await expect(save).toBeDisabled();

  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Birth certificate seen.');
  await expect(page.locator(BIRTH_LINE).getByText('Saving…', { exact: true })).toBeVisible();
  await expect(page.locator(BIRTH_LINE).getByText('Autosaved', { exact: true })).toBeVisible();

  // Notes never drive the page Save or the status dot (owner decision, 2026-11-02).
  await expect(save).toBeDisabled();
  await expect(page.getByLabel('Status: Saved on this device', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('Birth certificate seen.');
});

test('birth record notes: offline reads Saved on this device (#919)', async () => {
  test.setTimeout(60_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Birth record', exact: true }).click();

  await context.setOffline(true);
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Written offline.');
  await expect(page.locator(BIRTH_LINE).getByText('Saved on this device', { exact: true })).toBeVisible();
  await context.setOffline(false);
});

test('birth record notes: leaving the page flushes an edit that has not waited out the debounce (#919)', async () => {
  test.setTimeout(60_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Birth record', exact: true }).click();

  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Flushed on navigation.');
  // Leave at once, well inside the 750 ms debounce.
  await page.getByRole('link', { name: 'Consultation', exact: true }).click();
  await page.getByRole('link', { name: 'Birth record', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('Flushed on navigation.');
});

test('birth record notes: an over-limit note shows the error and keeps the text (#919)', async () => {
  test.setTimeout(60_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Birth record', exact: true }).click();

  const notes = page.getByRole('textbox', { name: 'Notes', exact: true });
  const tooLong = 'x'.repeat(50_001);
  await notes.fill(tooLong);
  await expect(page.getByRole('alert').filter({ hasText: '50,000 characters' })).toBeVisible();
  await expect(notes).toHaveValue(tooLong);
});

test('consultation notes: Saving then Autosaved, a note persists, and delete asks first (#919)', async () => {
  test.setTimeout(60_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Consultation', exact: true }).click();

  await page.getByRole('button', { name: 'Show notes', exact: true }).click();
  await page.getByRole('textbox', { name: 'Note text' }).fill('Confirm the birth time source.');
  await expect(page.locator(CONSULTATION_LINE).getByText('Saving…', { exact: true })).toBeVisible();
  await expect(page.locator(CONSULTATION_LINE).getByText('Autosaved', { exact: true })).toBeVisible();
  await expect(page.getByText('1 note', { exact: true })).toBeVisible();

  // Notes are edited in place: no Save, Edit or Add button.
  await expect(page.getByRole('button', { name: /^(Save|Edit|Add note)$/ })).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: 'Show notes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note text' }).first()).toHaveValue('Confirm the birth time source.');

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Delete this note?' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete note', exact: true }).click();
  await expect(page.getByText('0 notes', { exact: true })).toBeVisible();
});

test('consultation notes: offline reads Saved on this device, and leaving flushes (#919)', async () => {
  test.setTimeout(60_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Consultation', exact: true }).click();
  await page.getByRole('button', { name: 'Show notes', exact: true }).click();

  await context.setOffline(true);
  await page.getByRole('textbox', { name: 'Note text' }).fill('Offline note.');
  await expect(page.locator(CONSULTATION_LINE).getByText('Saved on this device', { exact: true })).toBeVisible();
  await context.setOffline(false);

  // Edit the saved note, then leave inside the debounce.
  await page.getByRole('textbox', { name: 'Note text' }).first().fill('Offline note, edited.');
  await page.getByRole('link', { name: 'Birth record', exact: true }).click();
  await page.getByRole('link', { name: 'Consultation', exact: true }).click();
  await page.getByRole('button', { name: 'Show notes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note text' }).first()).toHaveValue('Offline note, edited.');
});

test('the save states read in Dutch (#919)', async () => {
  test.setTimeout(60_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await setLanguage(page, 'NL');
  await page.getByRole('link', { name: 'Geboortegegevens', exact: true }).click();

  await page.getByRole('textbox', { name: 'Notities', exact: true }).fill('Geboorteakte ingezien.');
  await expect(page.locator(BIRTH_LINE).getByText('Opslaan…', { exact: true })).toBeVisible();
  await expect(page.locator(BIRTH_LINE).getByText('Automatisch opgeslagen', { exact: true })).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('textbox', { name: 'Notities', exact: true }).fill('Geboorteakte ingezien, offline.');
  await expect(page.locator(BIRTH_LINE).getByText('Opgeslagen op dit apparaat', { exact: true })).toBeVisible();
  await context.setOffline(false);
});
