/**
 * The life-event picker in a page header (#1770), on Progressions & Directions and Solar Arc at 390x844, 1280x800
 * and 3440x1440, with Einstein given one life event. The visible "Life event" label is gone from the header (its
 * accessible name stays), the select and the Export toggle share a height and their top and bottom edges line up,
 * and the category filter popover opens and closes without moving the row. The Return page keeps its label and is
 * not covered here.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
  { width: 3440, height: 1440 },
] as const;
const PAGES = [
  { name: 'Progressions & Directions', tab: 'Progressions', hash: 'timing/progressions' },
  { name: 'Solar Arc', tab: 'Solar Arc', hash: 'timing/solar-arc' },
] as const;

let dir: string;
let app: Awaited<ReturnType<typeof build>>;
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

/** Adds one life event to Einstein through the Life events drawer, so the picker has something to list. */
async function giveEinsteinOneEvent(page: Page): Promise<string> {
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('heading', { name: /Identity and birth timestamp/ }).waitFor();
  await page.getByRole('button', { name: 'Manage Life Events' }).click();
  await page.locator('dialog.life-events-drawer[open]').waitFor({ state: 'visible' });
  await page.getByLabel('Date of the new event').fill('1905-06-30');
  await page.getByLabel('Description of the new event').fill('Miracle year');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  // The quick-add row has no category, and the filter only appears for events that have one, so give the new
  // event a category through its row editor.
  await page.getByRole('button', { name: 'Edit life event: Miracle year' }).click();
  await page.locator('.life-events-edit-row').getByLabel('Category', { exact: true }).selectOption('marriage');
  await page.getByRole('button', { name: 'Save row', exact: true }).click();
  await page.getByRole('button', { name: 'Save and close' }).click();
  await page.locator('dialog.life-events-drawer[open]').waitFor({ state: 'hidden' });
  const id = /#\/people\/([^/]+)/.exec(page.url())?.[1];
  if (id === undefined) throw new Error('no person id in the URL');
  return id;
}

async function openTiming(page: Page, personId: string, hash: string): Promise<void> {
  await page.goto(`${baseUrl}/#/people/${personId}/${hash}`);
  await page.locator('.life-event-picker select').first().waitFor({ state: 'visible' });
  // Export renders alongside the picker; wait for it so the header measurement does not race the page.
  await page.locator('.page-header-actions .page-header-export-toggle').waitFor({ state: 'visible' });
}

interface Edges {
  readonly selectTop: number;
  readonly selectBottom: number;
  readonly selectHeight: number;
  readonly exportTop: number;
  readonly exportBottom: number;
  readonly exportHeight: number;
  readonly selectRight: number;
  readonly exportLeft: number;
}

async function headerEdges(page: Page): Promise<Edges> {
  return page.evaluate<Edges>(`(() => {
    const select = document.querySelector('.page-header-actions .life-event-picker select');
    const exportToggle = document.querySelector('.page-header-actions .page-header-export-toggle');
    if (select === null || exportToggle === null) throw new Error('picker or Export missing from the header');
    const s = select.getBoundingClientRect();
    const e = exportToggle.getBoundingClientRect();
    return {
      selectTop: s.top, selectBottom: s.bottom, selectHeight: s.height,
      exportTop: e.top, exportBottom: e.bottom, exportHeight: e.height,
      selectRight: s.right, exportLeft: e.left,
    };
  })()`);
}

for (const viewport of VIEWPORTS) {
  for (const target of PAGES) {
    test(`${target.name} at ${String(viewport.width)}x${String(viewport.height)}: no visible label, equal row, filter popover`, async ({
      browser,
    }) => {
      test.setTimeout(120_000);
      const context: BrowserContext = await newSeededContext(browser, baseUrl, { viewport });
      const page = await context.newPage();
      const personId = await giveEinsteinOneEvent(page);
      await openTiming(page, personId, target.hash);

      // The visible label is hidden in the header: the sr-only label is clipped to 1px, so Playwright's visibility
      // check still sees it. Assert the visual hiding itself; the select keeps the accessible name "Life event".
      const header = page.locator('.page-header-actions');
      const label = await page.evaluate<{ cls: string; width: number; height: number }>(`(() => {
        const el = document.querySelector('.page-header-actions .life-event-picker label');
        if (el === null) throw new Error('no picker label in the header');
        const r = el.getBoundingClientRect();
        return { cls: el.className, width: r.width, height: r.height };
      })()`);
      expect(label.cls).toContain('sr-only');
      expect(label.width).toBeLessThanOrEqual(1);
      expect(label.height).toBeLessThanOrEqual(1);
      await expect(page.getByRole('combobox', { name: 'Life event', exact: true })).toBeVisible();

      const before = await headerEdges(page);
      // Equal heights always. The shared top and bottom edges are asserted at 1280px and 3440px. At 390px the brief
      // allows the row to wrap, so only heights are asserted there; in the measured build the row does stay on one line.
      expect(
        Math.abs(before.selectHeight - before.exportHeight),
        'select and Export heights match',
      ).toBeLessThanOrEqual(1);
      if (viewport.width > 390) {
        expect(Math.abs(before.selectTop - before.exportTop), 'top edges line up').toBeLessThanOrEqual(1);
        expect(Math.abs(before.selectBottom - before.exportBottom), 'bottom edges line up').toBeLessThanOrEqual(1);
      }

      // The filter popover opens and closes, and the row does not move.
      const filter = header.getByRole('button', { name: 'Filter by category', exact: true });
      await filter.click();
      await expect(filter).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('.primitive-popover-panel')).toBeVisible();
      const during = await headerEdges(page);
      expect(during.selectTop).toBeCloseTo(before.selectTop, 0);
      expect(during.exportTop).toBeCloseTo(before.exportTop, 0);

      await page.keyboard.press('Escape');
      await expect(filter).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('.primitive-popover-panel')).toHaveCount(0);
      const after = await headerEdges(page);
      expect(after.selectTop).toBeCloseTo(before.selectTop, 0);
      expect(after.exportTop).toBeCloseTo(before.exportTop, 0);

      await context.close();
    });
  }
}
