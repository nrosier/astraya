/**
 * Custom formula-point workflow (#566/#573, moved to the Extended settings drawer in #815): a persisted safe formula becomes a chart position,
 * can be disabled or removed, and rejects redundant built-in points before save.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { applySettings, openNatalChart, openSettings } from './support.ts';

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

// A fresh context per test, holding the shared people (#799).
test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test('a custom formula point is rendered, hidden, and removed from the natal chart through the drawer (#573, #815)', async () => {
  test.setTimeout(90_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openNatalChart(page);

  // The inline editor is gone from every chart view: the formulas live in the Extended settings drawer only.
  await expect(page.getByRole('region', { name: 'Custom formula points' })).toHaveCount(0);

  const card = page.locator('dialog.settings-card');
  const formulaSection = card.locator('fieldset.settings-card-group', { hasText: 'Custom formula points' });

  await openSettings(page, 'Bodies & orbs');
  await formulaSection.getByLabel('Name', { exact: true }).fill('Sun plus Moon');
  await formulaSection.getByLabel('Formula', { exact: true }).fill('sun + moon');
  await formulaSection.getByRole('button', { name: 'Add formula point', exact: true }).click();
  await applySettings(page);

  const customGlyph = page.locator('g.chart-body-stack[data-body="Sun plus Moon"]');
  await expect(customGlyph).toBeVisible();
  await customGlyph.click();
  await expect(page.locator('.selection-inspector')).toContainText('Sun plus Moon');

  await page.getByRole('link', { name: 'Placements', exact: true }).click();
  await expect(page.getByRole('table').filter({ hasText: 'Sun plus Moon' })).toBeVisible();

  // A point can be kept but not drawn.
  await openSettings(page, 'Bodies & orbs');
  // The saved-list toggle is a radiogroup labelled with the point's name; the add-row toggle is not.
  await formulaSection
    .getByRole('radiogroup', { name: 'Point mode: Sun plus Moon' })
    .getByRole('radio', { name: 'Saved, not drawn' })
    .check();
  await applySettings(page);
  await expect(page.getByRole('table').filter({ hasText: 'Sun plus Moon' })).toHaveCount(0);

  // A formula that repeats a built-in point is refused.
  await openSettings(page, 'Bodies & orbs');
  await formulaSection.getByLabel('Name', { exact: true }).fill('Duplicate Sun');
  await formulaSection.getByLabel('Formula', { exact: true }).fill('sun');
  await formulaSection.getByRole('button', { name: 'Add formula point', exact: true }).click();
  await expect(formulaSection.getByText(/duplicates the built-in sun point/)).toBeVisible();

  await formulaSection.getByRole('button', { name: 'Remove Sun plus Moon', exact: true }).click();
  await applySettings(page);
  await openSettings(page, 'Bodies & orbs');
  await expect(formulaSection.getByText('No custom formula points yet.')).toBeVisible();
});
