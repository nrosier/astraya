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
