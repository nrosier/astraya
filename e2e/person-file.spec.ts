/**
 * One person to and from a file on the birth-record page (#699): each export downloads, and an AAF import replaces
 * another person's birth data after a preview, keeping their name.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { createPerson, gotoAndSettle } from './support.ts';

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

test('exports a person three ways, and replaces another person’s birth data from the AAF after a preview', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
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
  expect(aaf.suggestedFilename()).toBe('ada-lovelace-birth-record.aaf');
  const aafPath = join(dir, 'ada.aaf');
  await aaf.saveAs(aafPath);
  expect((await download('Download CSV')).suggestedFilename()).toBe('ada-lovelace-birth-record.csv');
  expect((await download('Download Astraya JSON')).suggestedFilename()).toBe('ada-lovelace-birth-record.json');

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Jo Example',
    date: '1990-06-15',
    time: '14:30:00',
    latitude: '52.37',
    longitude: '4.90',
  });
  await page.getByRole('link', { name: 'Birth record', exact: true }).click();
  await section.locator('input[type="file"]').setInputFiles(aafPath);

  // Nothing is saved before the reader confirms: the preview names each change.
  await expect(section.getByRole('heading', { name: 'What changes' })).toBeVisible();
  await expect(section.locator('dd', { hasText: '1990-06-15 → 1815-12-10' })).toBeVisible();
  await section.getByRole('button', { name: 'Replace birth data' }).click();
  await expect(section.getByText('Birth data replaced.')).toBeVisible();

  // The form now shows Ada's birth date under Jo's name.
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('1815-12-10');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Jo Example');
});
