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

test('a section link opens Preferences at that heading and moves focus there (#509)', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/preferences/data`);
  await expect(page.getByRole('heading', { name: 'Data & privacy', level: 2 })).toBeFocused();
  await gotoAndSettle(page, `${baseUrl}/#/preferences/astrology`);
  await expect(page.getByRole('heading', { name: 'Astrology defaults', level: 2 })).toBeFocused();
  // An unknown section is not a guess at one: the hash falls back to People.
  await gotoAndSettle(page, `${baseUrl}/#/preferences/nope`);
  await expect(page.getByRole('heading', { name: 'Preferences', level: 1 })).toHaveCount(0);
});

test('Motion and Density are device preferences: applied at once, kept across a reload, and compact never shrinks touch targets (#510)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/preferences/appearance`);
  const root = page.locator('html');
  await expect(root).not.toHaveAttribute('data-motion', /.*/);
  await expect(root).not.toHaveAttribute('data-density', /.*/);

  await page.getByLabel('Motion', { exact: true }).selectOption('reduced');
  await page.getByLabel('Density', { exact: true }).selectOption('compact');
  await expect(root).toHaveAttribute('data-motion', 'reduced');
  await expect(root).toHaveAttribute('data-density', 'compact');
  // Reduce motion really switches transitions off, everywhere.
  const duration = await page.evaluate(
    "getComputedStyle(document.querySelector('.primitive-field select')).transitionDuration",
  );
  expect(duration).toBe('1e-05s');

  await page.reload();
  await expect(root).toHaveAttribute('data-motion', 'reduced');
  await expect(root).toHaveAttribute('data-density', 'compact');
  await expect(page.getByLabel('Motion', { exact: true })).toHaveValue('reduced');

  // A compact select is tighter than a standard one on a fine pointer…
  const density = page.getByLabel('Density', { exact: true });
  const heightOf = async (): Promise<number> => (await density.boundingBox())?.height ?? 0;
  await expect.poll(heightOf).toBeGreaterThan(0);
  const compact = await heightOf();
  await density.selectOption('standard');
  await expect(root).not.toHaveAttribute('data-density', /.*/);
  await expect.poll(heightOf).toBeGreaterThan(compact);
});

test('the rulers choice changed here is the same one chart screens read, and survives a reload', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('link', { name: 'Preferences', exact: true }).click();
  const group = page.getByRole('radiogroup', { name: 'Planetary rulers', exact: true });
  await expect(group.getByRole('radio', { name: /^Modern/ })).toBeChecked();
  await group.getByRole('radio', { name: /^Traditional/ }).check();

  await page.reload();
  await page.waitForEvent('load', { timeout: 5_000 }).catch(() => undefined);
  await expect(group.getByRole('radio', { name: /^Traditional/ })).toBeChecked();

  // Reset so this test leaves no state behind for the suite's shared ASTRAYA_DB_PATH-free run.
  await group.getByRole('radio', { name: /^Modern/ }).check();
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
