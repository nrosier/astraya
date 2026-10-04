/**
 * The golden path for planetary cycles (#410): opening the screen from the People page lists the
 * Jupiter-Saturn great conjunctions with a diagram, switching to the Venus pentagram preset
 * narrows it to the retrograde conjunctions, and the screen has no automatic accessibility
 * violations. Needs no person: it runs on the ephemeris alone.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
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

test('the cycles screen lists the great conjunctions with a diagram, and narrows to the Venus pentagram', async ({
  page,
}) => {
  test.setTimeout(90_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('link', { name: 'Planetary cycles', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Planetary cycles' })).toBeVisible();

  // Opens on Jupiter-Saturn: the great conjunction of 21 December 2020 is in the table.
  const table = page.getByRole('table');
  await expect(table.getByRole('cell', { name: '2020-12-21 18:20', exact: false })).toBeVisible({ timeout: 60_000 });
  await expect(table).toContainText('Aquarius');
  await expect(page.locator('svg.cycle-diagram')).toBeVisible();
  await expect(page.locator('svg.cycle-diagram .cycle-point').first()).toBeVisible();

  // The Venus pentagram preset keeps only the retrograde (inferior) conjunctions.
  await page.getByLabel('Cycle').selectOption('venus-pentagram');
  await expect(page.getByLabel('Cycle')).toHaveValue('venus-pentagram');
  await expect(page.getByLabel('First body’s motion')).toHaveValue('retrograde');
  await expect(table.getByRole('row').nth(1)).toContainText('Venus');
});

test('a diagram point and its table row select each other (#418)', async ({ page }) => {
  test.setTimeout(90_000);
  // Short enough that the table starts below the fold, so scrolling a selected row into view is visible.
  await page.setViewportSize({ width: 1100, height: 560 });
  await gotoAndSettle(page, `${baseUrl}/#/cycles`);
  const table = page.getByRole('table');
  await expect(table).toBeVisible({ timeout: 60_000 });

  const groups = page.locator('svg.cycle-diagram .cycle-point-group');
  const count = await groups.count();
  expect(count).toBeGreaterThan(5);
  await expect(page.locator('svg.cycle-diagram .cycle-dimmed')).toHaveCount(0);

  // Clicking a point on the diagram selects it, dims the rest, marks its row and brings it into view.
  // The last point is the topmost: in this cycle points three steps apart land almost on top of each
  // other, and a click goes to the one drawn last (the table reaches every one of them).
  const lastId = await groups.nth(count - 1).getAttribute('data-cycle-id');
  await groups
    .nth(count - 1)
    .locator('.cycle-hit-area')
    .click();
  const selectedRow = table.locator(`tbody tr[data-row-key="${lastId ?? ''}"]`);
  await expect(selectedRow).toHaveAttribute('aria-current', 'true');
  await expect(selectedRow).toBeInViewport();
  await expect(selectedRow.getByRole('button', { name: `Show step ${String(count)} on the diagram` })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('svg.cycle-diagram .cycle-selected')).toHaveCount(1);
  expect(await page.locator('svg.cycle-diagram .cycle-dimmed').count()).toBeGreaterThan(0);
  await expect(page.getByRole('status').filter({ hasText: `Step ${String(count)} of` })).toBeVisible();

  // A step button in the table selects that event on the diagram, and moves the selection.
  await table.getByRole('button', { name: 'Show step 5 on the diagram' }).click();
  await expect(table.locator('tbody tr[aria-current="true"]')).toHaveCount(1);
  await expect(table.getByRole('button', { name: 'Show step 5 on the diagram' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(table.getByRole('button', { name: `Show step ${String(count)} on the diagram` })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.locator('svg.cycle-diagram .cycle-selected .cycle-point-label')).toHaveText('5');

  // The keyboard reaches it too: focus the button and press Enter on the selected one to clear.
  const stepFive = table.getByRole('button', { name: 'Show step 5 on the diagram' });
  await stepFive.focus();
  await page.keyboard.press('Enter');
  await expect(table.locator('tbody tr[aria-current="true"]')).toHaveCount(0);
  await expect(page.locator('svg.cycle-diagram .cycle-dimmed')).toHaveCount(0);

  // Clicking the empty diagram clears a selection too, and a new search starts with none.
  await groups
    .nth(count - 1)
    .locator('.cycle-hit-area')
    .click();
  await expect(page.locator('svg.cycle-diagram .cycle-selected')).toHaveCount(1);
  await page.getByLabel('Cycle').selectOption('venus-pentagram');
  await expect(page.locator('svg.cycle-diagram .cycle-selected')).toHaveCount(0);
});

test('the cycles screen has no automatically detectable accessibility violations', async ({ page }) => {
  test.setTimeout(90_000);

  await gotoAndSettle(page, `${baseUrl}/#/cycles`);
  await expect(page.getByRole('table')).toBeVisible({ timeout: 60_000 });

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('a bad year is reported inline instead of searching', async ({ page }) => {
  test.setTimeout(90_000);

  await gotoAndSettle(page, `${baseUrl}/#/cycles`);
  await expect(page.getByRole('table')).toBeVisible({ timeout: 60_000 });
  await page.getByLabel('From year').fill('abc');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('whole years');
});
