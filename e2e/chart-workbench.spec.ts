/**
 * The chart workbench layout (#511): the dial, then its SelectionInspector straight after it in
 * DOM order; one column below a 68rem workbench container, two columns at 68rem and above,
 * whatever the viewport; and room reserved for the inspector so a first selection does not shove
 * the page.
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

test('the inspector follows the dial, beside it from a 68rem workbench and below it under that', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openNatalChart(page);
  const dial = page.locator('.chart-workbench-dial');
  const inspector = page.locator('.selection-inspector');
  await expect(dial).toBeVisible();
  await expect(inspector).toBeVisible();

  // DOM (and so focus) order: the dial first, the inspector after it.
  const dialFirst = await page.evaluate(
    "document.querySelector('.chart-workbench-dial').compareDocumentPosition(document.querySelector('.selection-inspector')) & 4",
  );
  expect(dialFirst).toBeTruthy();

  // Unpinned, a wide screen reaches the two-column state: the chart shell is wider than the 64rem
  // general-content shell, or 68rem would be unreachable.
  const naturalWidth = Number(
    await page.evaluate("document.querySelector('.chart-workbench-shell').getBoundingClientRect().width"),
  );
  expect(naturalWidth).toBeGreaterThanOrEqual(68 * 16);
  const dialBox = await dial.boundingBox();
  const inspectorBox = await inspector.boundingBox();
  expect(inspectorBox?.x ?? 0).toBeGreaterThan((dialBox?.x ?? 0) + (dialBox?.width ?? 0) - 1);

  // The container's own width decides, not the viewport: pin the workbench shell to either side of 68rem.
  const remPx = Number(await page.evaluate('parseFloat(getComputedStyle(document.documentElement).fontSize)'));
  const pin = async (rem: number): Promise<void> => {
    await page.evaluate(`document.querySelector('.chart-workbench-shell').style.width = '${String(rem * remPx)}px'`);
  };
  const sideBySide = async (): Promise<boolean> => {
    const d = await dial.boundingBox();
    const i = await inspector.boundingBox();
    if (d === null || i === null) throw new Error('no boxes');
    return i.x >= d.x + d.width - 1 && i.y < d.y + d.height;
  };

  await pin(67.99);
  expect(await sideBySide()).toBe(false);
  const below = await inspector.boundingBox();
  const stackedDial = await dial.boundingBox();
  expect(below?.y ?? 0).toBeGreaterThanOrEqual((stackedDial?.y ?? 0) + (stackedDial?.height ?? 0) - 1);

  await pin(68);
  expect(await sideBySide()).toBe(true);
});

test('selecting something fills the inspector in place, without moving it', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openNatalChart(page);
  const inspector = page.locator('.selection-inspector');
  await expect(inspector).toContainText('to explore it');
  const pageTop = async (): Promise<number> =>
    Number(
      await page.evaluate(
        "document.querySelector('.selection-inspector').getBoundingClientRect().top + window.scrollY",
      ),
    );
  const before = await pageTop();

  await page.locator('.chart-point[data-body="sun"]').click();
  await expect(inspector.locator('.selection-inspector-facts')).toContainText('Sun');
  await expect(inspector.getByRole('button', { name: 'Clear', exact: true })).toBeVisible();
  // The inspector's own top never moves (page-relative: the click scrolls the dial into view).
  expect(await pageTop()).toBeCloseTo(before, 0);

  await inspector.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(inspector).toContainText('to explore it');
});

test('a house number on the wheel selects that house, in the inspector and in its table row (#511)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openNatalChart(page);
  const inspector = page.locator('.selection-inspector');

  await page.locator('.chart-house[data-house="5"]').click();
  await expect(inspector.locator('.selection-inspector-facts strong')).toContainText('on the cusp of house 5');
  await expect(page.locator('.chart-house[data-house="6"]')).toHaveClass(/chart-dimmed/);

  // The same selection is on the Placements table, reachable and clearable from the keyboard.
  await page.getByRole('link', { name: 'Placements', exact: true }).click();
  const show = page.getByRole('button', { name: 'Show House 5 on the chart', exact: true });
  await expect(show).toHaveAttribute('aria-pressed', 'true');
  await show.focus();
  await page.keyboard.press('Enter');
  await expect(show).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('link', { name: 'Wheel', exact: true }).click();
  await expect(inspector).toContainText('to explore it');
});

test('a sign is selectable from the Placements table by keyboard, and clearable the same way (#511)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openNatalChart(page, 'Placements');
  // Ada's Sun is in Sagittarius.
  const show = page.getByRole('button', { name: 'Show Sagittarius on the chart', exact: true }).first();
  await show.focus();
  await page.keyboard.press('Enter');
  await expect(show).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.chart-selection-bar')).toContainText('Sagittarius');

  await page.getByRole('link', { name: 'Wheel', exact: true }).click();
  await expect(page.locator('.selection-inspector-facts .chart-isolation-head strong')).toHaveText('Sagittarius');
  await expect(page.locator('.chart-sign[data-sign="gemini"]')).toHaveClass(/chart-dimmed/);

  await page.getByRole('link', { name: 'Placements', exact: true }).click();
  await show.focus();
  await page.keyboard.press('Space');
  await expect(show).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.chart-selection-bar')).toHaveCount(0);
});

test('a derived point is selectable from the Placements table by keyboard, with its position in the inspector (#511)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openNatalChart(page, 'Placements');
  const show = page.getByRole('button', { name: 'Show Part of Spirit on the chart', exact: true });
  await show.focus();
  await page.keyboard.press('Enter');
  await expect(show).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('tr.data-table-row-selected')).toContainText('Part of Spirit');

  await page.getByRole('link', { name: 'Wheel', exact: true }).click();
  const facts = page.locator('.selection-inspector-facts');
  await expect(facts.locator('.chart-isolation-head strong')).toHaveText('Part of Spirit');
  await expect(facts).toContainText(/°\d\d' — House \d+/);
  await expect(facts.locator('.chart-isolation-interpretation')).toBeVisible();

  await page.getByRole('link', { name: 'Placements', exact: true }).click();
  await show.focus();
  await page.keyboard.press('Enter');
  await expect(show).toHaveAttribute('aria-pressed', 'false');
});

test('the aspect matrix is a view of its own, and a cell selects its pair on the wheel by mouse and keyboard (#511)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openNatalChart(page, 'Aspect matrix');
  await expect(page.getByRole('heading', { name: 'Aspect matrix', level: 2 })).toBeVisible();
  await expect(page.locator('.chart-aspect-matrix')).toBeVisible();

  // The Sun trines Mars in this chart: that cell is a button named for the pair.
  const cell = page.getByRole('button', { name: /^Mars Trine Sun$|^Sun Trine Mars$/ });
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.chart-selection-bar')).toBeVisible();

  // The same selection is what the Aspects table shows, and the wheel's inspector.
  await page.getByRole('link', { name: 'Aspects', exact: true }).click();
  await expect(page.locator('tr.data-table-row-selected')).toContainText('Trine');
  await page.getByRole('link', { name: 'Wheel', exact: true }).click();
  await expect(page.locator('.selection-inspector-facts')).toBeVisible();

  // Back on the matrix, Enter on the focused cell toggles it off.
  await page.getByRole('link', { name: 'Aspect matrix', exact: true }).click();
  await cell.focus();
  await page.keyboard.press('Enter');
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
});

test('the elements and modalities grid is a view of its own, with its table and a CSV download (#511)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await openNatalChart(page, 'Elements & modalities');
  await expect(page.getByRole('heading', { name: 'Elements & modalities', level: 2 })).toBeVisible();
  await expect(page.locator('.chart-emphasis-grid')).toBeVisible();

  // The table holds every value the drawing does, as text: four elements and a totals row.
  const table = page.getByRole('table', { name: 'Elements and modalities' });
  await expect(table.locator('tbody tr')).toHaveCount(5);
  await expect(table.getByRole('columnheader')).toHaveText(['Element', 'Cardinal', 'Fixed', 'Mutable', 'Total']);
  await expect(table.locator('tbody tr').last()).toContainText('Total');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('ada-lovelace-elements-modalities.csv');
});
