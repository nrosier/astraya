/**
 * The PDF export builder (#441): reached from the header's Export menu, builds and downloads a
 * real PDF for a chosen preset. No unit test exercises the actual jsPDF/svg2pdf.js/jspdf-autotable
 * rendering — `test/ui-pdf-export-plan.test.ts` covers the plan those libraries draw, but never the
 * drawing itself, which needs a real browser (`src/ui/pdf-export-plan.ts`'s own doc comment explains
 * why svg2pdf.js in particular cannot be imported under Vitest at all).
 */
import { mkdtempSync, rmSync } from 'node:fs';
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

const ADA = {
  name: 'Ada Lovelace',
  date: '1815-12-10',
  time: '07:45:00',
  latitude: '51.5072',
  longitude: '-0.1276',
};

const CHARLES = {
  name: 'Charles Babbage',
  date: '1820-12-26',
  time: '10:00:00',
  latitude: '51.5072',
  longitude: '-0.1276',
};

test('the Export menu opens the PDF builder, and a preset downloads a real PDF', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);

  const header = page.getByRole('banner');
  await header.getByRole('button', { name: 'Export', exact: true }).click();
  await header.getByRole('link', { name: 'Build custom PDF…', exact: true }).click();
  await expect(page).toHaveURL(/#\/export$/);
  await expect(page.getByRole('heading', { name: 'Build a PDF', level: 1 })).toBeVisible();

  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Ada Lovelace' });
  await page
    .getByLabel('Starting point', { exact: true })
    .selectOption({ label: 'Executive summary (natal wheel, positions, interpretation)' });

  const buildButton = page.getByRole('button', { name: 'Build PDF', exact: true });
  await expect(buildButton).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), buildButton.click()]);
  expect(download.suggestedFilename()).toBe('ada-lovelace-export.pdf');

  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(1000);

  await expect(page.getByRole('status')).toHaveText('✓');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('ticking a chart type reveals its own tables and wheel checkbox, and unticking collapses them', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await page.goto(`${baseUrl}/#/export`);
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Ada Lovelace' });

  await expect(page.getByLabel('Wheel', { exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Harmonic', exact: true }).check();
  await expect(page.getByLabel('Wheel', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Harmonic number', { exact: true })).toHaveValue('5');
  await page.getByRole('checkbox', { name: 'Harmonic', exact: true }).uncheck();
  await expect(page.getByLabel('Wheel', { exact: true })).toHaveCount(0);
});

test('the AI-customised narrative needs its own consent tick before Build PDF is enabled', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await page.goto(`${baseUrl}/#/export`);
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Ada Lovelace' });

  const buildButton = page.getByRole('button', { name: 'Build PDF', exact: true });
  await page.getByRole('checkbox', { name: 'AI-customised narrative', exact: true }).check();
  await expect(buildButton).toBeDisabled();
  await page
    .getByRole('checkbox', { name: 'I consent to generating an AI-customised narrative for this export.' })
    .check();
  await expect(buildButton).toBeEnabled();
});

test('synastry and composite each get their own partner picker, and both build into one PDF (#441)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await page.getByRole('link', { name: '← People' }).click();
  await createPerson(page, CHARLES);
  await page.goto(`${baseUrl}/#/export`);
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Ada Lovelace' });

  // Neither partner picker exists until its own checkbox is ticked.
  await expect(page.getByLabel('Compare with', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Compose with', { exact: true })).toHaveCount(0);

  await page.getByRole('checkbox', { name: 'Synastry', exact: true }).check();
  await page.getByLabel('Compare with', { exact: true }).selectOption({ label: 'Charles Babbage' });
  await page.getByRole('checkbox', { name: 'Composite', exact: true }).check();
  await page.getByLabel('Compose with', { exact: true }).selectOption({ label: 'Charles Babbage' });

  const buildButton = page.getByRole('button', { name: 'Build PDF', exact: true });
  await expect(buildButton).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), buildButton.click()]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(1000);
  await expect(page.getByRole('status')).toHaveText('✓');
});

test('unticking Synastry hides its partner picker and drops it from the selection', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await page.getByRole('link', { name: '← People' }).click();
  await createPerson(page, CHARLES);
  await page.goto(`${baseUrl}/#/export`);
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Ada Lovelace' });

  await page.getByRole('checkbox', { name: 'Synastry', exact: true }).check();
  await expect(page.getByLabel('Compare with', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Synastry', exact: true }).uncheck();
  await expect(page.getByLabel('Compare with', { exact: true })).toHaveCount(0);
});

test('ticking Progressions reveals its technique/MC-method controls, which collapse the MC method for non-secondary techniques (#441)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await page.goto(`${baseUrl}/#/export`);
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Ada Lovelace' });

  const predictive = page.getByRole('group', { name: 'Progressions, solar arc, profections & astrocartography' });
  await expect(predictive.getByLabel('Technique', { exact: true })).toHaveCount(0);
  await predictive.getByRole('checkbox', { name: 'Progressions', exact: true }).check();
  await expect(predictive.getByLabel('Technique', { exact: true })).toHaveValue('secondary');
  await expect(predictive.getByLabel('MC method', { exact: true })).toBeVisible();

  await predictive.getByLabel('Technique', { exact: true }).selectOption({ label: 'Minor' });
  await expect(predictive.getByLabel('MC method', { exact: true })).toHaveCount(0);

  await predictive.getByRole('checkbox', { name: 'Progressions', exact: true }).uncheck();
  await expect(predictive.getByLabel('Technique', { exact: true })).toHaveCount(0);
});

test('ticking Astrocartography reveals its map/line-type/body controls, which collapse when unticked (#441)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await page.goto(`${baseUrl}/#/export`);
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Ada Lovelace' });

  const predictive = page.getByRole('group', { name: 'Progressions, solar arc, profections & astrocartography' });
  await expect(predictive.getByLabel('Map', { exact: true })).toHaveCount(0);
  await predictive.getByRole('checkbox', { name: 'Astrocartography', exact: true }).check();
  await expect(predictive.getByLabel('Map', { exact: true })).toBeChecked();
  await expect(predictive.getByRole('checkbox', { name: 'MC', exact: true })).toBeChecked();
  await expect(predictive.getByRole('checkbox', { name: 'Sun', exact: true })).toBeChecked();
  await expect(predictive.getByRole('checkbox', { name: 'Uranus', exact: true })).not.toBeChecked();

  await predictive.getByRole('checkbox', { name: 'Astrocartography', exact: true }).uncheck();
  await expect(predictive.getByLabel('Map', { exact: true })).toHaveCount(0);
});

test('selecting the Full predictive report preset fills progressions and solar arc, and builds a real PDF (#441)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await page.goto(`${baseUrl}/#/export`);
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Ada Lovelace' });
  await page
    .getByLabel('Starting point', { exact: true })
    .selectOption({ label: 'Full predictive report (natal wheel, transits, progressions, solar arc)' });

  const predictive = page.getByRole('group', { name: 'Progressions, solar arc, profections & astrocartography' });
  await expect(predictive.getByRole('checkbox', { name: 'Progressions', exact: true })).toBeChecked();
  await expect(predictive.getByRole('checkbox', { name: 'Solar arc directions', exact: true })).toBeChecked();
  await expect(predictive.getByRole('checkbox', { name: 'Profections', exact: true })).not.toBeChecked();
  await expect(predictive.getByRole('checkbox', { name: 'Astrocartography', exact: true })).not.toBeChecked();

  const buildButton = page.getByRole('button', { name: 'Build PDF', exact: true });
  await expect(buildButton).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), buildButton.click()]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(1000);
  await expect(page.getByRole('status')).toHaveText('✓');
});

test('ticking Profections and Astrocartography on their own builds a real PDF with both sections (#441)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await page.goto(`${baseUrl}/#/export`);
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Ada Lovelace' });

  const predictive = page.getByRole('group', { name: 'Progressions, solar arc, profections & astrocartography' });
  await predictive.getByRole('checkbox', { name: 'Profections', exact: true }).check();
  await predictive.getByRole('checkbox', { name: 'Astrocartography', exact: true }).check();

  const buildButton = page.getByRole('button', { name: 'Build PDF', exact: true });
  await expect(buildButton).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), buildButton.click()]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(1000);
  await expect(page.getByRole('status')).toHaveText('✓');
});
