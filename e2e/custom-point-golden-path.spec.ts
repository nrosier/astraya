/**
 * Custom formula-point workflow (#566/#573): a persisted safe formula becomes a chart position,
 * can be disabled or removed, and rejects redundant built-in points before save.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { createPerson, gotoAndSettle, openNatalChart } from './support.ts';

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

test('a custom formula point is rendered, disabled, and removed from the natal chart (#573)', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openNatalChart(page);

  const editor = page.getByRole('region', { name: 'Custom formula points' });
  await editor.getByLabel('Point name', { exact: true }).fill('Sun plus Moon');
  await editor.getByLabel('Formula', { exact: true }).fill('sun + moon');
  await editor.getByRole('button', { name: 'Add formula point', exact: true }).click();
  await expect(editor.getByText('Sun plus Moon', { exact: true })).toBeVisible();
  const customGlyph = page.locator('g.chart-body-stack[data-body="Sun plus Moon"]');
  await expect(customGlyph).toBeVisible();
  await customGlyph.click();
  await expect(page.locator('.selection-inspector')).toContainText('Sun plus Moon');

  await page.getByRole('link', { name: 'Placements', exact: true }).click();
  await expect(page.getByRole('table').filter({ hasText: 'Sun plus Moon' })).toBeVisible();

  await editor.getByRole('button', { name: 'Edit Sun plus Moon', exact: true }).click();
  await editor.getByRole('checkbox', { name: 'Show and aspect this point', exact: true }).uncheck();
  await editor.getByRole('button', { name: 'Save formula point', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Add formula point', exact: true })).toBeDisabled();

  await editor.getByLabel('Point name', { exact: true }).fill('Duplicate Sun');
  await editor.getByLabel('Formula', { exact: true }).fill('sun');
  await editor.getByRole('button', { name: 'Add formula point', exact: true }).click();
  await expect(editor.getByText(/duplicates the built-in sun point/)).toBeVisible();

  await editor.getByRole('button', { name: 'Remove Sun plus Moon', exact: true }).click();
  await expect(editor.getByText('No custom formula points yet.')).toBeVisible();
});
