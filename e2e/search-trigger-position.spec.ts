/**
 * The search trigger sits in the workspace utility row above every person page, and it stays put as the user moves
 * between routes (#1769, Step 1). At the desktop reference viewports the trigger must be the rightmost visible control
 * in that row, and its position must match on every route within 1px. At 390x844 the row is hidden and the trigger sits
 * beside the Menu button instead. Checked on People, Overview, Consultation and Progressions & Directions for Einstein.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';

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

test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly right: number;
  readonly bottom: number;
}

async function rectOf(locator: Locator): Promise<Rect> {
  // boundingBox() does not wait, so the element must be visible first.
  await expect(locator).toBeVisible();
  const rect = await locator.boundingBox();
  if (rect === null) throw new Error('expected the element to have a layout box');
  return { x: rect.x, y: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height };
}

/** The four routes the trigger position is checked on, each reached by a click in the nav like a user would. */
/** The four routes the trigger position is checked on. People is the page the test opens first, so it has no click. */
const ROUTES: readonly { readonly name: string; readonly link: string | undefined }[] = [
  { name: 'People', link: undefined },
  { name: 'Overview', link: 'Overview' },
  { name: 'Consultation', link: 'Consultation' },
  { name: 'Progressions & Directions', link: 'Progressions & Directions' },
];

test.describe('search trigger position', () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 3440, height: 1440 },
  ]) {
    test(`at ${String(viewport.width)}x${String(viewport.height)} the trigger is the rightmost control of the utility row and keeps one position on every route (#1769)`, async () => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await openSharedPerson(page, baseUrl, EINSTEIN);
      const trigger = page.locator('.workspace-utility .app-nav-search');
      const positions: { route: string; rect: Rect }[] = [];

      for (const route of ROUTES) {
        if (route.link !== undefined) await page.getByRole('link', { name: route.link, exact: true }).click();
        await expect(trigger).toBeVisible();
        const rect = await rectOf(trigger);
        positions.push({ route: route.name, rect });

        // Every other visible control in the row must sit to the left of the trigger's right edge. The DOM is read in a
        // string script: the e2e tsconfig has no DOM types (as in chart-type-selector-layout.spec.ts).
        const rights = await page.evaluate<number[]>(
          "[...document.querySelectorAll('.workspace-utility *')].filter((e) => !e.closest('.app-nav-search') && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0).map((e) => e.getBoundingClientRect().right)",
        );
        for (const right of rights)
          expect(right, `${route.name}: control right edge`).toBeLessThanOrEqual(rect.right + 0.5);
        expect(await page.locator('.workspace-utility').count(), `${route.name}: one utility row`).toBe(1);
      }

      const [first, ...rest] = positions;
      if (first === undefined) throw new Error('no positions measured');
      for (const { route, rect } of rest) {
        expect(Math.abs(rect.x - first.rect.x), `${route}: x matches People`).toBeLessThanOrEqual(1);
        expect(Math.abs(rect.y - first.rect.y), `${route}: y matches People`).toBeLessThanOrEqual(1);
      }
    });
  }

  test('at 390x844 the utility row is hidden and the trigger sits beside the Menu button (#1650, #1769)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await expect(page.locator('.workspace-utility')).toBeHidden();
    const trigger = await rectOf(page.locator('.app-nav-search'));
    const menu = await rectOf(page.getByRole('button', { name: 'Menu', exact: true }));
    // Beside: the two share a row and sit close together, the trigger on the Menu button's left.
    expect(trigger.y).toBeLessThan(menu.bottom);
    expect(menu.y).toBeLessThan(trigger.bottom);
    expect(Math.abs(trigger.right - menu.x)).toBeLessThanOrEqual(32);
  });
});
