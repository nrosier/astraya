/**
 * Resizable table columns (#1301): on the Placements table a keyboard step and a pointer drag on a header's resize
 * handle change that column's real width, and a reload starts unresized (widths are not stored). Also covers the
 * Reset action (shown only once resized, beside Copy/Download CSV) on the Placements table and on
 * `ConsultationTransitTable`, and that the resize handle is hidden on a coarse (touch) pointer, per the owner
 * decisions recorded on the issue.
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

test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

test('a column resizes by keyboard and by drag, and sorting still works (#1301)', async () => {
  test.setTimeout(60_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openNatalChart(page, 'Placements');

  const table = page.getByRole('table').first();
  const header = table.locator('thead th').first();
  const handle = header.getByRole('separator');
  const widthOf = async (): Promise<number> => (await header.boundingBox())?.width ?? 0;

  const before = await widthOf();
  await handle.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(widthOf).toBeGreaterThan(before + 40);

  const afterKey = await widthOf();
  const box = await handle.boundingBox();
  if (box === null) throw new Error('no handle box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(widthOf).toBeGreaterThan(afterKey + 40);

  await header.getByRole('button').first().click();
  await expect(header).toHaveAttribute('aria-sort', 'ascending');

  await page.reload();
  await expect(page.getByRole('table').first().locator('col')).toHaveCount(0);
});

test('Reset appears beside Copy/Download CSV only once a column is resized, and restores the default widths (#1301)', async () => {
  test.setTimeout(60_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openNatalChart(page, 'Placements');

  const table = page.getByRole('table').first();
  // The table's own enclosing `section.data-table`, found by walking up from this one resolved element (an xpath
  // ancestor axis, evaluated per matched node) — not `.filter({ has: table })`, which re-scopes a `.first()` inside
  // `has` to each candidate's own subtree and so matches every table's section, not just this one.
  const section = table.locator(
    'xpath=ancestor::section[contains(concat(" ", normalize-space(@class), " "), " data-table ")][1]',
  );
  const actions = section.locator('.data-table-actions');
  const resetButton = actions.getByRole('button', { name: 'Reset widths' });

  // Copy/Download CSV are present from the start; Reset is not, since nothing has been resized yet.
  await expect(actions.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
  await expect(resetButton).toHaveCount(0);

  const header = table.locator('thead th').first();
  const before = (await header.boundingBox())?.width ?? 0;
  await header.getByRole('separator').focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await header.boundingBox())?.width ?? 0).toBeGreaterThan(before + 40);

  await expect(resetButton).toBeVisible();
  await resetButton.click();

  // Reset clears every column's width, which drops the fixed layout (`<col>`) and the Reset button itself.
  await expect(table.locator('col')).toHaveCount(0);
  await expect(resetButton).toHaveCount(0);
  await expect.poll(async () => (await header.boundingBox())?.width ?? 0).toBeCloseTo(before, 0);
});

test('the Consultation transit table (ConsultationTransitTable) resizes and resets too (#1301)', async () => {
  test.setTimeout(60_000);
  // Consultation's "As of …" clock recasts the page every so often (#676); pin it so the table underneath the
  // Reset button is not repainting mid-click, the way `consultation-golden-path.spec.ts` does.
  await page.clock.setFixedTime(new Date('2026-01-15T12:00:00'));
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Consultation', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Major active transits' })).toBeVisible();

  const region = page.getByRole('region', { name: 'Major active transits', exact: true });
  const header = region.locator('thead th').first();
  // The region's own enclosing `section.data-table` (SortableTable's wrapper), not the outer
  // `.consultation-section` with the page's h2 of the same name, so Reset is read off the right table. An xpath
  // ancestor axis on the already-unique `region`, not `.filter({ has: region })` (see the Placements test above).
  const section = region.locator(
    'xpath=ancestor::section[contains(concat(" ", normalize-space(@class), " "), " data-table ")][1]',
  );
  const resetButton = section.locator('.data-table-actions').getByRole('button', { name: 'Reset widths' });

  await expect(resetButton).toHaveCount(0);
  const before = (await header.boundingBox())?.width ?? 0;
  await header.getByRole('separator').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await header.boundingBox())?.width ?? 0).toBeGreaterThan(before);

  await expect(resetButton).toBeVisible();
  await resetButton.click();
  await expect(region.locator('col')).toHaveCount(0);
  await expect(resetButton).toHaveCount(0);
});

test('the resize handle is hidden on a coarse (touch) pointer, which keeps the sideways scroll instead (#1301)', async ({
  browser,
}) => {
  test.setTimeout(60_000);
  // A desktop-sized viewport, not the 390-wide phone layout: this test is only about the `(pointer: coarse)` media
  // query reacting to `hasTouch`, and a narrow width would also collapse the header nav behind its own toggle,
  // which is unrelated to what this test checks.
  const touchContext = await newSeededContext(browser, baseUrl, {
    hasTouch: true,
    viewport: { width: 1280, height: 800 },
  });
  const touchPage = await touchContext.newPage();
  try {
    await openSharedPerson(touchPage, baseUrl, EINSTEIN);
    await openNatalChart(touchPage, 'Placements');
    // A CSS locator, not getByRole: a hidden (display: none) element drops out of the accessibility tree, so a
    // role query alone cannot tell "not rendered" apart from "not in the tree for other reasons".
    const handle = touchPage.getByRole('table').first().locator('thead th').first().locator('.data-table-resize');
    await expect(handle).toHaveCount(1);
    await expect(handle).not.toBeVisible();
  } finally {
    await touchContext.close();
  }
});
