/**
 * Journey 1 of the final acceptance list (#514): "Select a sign, body, cusp, house, and aspect and find
 * each meaning immediately." One test walks Albert Einstein's shared natal chart, driving the real wheel
 * and tables. Every selection must put its name in the Selection card and show a "What it means" section
 * there, without a further click and without leaving the Wheel.
 *
 * Step -> box text:
 *   1. sign   -> Placements "Show Pisces on the wheel" (keyboard); the card names Pisces and explains it.
 *   2. body   -> the Sun glyph on the wheel; the card names the Sun and explains it.
 *   3. cusp   -> the house-5 number on the wheel; the card reads "... on the cusp of house 5" and explains it.
 *   4. house  -> that same selection dims the other houses, so the house is the thing selected.
 *   5. aspect -> the Aspect matrix cell for Mars trine Pluto opens the Wheel with that pair selected and explained.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { openNatalChart } from './support.ts';

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

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

// A fresh context per test, holding the shared people; nothing here saves, edits or deletes one.
test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

/** The Selection card must already hold written meaning text, with no extra click. */
async function expectMeaning(page: Page): Promise<void> {
  const card = page.locator('.selection-inspector');
  const meaning = card.locator('.chart-isolation-interpretation');
  await expect(meaning).toBeVisible();
  await expect(meaning.getByRole('heading', { name: 'What it means' })).toBeVisible();
  await expect.poll(async () => ((await meaning.textContent()) ?? '').length).toBeGreaterThan(60);
  await expect(card.getByText('The interpretation text could not be loaded.')).toHaveCount(0);
}

test('a sign, body, cusp, house and aspect each show their meaning in the Selection card at once', async () => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openNatalChart(page, 'Placements');
  const facts = page.locator('.selection-inspector-facts');
  const wheelLink = page.getByRole('link', { name: 'Wheel', exact: true });

  // 1. Sign: Einstein's Sun is in Pisces.
  const show = page.getByRole('button', { name: 'Show Pisces on the wheel', exact: true }).first();
  await show.focus();
  await page.keyboard.press('Enter');
  await expect(wheelLink).toHaveAttribute('aria-current', 'page');
  await expect(facts.locator('.chart-isolation-head strong')).toHaveText('Pisces');
  await expectMeaning(page);

  // 2. Body: the Sun on the wheel.
  await page.getByRole('button', { name: 'Clear', exact: true }).first().click();
  await expect(page.locator('.selection-inspector')).toContainText('to explore it');
  await page.locator('.chart-point[data-body="sun"]').first().click({ force: true });
  await expect(facts.locator('.chart-isolation-head strong')).toContainText('Sun');
  await expectMeaning(page);

  // 3. Cusp: the house-5 number on the wheel.
  await page.getByRole('button', { name: 'Clear', exact: true }).first().click();
  await expect(page.locator('.selection-inspector')).toContainText('to explore it');
  await page.locator('.chart-house[data-house="5"]').click();
  await expect(facts.locator('.chart-isolation-head strong')).toContainText('on the cusp of house 5');
  await expectMeaning(page);

  // 4. House: the house itself is the selection, so the other houses dim.
  await expect(page.locator('.chart-house[data-house="6"]')).toHaveClass(/chart-dimmed/);
  await expect(page.locator('.chart-house[data-house="5"]')).not.toHaveClass(/chart-dimmed/);

  // 5. Aspect: Mars trine Pluto from the matrix lands on the Wheel with the pair selected and explained.
  await page.getByRole('button', { name: 'Clear', exact: true }).first().click();
  await page.getByRole('link', { name: 'Aspect matrix', exact: true }).click();
  await page.getByRole('button', { name: /^Mars Trine Pluto$|^Pluto Trine Mars$/ }).click();
  await expect(wheelLink).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.chart-wheel .chart-dimmed').first()).toBeAttached();
  await expect(facts).toContainText(/Trine/);
  await expectMeaning(page);
});
