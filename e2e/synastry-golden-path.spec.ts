/**
 * The golden path for synastry (#172): two people with known birth times, opening the
 * Synastry screen from the first person's page, picking the second from the in-screen
 * dropdown, and the bi-wheel and aspect table render with a CSV download.
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

test('two people with known birth times get a Synastry screen with a bi-wheel and aspect table', async ({ page }) => {
  test.setTimeout(60_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await page.getByRole('link', { name: '← People' }).click();
  await createPerson(page, {
    name: 'Charles Babbage',
    date: '1820-12-26',
    time: '10:00:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });

  await page.getByRole('link', { name: '← People' }).click();
  await page.getByRole('link').filter({ hasText: 'Ada Lovelace' }).click();
  await page.getByRole('button', { name: 'Relationship Charts', exact: true }).click();
  await page.getByRole('link', { name: 'Synastry', exact: true }).click();
  await expect(page.getByRole('heading', { name: /synastry/i })).toBeVisible();

  await page.getByLabel('Compare with').selectOption({ label: 'Charles Babbage' });

  await expect(page.locator('div.chart-wheel')).toBeVisible();
  await expect(page.locator('div.chart-wheel svg')).toHaveCount(1);
  await expect(page.getByRole('table', { name: 'Aspects' })).toBeVisible();

  // The aspect table's Interpretation column never renders blank (#359): it starts as the
  // mechanical sentence and, once the reviewed corpus has loaded (#422), becomes the corpus text,
  // led by whose side it is written from.
  await expect(page.getByRole('columnheader', { name: 'Interpretation' })).toBeVisible();
  const firstInterpretationCell = page.getByRole('row').nth(1).getByRole('cell').last();
  await expect(firstInterpretationCell).not.toBeEmpty();
  const fromCorpus = page.getByRole('cell').filter({ hasText: /^Seen from (Ada Lovelace|Charles Babbage)’s side: / });
  await expect(fromCorpus.first()).toBeVisible();
  // Every row that has an entry names a side; the rows that are a body paired with itself do not.
  const rows = page.getByRole('table', { name: 'Aspects' }).locator('tbody tr');
  expect(await fromCorpus.count()).toBeLessThanOrEqual(await rows.count());

  // Ranked by importance (#422): the table opens with the strongest contacts first, each scored.
  await expect(page.getByText('The aspects are ordered by importance')).toBeVisible();
  const aspectsTable = page.getByRole('table', { name: 'Aspects' });
  const headers = await aspectsTable.getByRole('columnheader').allInnerTexts();
  const importanceColumn = headers.findIndex((header) => header.toLowerCase().includes('importance'));
  expect(importanceColumn, `column headers: ${JSON.stringify(headers)}`).toBeGreaterThanOrEqual(0);
  const scores: number[] = [];
  for (const row of await aspectsTable.locator('tbody tr').all()) {
    scores.push(Number(await row.getByRole('cell').nth(importanceColumn).innerText()));
  }
  expect(scores.length).toBeGreaterThan(3);
  expect(scores.every((score) => Number.isInteger(score) && score >= 0 && score <= 100)).toBe(true);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  expect(scores[0]).toBeGreaterThan(scores.at(-1) ?? 0);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('ada-lovelace-charles-babbage-synastry-aspects.csv');
});

test('the relationship summary panel groups contacts by theme, and its AI reading is gated on an account (#422)', async ({
  page,
}) => {
  test.setTimeout(60_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await page.getByRole('link', { name: '← People' }).click();
  await createPerson(page, {
    name: 'Charles Babbage',
    date: '1820-12-26',
    time: '10:00:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });

  await page.getByRole('link', { name: '← People' }).click();
  await page.getByRole('link').filter({ hasText: 'Ada Lovelace' }).click();
  await page.getByRole('button', { name: 'Relationship Charts', exact: true }).click();
  await page.getByRole('link', { name: 'Synastry', exact: true }).click();
  await page.getByLabel('Compare with').selectOption({ label: 'Charles Babbage' });

  const panel = page.getByRole('region', { name: 'Relationship summary' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Emotional bond')).toBeVisible();
  // Not a verdict (#422 decision 4): the panel states counts, never a conclusion about the pair.
  await expect(panel.getByText(/harmonious contact.*challenging/)).toBeVisible();

  // The AI reading needs an account before consent even enters the picture: logged out, there is
  // no consent checkbox to tick at all (it would wrongly suggest proceeding is one tick away), and
  // the Generate button stays disabled with the sign-in reason, the same two-gate design every
  // other Tier 2 panel in the app uses.
  const generateButton = panel.getByRole('button', { name: 'Generate an AI-customised relationship reading' });
  await expect(generateButton).toBeDisabled();
  await expect(panel.getByText('Sign in to generate an AI-customised relationship reading.')).toBeVisible();
  await expect(panel.getByRole('checkbox')).toHaveCount(0);
});

test('a person with an unknown birth time is told synastry needs one', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Unknown Time',
    date: '1990-01-01',
    latitude: '40.7128',
    longitude: '-74.006',
  });

  await page.getByRole('button', { name: 'Relationship Charts', exact: true }).click();
  await page.getByRole('link', { name: 'Synastry', exact: true }).click();
  await expect(page.getByText(/needs a complete birth record with a known time/)).toBeVisible();
});

test("clicking a ring legend entry dims the other person's legend (#455)", async ({ page }) => {
  test.setTimeout(60_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await page.getByRole('link', { name: '← People' }).click();
  await createPerson(page, {
    name: 'Charles Babbage',
    date: '1820-12-26',
    time: '10:00:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });

  await page.getByRole('link', { name: '← People' }).click();
  await page.getByRole('link').filter({ hasText: 'Ada Lovelace' }).click();
  await page.getByRole('button', { name: 'Relationship Charts', exact: true }).click();
  await page.getByRole('link', { name: 'Synastry', exact: true }).click();
  await page.getByLabel('Compare with').selectOption({ label: 'Charles Babbage' });

  await expect(page.locator('div.chart-wheel')).toBeVisible();

  // Get the ring legend entries
  const adaLegendEntry = page.locator('[data-ring-legend="0"]');
  const charlesLegendEntry = page.locator('[data-ring-legend="1"]');

  // Initially, both legend entries should be visible and not dimmed
  await expect(adaLegendEntry).toBeVisible();
  await expect(charlesLegendEntry).toBeVisible();
  await expect(adaLegendEntry).not.toHaveClass(/chart-dimmed/);
  await expect(charlesLegendEntry).not.toHaveClass(/chart-dimmed/);

  // Click on Ada's legend entry to isolate her ring
  await adaLegendEntry.click();

  // Now Ada's entry should not be dimmed, but Charles's should be
  await expect(adaLegendEntry).not.toHaveClass(/chart-dimmed/);
  await expect(charlesLegendEntry).toHaveClass(/chart-dimmed/);

  // Click on Charles's legend entry to isolate his ring
  await charlesLegendEntry.click();

  // Now Charles's entry should not be dimmed, but Ada's should be
  await expect(charlesLegendEntry).not.toHaveClass(/chart-dimmed/);
  await expect(adaLegendEntry).toHaveClass(/chart-dimmed/);

  // Click on an empty area of the wheel to clear the selection
  await page.locator('div.chart-wheel svg').click({ position: { x: 50, y: 50 } });

  // Both should be visible and not dimmed again
  await expect(adaLegendEntry).not.toHaveClass(/chart-dimmed/);
  await expect(charlesLegendEntry).not.toHaveClass(/chart-dimmed/);
});
