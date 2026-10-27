/**
 * One person to and from a file on the birth-record page (#699): each export downloads, and an AAF import replaces
 * another person's birth data after a preview, keeping their name. The page's card layout (#795): two columns at
 * 1280px and one column at 390px, with the resolved timezone card above Notes and Save changes.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { BORN, EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';

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

test.describe('with the shared people (#799)', () => {
  let context: BrowserContext;
  let page: Page;

  // A fresh context per test, holding the shared people (#799); what a test edits stays in that context.
  test.beforeEach(async ({ browser }) => {
    context = await newSeededContext(browser, baseUrl);
    page = await context.newPage();
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('exports a person three ways, and replaces another person’s birth data from the AAF after a preview', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('link', { name: 'Birth record', exact: true }).click();
    const section = page.locator('section.person-file-actions');
    await expect(section.getByRole('heading', { name: 'Export or import this person' })).toBeVisible();

    const download = async (button: string) => {
      const [file] = await Promise.all([
        page.waitForEvent('download'),
        section.getByRole('button', { name: button }).click(),
      ]);
      return file;
    };
    const aaf = await download('Download AAF');
    expect(aaf.suggestedFilename()).toBe('albert-einstein-birth-record.aaf');
    const aafPath = join(dir, 'einstein.aaf');
    await aaf.saveAs(aafPath);
    expect((await download('Download CSV')).suggestedFilename()).toBe('albert-einstein-birth-record.csv');
    expect((await download('Download Astraya JSON')).suggestedFilename()).toBe('albert-einstein-birth-record.json');

    await openSharedPerson(page, baseUrl, BORN);
    await page.getByRole('link', { name: 'Birth record', exact: true }).click();
    await section.locator('input[type="file"]').setInputFiles(aafPath);

    // Nothing is saved before the reader confirms: the preview names each change.
    await expect(section.getByRole('heading', { name: 'What changes' })).toBeVisible();
    await expect(section.locator('dd', { hasText: '1882-12-11 → 1879-03-14' })).toBeVisible();
    await section.getByRole('button', { name: 'Replace birth data' }).click();
    await expect(section.getByText('Birth data replaced.')).toBeVisible();

    // The form now shows Einstein's birth date under Born's name.
    await expect(page.getByLabel('Date', { exact: true })).toHaveValue(EINSTEIN.date);
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(BORN.name);
  });

  test('lays the birth record out as two columns of cards at 1280px and one column at 390px (#795)', async () => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('link', { name: 'Birth record', exact: true }).click();
    const card = (name: string) => page.locator(`section.birth-record-card--${name}`);
    const box = async (name: string) => {
      const found = await card(name).boundingBox();
      if (found === null) throw new Error(`${name} card not laid out`);
      return found;
    };
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(card('timezone').locator('.birth-record-raw')).toBeVisible();
    await expect(page.locator('.sticky-actions')).toHaveCount(0);
    await expect(card('notes').locator('textarea, button').last()).toHaveText('Save');

    // Desktop: the form cards on the left, the timezone, files and danger cards on the right.
    const [identity, location, notes, timezone, files, danger] = await Promise.all(
      ['identity', 'location', 'notes', 'timezone', 'files', 'danger'].map(box),
    );
    if (!identity || !location || !notes || !timezone || !files || !danger) throw new Error('missing card');
    for (const left of [location, notes]) expect(Math.abs(left.x - identity.x)).toBeLessThan(1);
    for (const right of [files, danger]) expect(Math.abs(right.x - timezone.x)).toBeLessThan(1);
    expect(timezone.x).toBeGreaterThan(identity.x + identity.width);
    expect(identity.width).toBeGreaterThan(timezone.width);
    expect(location.y).toBeGreaterThan(identity.y);
    expect(notes.y).toBeGreaterThan(location.y);
    // Date, how the time is known, and the time share one row.
    const tops = await Promise.all(
      ['input[type="date"]', 'select', 'input[type="time"]'].map(async (selector) => {
        const found = await card('identity').locator(selector).boundingBox();
        return found?.y ?? Number.NaN;
      }),
    );
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);

    // Narrow: one column, and the resolved timezone comes before Save changes.
    await page.setViewportSize({ width: 390, height: 844 });
    const [narrowIdentity, narrowTimezone, narrowNotes] = await Promise.all(['identity', 'timezone', 'notes'].map(box));
    if (!narrowIdentity || !narrowTimezone || !narrowNotes) throw new Error('missing card');
    expect(Math.abs(narrowTimezone.x - narrowIdentity.x)).toBeLessThan(1);
    const saveBox = await save.boundingBox();
    if (saveBox === null) throw new Error('save not laid out');
    expect(narrowTimezone.y + narrowTimezone.height).toBeLessThanOrEqual(saveBox.y);
    // Nothing pushes the page sideways: every card ends inside the viewport.
    expect(narrowNotes.x + narrowNotes.width).toBeLessThanOrEqual(390);
    expect(narrowTimezone.x + narrowTimezone.width).toBeLessThanOrEqual(390);
  });
});
