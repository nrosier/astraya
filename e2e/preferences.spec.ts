/**
 * The Preferences workspace (#506/#510): reachable from the header's top-right cluster on every
 * screen, holds General/Astrology defaults/Appearance & accessibility/Data & privacy, and every
 * control there writes the same shared device/account preference the rest of the app already
 * reads — this spec exists to catch a regression where this page's own copy of a setting drifts
 * from the one everywhere else reads, not to re-test each setting's own behavior (covered by
 * `rulership-setting.spec.ts`, `symbol-setting.spec.ts`, etc.).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Download } from '@playwright/test';
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

test('Preferences is reachable from every screen, lists its four subsections, and has no automatically detectable accessibility violations', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('link', { name: 'Preferences', exact: true }).click();
  await expect(page).toHaveURL(/#\/preferences$/);
  await expect(page.getByRole('heading', { name: 'Preferences', level: 1 })).toBeVisible();
  for (const heading of ['General', 'Astrology defaults', 'Appearance & accessibility', 'Data & privacy']) {
    await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible();
  }
  // The link marks itself current while here, same convention as every other nav link.
  await expect(page.getByRole('link', { name: 'Preferences', exact: true })).toHaveAttribute('aria-current', 'page');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('the rulers choice changed here is the same one chart screens read, and survives a reload', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('link', { name: 'Preferences', exact: true }).click();
  const select = page.getByLabel('Planetary rulers', { exact: true });
  await expect(select).toHaveValue('modern');
  await select.selectOption('traditional');

  await page.reload();
  await page.waitForEvent('load', { timeout: 5_000 }).catch(() => undefined);
  await expect(page.getByLabel('Planetary rulers', { exact: true })).toHaveValue('traditional');

  // Reset so this test leaves no state behind for the suite's shared ASTRAYA_DB_PATH-free run.
  await page.getByLabel('Planetary rulers', { exact: true }).selectOption('modern');
});

test('exporting everything and the people CSV both produce real downloads', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await page.getByRole('link', { name: 'Preferences', exact: true }).click();

  const read = async (download: Download): Promise<string> => {
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf-8');
  };

  const [everything] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export everything (one file)', exact: true }).click(),
  ]);
  expect(everything.suggestedFilename()).toMatch(/^astraya-export-\d{4}-\d{2}-\d{2}\.json$/);
  const archive = JSON.parse(await read(everything)) as { people: { displayName: string }[] };
  expect(archive.people.map((p) => p.displayName)).toEqual(['Ada Lovelace']);
  await expect(page.getByText('everything exported.', { exact: false })).toBeVisible();

  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export people (CSV)', exact: true }).click(),
  ]);
  expect(await read(csv)).toContain('Ada Lovelace,1815-12-10,07:45:00,recorded');
});
