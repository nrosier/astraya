/**
 * The chart workbench layout (#511): the dial, then its SelectionInspector straight after it in
 * DOM order; one column below a 68rem workbench container, two columns (7fr dial, 5fr inspector, #801) at 68rem
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
    const show = page.getByRole('button', { name: 'Show Pisces on the chart', exact: true }).first();
    await show.focus();
    await page.keyboard.press('Enter');
    await expect(show).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.chart-selection-bar')).toContainText('Pisces');

    await page.getByRole('link', { name: 'Wheel', exact: true }).click();
    await expect(page.locator('.selection-inspector-facts .chart-isolation-head strong')).toHaveText('Pisces');
    await expect(page.locator('.chart-sign[data-sign="gemini"]')).toHaveClass(/chart-dimmed/);

    await page.getByRole('link', { name: 'Placements', exact: true }).click();
    await show.focus();
    await page.keyboard.press('Space');
    await expect(show).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.chart-selection-bar')).toHaveCount(0);
  });

  test('a derived point is selectable from the Placements table by keyboard, with its position in the inspector (#511)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page, 'Placements');
    // Part of Spirit is hidden until switched on (#542), like Part of Fortune.
    await openSettings(page);
    // The checkbox's accessible name now disambiguates visible/participates in aspects (#585).
    await page
      .locator('dialog.settings-card')
      .getByRole('checkbox', { name: 'Part of Spirit — visible', exact: true })
      .check();
    await applySettings(page);
    const show = page.getByRole('button', { name: 'Show Part of Spirit on the chart', exact: true });
    await show.focus();
    await page.keyboard.press('Enter');
    await expect(show).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('tr.data-table-row-selected')).toContainText('Part of Spirit');

    await page.getByRole('link', { name: 'Wheel', exact: true }).click();
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
    await show.focus();
    await page.keyboard.press('Enter');
    await expect(show).toHaveAttribute('aria-pressed', 'false');
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
    const tracks = d.width + i.width;
    expect(Math.abs(d.width - (tracks * 7) / 12)).toBeLessThanOrEqual(3);
    expect(Math.abs(i.width - (tracks * 5) / 12)).toBeLessThanOrEqual(3);
    expect(d.width).toBeGreaterThan(i.width);
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
    const show = page.getByRole('button', { name: 'Show House 5 on the chart', exact: true });
    await expect(show).toHaveAttribute('aria-pressed', 'true');
    await show.focus();
    await page.keyboard.press('Enter');
    await expect(show).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('link', { name: 'Wheel', exact: true }).click();
    await expect(inspector).toContainText('to explore it');
  });

  test('the chart row pins Extended settings at the far right and collapses it at 40rem and below, while Overlays stays in flow under the row (#818, #826)', async () => {
    test.setTimeout(90_000);
    const overlays = page.locator('.chart-overlay-settings button.primitive-disclosure-trigger');
    const tabRow = page.locator('.tab-row');
    const settings = page.locator('.tab-row button.extended-settings-trigger');
    const toggle = page.getByRole('button', { name: 'Chart actions', exact: true });
    const box = async (locator: Locator): Promise<{ left: number; right: number }> => {
      const rect = await locator.boundingBox();
      if (rect === null) throw new Error('expected the element to have a layout box');
      return { left: rect.x, right: rect.x + rect.width };
    };

    // Overlays is a full-width Disclosure row in the page flow directly under the tab row, closed by default, never
    // inside the pinned cluster or the Chart actions popover, at every width.
    const inFlow = async (): Promise<void> => {
      await expect(overlays).toBeVisible();
      await expect(overlays).toHaveAttribute('aria-expanded', 'false');
      await expect(overlays).toContainText('Show overlay settings');
      await expect(tabRow.locator(overlays)).toHaveCount(0);
      const row = await tabRow.boundingBox();
      const trigger = await overlays.boundingBox();
      if (row === null || trigger === null) throw new Error('expected layout boxes');
      expect(trigger.y).toBeGreaterThanOrEqual(row.y + row.height - 1);
      expect(trigger.width).toBeGreaterThan(row.width / 2);
    };

    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(toggle).toBeHidden();
    await expect(settings).toBeVisible();
    // Pinned outside the scroller: Extended settings sits wholly to the right of the scroll viewport and ends the row.
    const viewport = await box(page.locator('.tab-row__viewport'));
    const row = await box(tabRow);
    const settingsBox = await box(settings);
    expect(settingsBox.left).toBeGreaterThanOrEqual(viewport.right);
    expect(settingsBox.right).toBeCloseTo(row.right, 0);
    await inFlow();

    const select = page.locator('.tab-row .chart-view-select select');
    const strip = page.locator('.tab-row__tabs');
    const pinned = async (): Promise<void> => {
      await expect(toggle).toBeHidden();
      await expect(strip).toBeVisible();
      await expect(select).toBeHidden();
      await expect(settings).toBeVisible();
      await expect(page.locator('.tab-row__viewport').locator(settings)).toHaveCount(0);
      await inFlow();
    };
    const collapsed = async (): Promise<void> => {
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(select).toBeVisible();
      await expect(strip).toBeHidden();
      await expect(settings).toBeHidden();
      await inFlow();
    };

    // At 40rem and below (390px) the labelled select replaces the tabs and Extended settings sits behind the one
    // "Chart actions" text toggle (a Button) until it is opened.
    await page.setViewportSize({ width: 390, height: 844 });
    await collapsed();
    await expect(page.locator('.tab-row__actions-toggle button.primitive-button-compact')).toHaveText(/^Chart actions/);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(settings).toBeVisible();
    // The popover holds only Extended settings.
    await expect(page.locator('.tab-row__actions-panel').locator(overlays)).toHaveCount(0);
    await expect(page.locator('.tab-row__actions-panel > *')).toHaveCount(1);
    await toggle.click();

    // 640px is the inclusive edge of the narrow rule (max-width: 40rem): still the select and the toggle.
    await page.setViewportSize({ width: 640, height: 900 });
    await collapsed();

    // 641px is the first width above it: the scrolling strip shows and Extended settings is pinned.
    await page.setViewportSize({ width: 641, height: 900 });
    await pinned();

    // Tablet (768px) is above 40rem too: the scrolling tab row, no labelled select, Extended settings pinned.
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
