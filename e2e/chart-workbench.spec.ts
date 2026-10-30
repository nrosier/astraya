/**
 * The chart workbench layout (#511): the dial, then its SelectionInspector straight after it in
 * DOM order; one column below a 68rem workbench container, two columns (a 46rem-minimum dial and a 20-24rem inspector, #817) at 68rem
 * and above, whatever the viewport; and room reserved for the inspector so a first selection does not shove
 * the page.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { applySettings, openNatalChart, openSettings } from './support.ts';

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

test.describe('with the shared people (#799)', () => {
  let context: BrowserContext;
  let page: Page;

  // A fresh context per test, holding the shared people; no test here saves, edits or deletes one.
  test.beforeEach(async ({ browser }) => {
    context = await newSeededContext(browser, baseUrl);
    page = await context.newPage();
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('a sign is selectable from the Placements table by keyboard, and clearable the same way (#511)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page, 'Placements');
    // Einstein's Sun is in Pisces.
    const show = page.getByRole('button', { name: 'Show Pisces on the wheel', exact: true }).first();
    await show.focus();
    await page.keyboard.press('Enter');
    // Show goes straight to the Wheel (#898).
    await expect(page.getByRole('link', { name: 'Wheel', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.selection-inspector-facts .chart-isolation-head strong')).toHaveText('Pisces');
    await expect(page.locator('.chart-sign[data-sign="gemini"]')).toHaveClass(/chart-dimmed/);

    await page.getByRole('link', { name: 'Placements', exact: true }).click();
    await expect(page.locator('.chart-selection-bar')).toContainText('Pisces');
    await page.getByRole('button', { name: 'Clear', exact: true }).first().click();
    await expect(page.locator('.chart-selection-bar')).toHaveCount(0);
  });

  test('a derived point is selectable from the Placements table by keyboard, with its position in the inspector (#511)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page, 'Placements');
    // Part of Spirit is hidden until switched on (#542), like Part of Fortune.
    await openSettings(page, 'Bodies & orbs');
    // The checkbox's accessible name now disambiguates visible/participates in aspects (#585).
    await page
      .locator('dialog.settings-card')
      .getByRole('checkbox', { name: 'Part of Spirit — visible', exact: true })
      .check();
    await applySettings(page);
    const show = page.getByRole('button', { name: 'Show Part of Spirit on the wheel', exact: true });
    await show.focus();
    await page.keyboard.press('Enter');
    // Show goes straight to the Wheel (#898).
    await expect(page.getByRole('link', { name: 'Wheel', exact: true })).toHaveAttribute('aria-current', 'page');
    const facts = page.locator('.selection-inspector-facts');
    await expect(facts.locator('.chart-isolation-head strong')).toHaveText('Part of Spirit');
    // The position and house are separate badges now (#801): "Pisces 29°51'" and "House 3".
    await expect(facts).toContainText(/°\d\d'/);
    await expect(facts).toContainText(/House \d+/);
    await expect(facts.locator('.chart-isolation-interpretation')).toBeVisible();
    // The corpus now carries real entries for the derived points: the meaning is written text, not the mechanical
    // "Part of Spirit in Cancer." fallback sentence.
    const meaning = page
      .locator('.selection-inspector')
      .getByText(/^The concerns of the mind and will/)
      .first();
    await expect(meaning).toBeVisible();

    await page.getByRole('link', { name: 'Placements', exact: true }).click();
    await expect(page.locator('tr.data-table-row-selected')).toContainText('Part of Spirit');
    await page.getByRole('button', { name: 'Clear', exact: true }).first().click();
    await expect(page.locator('tr.data-table-row-selected')).toHaveCount(0);
  });

  test('the aspect matrix is a view of its own, and a cell selects its pair on the wheel by mouse and keyboard (#511)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page, 'Aspect matrix');
    await expect(page.getByRole('heading', { name: 'Aspect matrix', level: 2 })).toBeVisible();
    await expect(page.locator('.mgrid')).toBeVisible();

    // Mars trines Pluto in Einstein's chart (Mars 296.91°, Pluto 54.73°: 117.81° apart, 2.19° off exact, inside
    // the 7° major orb): that cell is a button named for the pair.
    const cell = page.getByRole('button', { name: /^Mars Trine Pluto$|^Pluto Trine Mars$/ });
    await cell.click();
    // A click goes straight to the Wheel with the pair highlighted (#898).
    await expect(page.getByRole('link', { name: 'Wheel', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.chart-wheel .chart-dimmed').first()).toBeAttached();
    await expect(page.locator('.selection-inspector-facts')).toBeVisible();

    // The same selection is what the Aspects table shows.
    await page.getByRole('link', { name: 'Aspects', exact: true }).click();
    await expect(page.locator('tr.data-table-row-selected')).toContainText('Trine');

    // Back on the matrix, Enter on the focused cell opens the Wheel again.
    await page.getByRole('link', { name: 'Aspect matrix', exact: true }).click();
    await cell.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: 'Wheel', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('Show on an Aspects row opens the Wheel with that aspect highlighted (#815)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page, 'Aspects');
    const first = page.locator('#chart-view-aspects table tbody tr').first();
    const show = first.getByRole('button', { name: /^Show .+ on the wheel$/ });
    const name = (await show.getAttribute('aria-label')) ?? '';
    expect(name).toMatch(/^Show .+ on the wheel$/);
    await show.click();

    await expect(page.getByRole('link', { name: 'Wheel', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#chart-view-wheel')).toBeVisible();
    await expect(page.locator('#chart-view-wheel')).toBeFocused();
    await expect(page.locator('#chart-view-aspects')).toHaveCount(0);
    // The selection dims everything but the aspect's two bodies and its line.
    await expect(page.locator('.chart-wheel .chart-dimmed').first()).toBeAttached();
    await expect(page.locator('.chart-wheel [data-body]:not(.chart-dimmed)')).not.toHaveCount(0);
    await expect(page.locator('.selection-inspector-facts')).toBeVisible();
    await expect(page.locator('.chart-wheel')).toBeInViewport();
  });

  test('the aspect matrix grid shows Name and House at 1280 and drops them at 390 (#820)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openNatalChart(page, 'Aspect matrix');
    const grid = page.locator('.mgrid');
    await expect(grid).toBeVisible();
    await expect(grid.locator('[role=columnheader].mgrid-col-name')).toBeVisible();
    await expect(grid.locator('[role=columnheader].mgrid-col-house')).toBeVisible();
    await expect(grid.locator('.mgrid-aspect').first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(grid).toBeVisible();
    await expect(grid.locator('[role=columnheader].mgrid-col-name')).toBeHidden();
    await expect(grid.locator('[role=columnheader].mgrid-col-house')).toBeHidden();
    await expect(grid.locator('[role=columnheader]', { hasText: 'Deg' })).toBeVisible();
    await expect(grid.locator('[role=columnheader]', { hasText: 'Sign' })).toBeVisible();
    await expect(grid.locator('[role=columnheader]', { hasText: 'Min' })).toBeVisible();
    await expect(grid.locator('.mgrid-aspect').first()).toBeVisible();
  });

  test('the elements and modalities grid is a view of its own, with its table and a CSV download (#511)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page, 'Elements & modalities');
    await expect(page.getByRole('heading', { name: 'Elements & modalities', level: 2 })).toBeVisible();
    await expect(page.locator('.emphasis-screen-grid')).toBeVisible();

    // #821: the grid carries its own totals (four rows, three columns) at a phone and a desktop width.
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const grid = page.locator('.emphasis-screen-grid');
      await expect(grid.locator('.emphasis-screen-row-total')).toHaveCount(4);
      await expect(grid.locator('.emphasis-screen-column-total')).toHaveCount(3);
      await expect(grid.locator('.emphasis-screen-row-total').first()).toBeVisible();
      await expect(grid.locator('.emphasis-screen-column-total').first()).toBeVisible();
      await expect(grid.locator('.emphasis-screen-row-total').first()).toHaveCSS('text-align', 'right');
    }
    await page.setViewportSize({ width: 1600, height: 1000 });

    // The table holds every value the drawing does, as text: four elements and a totals row.
    const table = page.getByRole('table', { name: 'Elements and modalities' });
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await expect(table.getByRole('columnheader')).toHaveText(['Element', 'Cardinal', 'Fixed', 'Mutable', 'Total']);
    await expect(table.locator('tbody tr').last()).toContainText('Total');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download CSV', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('albert-einstein-elements-modalities.csv');
  });

  test('the inspector follows the dial, beside it from a 68rem workbench and below it under that', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
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
    const remPx = Number(await page.evaluate('parseFloat(getComputedStyle(document.documentElement).fontSize)'));
    const naturalWidth = Number(
      await page.evaluate("document.querySelector('.chart-workbench-shell').getBoundingClientRect().width"),
    );
    expect(naturalWidth).toBeGreaterThanOrEqual(68 * remPx);
    const dialBox = await dial.boundingBox();
    const inspectorBox = await inspector.boundingBox();
    expect(inspectorBox?.x ?? 0).toBeGreaterThan((dialBox?.x ?? 0) + (dialBox?.width ?? 0) - 1);

    // The container's own width decides, not the viewport: pin the workbench shell to either side of 68rem.
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

    // The split is 7fr / 5fr (#801), tested at the widest the app really reaches: the wide shell is
    // 80rem less its 1.5rem side padding, so the workbench gets 77rem. Unpin and measure that, not a
    // width the app never has.
    await page.evaluate("document.querySelector('.chart-workbench-shell').style.width = ''");
    const realWidth = Number(
      await page.evaluate("document.querySelector('.chart-workbench-shell').getBoundingClientRect().width"),
    );
    expect(realWidth).toBeLessThanOrEqual(80 * remPx);
    expect(realWidth).toBeGreaterThanOrEqual(68 * remPx);
    const d = await dial.boundingBox();
    const i = await inspector.boundingBox();
    if (d === null || i === null) throw new Error('no boxes');
    const gap = i.x - (d.x + d.width);
    expect(gap).toBeGreaterThan(0);
    // The approved split (#817, mockup 2026-10-30): the dial takes at least 46rem and the inspector is 20-24rem.
    expect(d.width).toBeGreaterThanOrEqual(46 * remPx - 1);
    expect(i.width).toBeGreaterThanOrEqual(20 * remPx - 1);
    expect(i.width).toBeLessThanOrEqual(24 * remPx + 1);
    expect(d.width).toBeGreaterThan(i.width);
  });

  test('the wheel and the inspector share one top edge on desktop, and stack on a phone (#801)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const dial = page.locator('.chart-workbench-dial');
    const inspector = page.locator('.selection-inspector');

    // Desktop: the wheel card and the inspector start on the same line, within 2px.
    for (const [width, height] of [
      [1280, 800],
      [1600, 1000],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect(dial).toBeVisible();
      await expect(inspector).toBeVisible();
      const d = await dial.boundingBox();
      const i = await inspector.boundingBox();
      if (d === null || i === null) throw new Error('no boxes');
      expect(Math.abs(d.y - i.y)).toBeLessThanOrEqual(2);
    }

    // Phone: the inspector sits below the wheel, not beside it.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(inspector).toBeVisible();
    const dPhone = await dial.boundingBox();
    const iPhone = await inspector.boundingBox();
    if (dPhone === null || iPhone === null) throw new Error('no boxes');
    expect(iPhone.y).toBeGreaterThanOrEqual(dPhone.y + dPhone.height - 1);
  });

  test('the chart wheel sits fully in view at 1280x800 without scrolling (#801)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openNatalChart(page);
    const wheel = page.locator('.chart-workbench-dial svg').first();
    await expect(wheel).toBeVisible();
    const box = await wheel.boundingBox();
    if (box === null) throw new Error('no wheel box');
    const viewportHeight = page.viewportSize()?.height ?? 0;
    expect(await page.evaluate('window.scrollY')).toBe(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeLessThan(viewportHeight);
    expect(box.y + box.height).toBeLessThanOrEqual(viewportHeight);
  });

  test('with a body selected at 1280x800 and the Overlays drawer closed, the wheel and the Selection card both sit above the fold (#817)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await page.locator('.chart-point[data-body="sun"]').click();
    const inspector = page.locator('.selection-inspector');
    await expect(inspector.locator('.selection-inspector-facts')).toContainText('Sun');
    const viewportHeight = page.viewportSize()?.height ?? 0;
    const wheel = await page.locator('.chart-workbench-dial .chart-wheel svg').first().boundingBox();
    const card = await inspector.boundingBox();
    if (wheel === null || card === null) throw new Error('no boxes');
    // The card is capped to the mockup's clamp(350px, 55vh, 580px) and scrolls inside itself.
    expect(card.y + card.height).toBeLessThanOrEqual(viewportHeight);
    expect(wheel.y + wheel.height).toBeLessThanOrEqual(viewportHeight);
    expect(await page.evaluate('window.scrollY')).toBe(0);
    // The inspector is 24rem at most (336px at a 14px root) so the wheel keeps its 46rem minimum beside it.
    expect(card.width).toBeLessThanOrEqual(24 * 14 + 1);
  });

  test('with the device degree-symbol setting off, the Sabian tier is gone from the Selection card (#817, D-817b)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.evaluate("localStorage.setItem('astraya:showDegreeSymbol', 'false')");
    await openNatalChart(page);
    await page.locator('.chart-point[data-body="sun"]').click();
    await expect(page.locator('.selection-inspector .selection-inspector-facts')).toContainText('Sun');
    await expect(page.locator('.selection-inspector .selection-sabian')).toHaveCount(0);
    await page.evaluate("localStorage.setItem('astraya:showDegreeSymbol', 'true')");
    await page.reload();
    await openNatalChart(page);
    await page.locator('.chart-point[data-body="sun"]').click();
    await expect(page.locator('.selection-inspector .selection-sabian')).toHaveCount(1);
  });

  test('selecting something fills the inspector in place, without moving it', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
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

  test('a house number on the wheel selects that house, in the inspector and in its table row (#511)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const inspector = page.locator('.selection-inspector');

    await page.locator('.chart-house[data-house="5"]').click();
    await expect(inspector.locator('.chart-isolation-head strong')).toContainText('on the cusp of house 5');
    await expect(page.locator('.chart-house[data-house="6"]')).toHaveClass(/chart-dimmed/);

    // The same selection is on the Placements table, reachable and clearable from the keyboard.
    await page.getByRole('link', { name: 'Placements', exact: true }).click();
    await expect(page.locator('tr.data-table-row-selected')).toContainText('5');
    await page.getByRole('button', { name: 'Clear', exact: true }).first().click();
    await expect(page.locator('tr.data-table-row-selected')).toHaveCount(0);
    await page.getByRole('link', { name: 'Wheel', exact: true }).click();
    await expect(inspector).toContainText('to explore it');
  });

  test('the chart row pins Overlays and Extended settings at the far right, drops the static prefix, and folds both into Chart actions at 40rem and below (#817, #818)', async () => {
    test.setTimeout(90_000);
    const overlays = page.locator('.tab-row button.chart-overlay-trigger');
    const tabRow = page.locator('.tab-row');
    const settings = page.locator('.tab-row button.extended-settings-trigger');
    const toggle = page.getByRole('button', { name: 'Chart actions', exact: true });
    const box = async (locator: Locator): Promise<{ left: number; right: number }> => {
      const rect = await locator.boundingBox();
      if (rect === null) throw new Error('expected the element to have a layout box');
      return { left: rect.x, right: rect.x + rect.width };
    };

    // The static "Extended settings:" text is gone at every width, and no in-flow Overlays row sits under the tab row.
    const noPrefixNoRow = async (): Promise<void> => {
      await expect(page.locator('.tab-row__prefix')).toHaveCount(0);
      await expect(page.locator('.chart-view-prefix')).toHaveCount(0);
      await expect(page.getByText('Extended settings:', { exact: true })).toHaveCount(0);
      await expect(page.locator('button.primitive-disclosure-trigger', { hasText: 'overlay settings' })).toHaveCount(0);
    };

    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(toggle).toBeHidden();
    await expect(settings).toBeVisible();
    await expect(overlays).toBeVisible();
    // Pinned outside the scroller: both triggers sit wholly to the right of the scroll viewport; Extended settings ends the row.
    const viewport = await box(page.locator('.tab-row__viewport'));
    const row = await box(tabRow);
    const overlaysBox = await box(overlays);
    const settingsBox = await box(settings);
    expect(overlaysBox.left).toBeGreaterThanOrEqual(viewport.right);
    expect(overlaysBox.right).toBeLessThanOrEqual(settingsBox.left);
    expect(settingsBox.right).toBeCloseTo(row.right, 0);
    await noPrefixNoRow();

    // Overlays opens a right slide-over drawer, not an in-flow row, and the wheel stays visible beside it.
    const drawer = page.locator('.chart-overlay-settings dialog');
    await overlays.click();
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('data-placement', 'right');
    await expect(page.locator('div.chart-wheel')).toBeVisible();
    const drawerBox = await drawer.boundingBox();
    if (drawerBox === null) throw new Error('expected the drawer to have a layout box');
    expect(drawerBox.x + drawerBox.width).toBeGreaterThan(1270);
    expect(drawerBox.width).toBeLessThanOrEqual(42 * 16 + 1);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(overlays).toBeFocused();

    const select = page.locator('.tab-row .chart-view-select select');
    const strip = page.locator('.tab-row__tabs');
    const pinned = async (): Promise<void> => {
      await expect(toggle).toBeHidden();
      await expect(strip).toBeVisible();
      await expect(select).toBeHidden();
      await expect(settings).toBeVisible();
      await expect(overlays).toBeVisible();
      await expect(page.locator('.tab-row__viewport').locator(settings)).toHaveCount(0);
      await expect(page.locator('.tab-row__viewport').locator(overlays)).toHaveCount(0);
      await noPrefixNoRow();
    };
    const collapsed = async (): Promise<void> => {
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(select).toBeVisible();
      await expect(strip).toBeHidden();
      await expect(settings).toBeHidden();
      await expect(overlays).toBeHidden();
      await noPrefixNoRow();
    };

    // At 40rem and below (390px) the labelled select replaces the tabs and Overlays and Extended settings sit behind
    // the one "Chart actions" text toggle (a Button) until it is opened.
    await page.setViewportSize({ width: 390, height: 844 });
    await collapsed();
    await expect(page.locator('.tab-row__actions-toggle button.primitive-button-compact')).toHaveText(/^Chart actions/);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(settings).toBeVisible();
    await expect(overlays).toBeVisible();
    // The sheet holds exactly Overlays and Extended settings.
    await expect(page.locator('.tab-row__actions-panel > *')).toHaveCount(2);
    await expect(page.locator('.tab-row__actions-panel .chart-overlay-trigger')).toHaveCount(1);
    await overlays.click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    // Closing the drawer also closes the sheet and puts focus on its toggle.
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // 640px is the inclusive edge of the narrow rule (max-width: 40rem): still the select and the toggle.
    await page.setViewportSize({ width: 640, height: 900 });
    await collapsed();
    await toggle.click();
    await expect(overlays).toBeVisible();
    await expect(settings).toBeVisible();
    await toggle.click();

    // 641px is the first width above it: the scrolling strip shows and both triggers are pinned.
    await page.setViewportSize({ width: 641, height: 900 });
    await pinned();

    // Tablet (768px) is above 40rem too: the scrolling tab row, no labelled select, both triggers pinned.
    await page.setViewportSize({ width: 768, height: 1024 });
    await pinned();
  });

  test('the chart tab row scrolls with the wheel, its fades follow the hidden tabs and never catch pointer events, and the touch-pan CSS contract holds (#818)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const scroller = page.locator('.tab-row__scroll');
    const startFade = page.locator('.tab-row__fade--start');
    const endFade = page.locator('.tab-row__fade--end');
    interface ScrollMetrics {
      readonly left: number;
      readonly max: number;
      readonly scrollWidth: number;
      readonly clientWidth: number;
    }
    // The page has no DOM typings in e2e, so the browser-side reads are strings, as elsewhere in these specs.
    const metrics = async (): Promise<ScrollMetrics> =>
      page.evaluate<ScrollMetrics>(`(() => {
        const el = document.querySelector('.tab-row__scroll');
        return { left: el.scrollLeft, max: el.scrollWidth - el.clientWidth, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      })()`);

    // The row overflows at 1280px, so there are tabs for the fades to point at.
    await expect.poll(async () => (await metrics()).scrollWidth > (await metrics()).clientWidth).toBe(true);

    // Touch-capable CSS contract (computed styles only; touch momentum itself is not exercised headlessly).
    await expect(scroller).toHaveCSS('overflow-x', 'auto');
    await expect(scroller).toHaveCSS('touch-action', 'pan-x');
    await expect(scroller).toHaveCSS('overscroll-behavior-x', 'contain');
    await expect(scroller).toHaveCSS('scrollbar-width', 'none');

    // At the start only the end fade shows.
    await expect.poll(async () => (await metrics()).left).toBe(0);
    await expect(endFade).toHaveCSS('opacity', '1');
    await expect(startFade).toHaveCSS('opacity', '0');

    // A real wheel over the row moves the tabs sideways, to the far end.
    const rect = await scroller.boundingBox();
    if (rect === null) throw new Error('expected the scroll container to have a layout box');
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await expect
      .poll(async () => {
        await page.mouse.wheel(0, 400);
        const { left, max } = await metrics();
        return left > 0 && left >= max - 1;
      })
      .toBe(true);
    await expect(startFade).toHaveCSS('opacity', '1');
    await expect(endFade).toHaveCSS('opacity', '0');

    // Neither fade takes pointer events, and the point under each one belongs to something else.
    for (const fade of [startFade, endFade]) {
      await expect(fade).toHaveCSS('pointer-events', 'none');
    }
    for (const fade of [startFade, endFade]) {
      const box = await fade.boundingBox();
      if (box === null) throw new Error('expected the fade to have a layout box');
      const topClass = await page.evaluate(
        `document.elementFromPoint(${String(box.x + box.width / 2)}, ${String(box.y + box.height / 2)})?.className ?? ''`,
      );
      expect(String(topClass)).not.toContain('tab-row__fade');
    }
  });
});
