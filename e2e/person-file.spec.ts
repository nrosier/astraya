/**
 * One person to and from a file on the birth-record page (#699): each export downloads, and an AAF import replaces
 * another person's birth data after a preview, keeping their name.
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
});
