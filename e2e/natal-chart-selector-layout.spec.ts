/**
 * The natal chart screen matches the derived chart pages' layout (#981, owner-approved 2026-11-01): the back link
 * sits above the page heading (not beside it), the "Chart type" label sits above its select (the shared stacked
 * field), and the select is the same height as the view bar. Measured at the two reference viewports, 1280x800
 * and 3440x1440, against the Draconic page, which is the reference for the back link and the label.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { openChart } from './support.ts';

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

async function box(locator: Locator): Promise<{ top: number; bottom: number; height: number }> {
  // boundingBox() does not wait, so the element must be visible first.
  await expect(locator).toBeVisible();
  const result = await locator.boundingBox();
  if (result === null) throw new Error('element has no bounding box');
  return { top: result.y, bottom: result.y + result.height, height: result.height };
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 3440, height: 1440 },
]) {
  test.describe(`at ${String(viewport.width)}x${String(viewport.height)}`, () => {
    test.use({ viewport });

    test('natal: the back link is not in the title row and sits above the page heading', async () => {
      await openSharedPerson(page, baseUrl, EINSTEIN);
      await openChart(page, 'Natal');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await expect(page.locator('.chart-title-row')).toHaveCount(0);
      const back = await box(page.locator('main p.back').first());
      const heading = await box(page.getByRole('heading', { level: 1 }));
      expect(back.bottom).toBeLessThanOrEqual(heading.top);
    });

    test('derived page (Draconic): the back link sits above the heading, the reference layout', async () => {
      await openSharedPerson(page, baseUrl, EINSTEIN);
      await openChart(page, 'Draconic');
      await expect(page.getByRole('heading', { name: /draconic/i, level: 1 })).toBeVisible();

      const back = await box(page.locator('main p.back').first());
      const heading = await box(page.getByRole('heading', { level: 1 }));
      expect(back.bottom).toBeLessThanOrEqual(heading.top);
    });

    for (const type of ['Natal', 'Draconic'] as const) {
      test(`${type}: the "Chart type" label sits above its select`, async () => {
        await openSharedPerson(page, baseUrl, EINSTEIN);
        await openChart(page, type);

        const label = await box(page.locator('.chart-type-select label'));
        const select = await box(page.getByLabel('Chart type', { exact: true }));
        expect(label.bottom).toBeLessThanOrEqual(select.top);
      });
    }

    test('natal: the chart type select is the same height as the view bar', async () => {
      await openSharedPerson(page, baseUrl, EINSTEIN);
      await openChart(page, 'Natal');

      const select = await box(page.getByLabel('Chart type', { exact: true }));
      const viewBar = await box(page.locator('.tab-row__viewport').first());
      expect(Math.abs(select.height - viewBar.height)).toBeLessThanOrEqual(0.5);
    });
  });
}
