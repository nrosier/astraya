/**
 * Goal-based first use (#1060): with nobody stored, People says what to do next and offers a way in for someone who
 * already holds data; a complete, saved birth record says what to do next. The first-use state comes from the stored
 * people, never from a flag, so it goes away once a person exists.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { gotoAndSettle } from './support.ts';

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

test('with nobody stored, People offers the next step and an import that leads to the restore on Preferences', async ({
  page,
}) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await expect(page.getByText('Nobody yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add a person' })).toBeVisible();

  await page.getByRole('link', { name: 'Import data', exact: true }).click();
  await expect(page).toHaveURL(/#\/preferences\/data$/);
  await expect(page.getByText(/Restore people from a full export/)).toBeVisible();
});

test('once a person exists the first-use state is gone, and their saved birth record says what to do next', async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await expect(page.getByText('Nobody yet.', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Import data', exact: true })).toHaveCount(0);

  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Birth record', exact: true }).first().click();
  await expect(page.getByText('The birth record is complete. Next:')).toBeVisible();
  await page.getByRole('link', { name: 'open the natal chart.' }).click();
  await expect(page).toHaveURL(/\/charts\/natal/);
  await context.close();
});
