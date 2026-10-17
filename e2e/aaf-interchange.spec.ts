/**
 * AAF birth-record exchange on Preferences (#591): export people as an .aaf file, and import an AAF file made by
 * another program through the same reviewed, confirm-first restore as a full export. Real server and store.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
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

test('exports people as AAF records that follow the specification’s #A93 and #B93 forms', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5',
    longitude: '-0.125',
  });

  await gotoAndSettle(page, `${baseUrl}/#/preferences/data`);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export people (AAF)', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^astraya-people-\d{4}-\d{2}-\d{2}\.aaf$/);
  const path = await download.path();
  const text = readFileSync(path, 'utf8');
  expect(text).toMatch(/^#A93:Ada Lovelace,\*,\*,10\.12\.1815,07:45,[^,]*,\*$/m);
  expect(text).toMatch(/^#B93:\*,51n30,0w07:30,/m);
  await expect(page.getByText(/the people list as AAF exported/)).toBeVisible();
});

test('imports an AAF file from another program as a reviewed restore, and adds the person only on confirm', async ({
  page,
}) => {
  test.setTimeout(90_000);
  // The specification's own example record (section 2).
  const file = join(dir, 'other-program.aaf');
  writeFileSync(file, '#A93:Ferber,Tobias,m,27.9.1970,11:04,Kandel/Pfalz,D\n#B93:*,49n05,8e11,1he,0\n#ZNAM:CET\n');

  await gotoAndSettle(page, `${baseUrl}/#/preferences/data`);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore from file…', exact: true }).click();
  await (await chooser).setFiles(file);

  await expect(page.getByRole('cell', { name: 'Tobias Ferber', exact: true })).toBeVisible();
  // The preview table is the new UI here; check it, and that the check really covered it.
  const previewTable = page.getByRole('table').filter({ has: page.getByRole('cell', { name: 'Tobias Ferber' }) });
  await expect(previewTable).toHaveCount(1);
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.passes.length).toBeGreaterThan(0);
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Apply restore', exact: true }).click();
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await expect(page.getByText('Tobias Ferber')).toBeVisible();
});
