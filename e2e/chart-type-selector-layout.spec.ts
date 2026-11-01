/**
 * Every chart page uses the same chart-type selector layout (#981, owner decision 2026-11-01): the back link sits
 * above the page heading, the "Chart type" label sits above its select, and the select is the same height as the
 * view bar under it. Checked for each chart type at the two reference viewports, 1280x800 and 3440x1440.
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

const CHART_TYPE_LABELS = ['Natal', 'Draconic', 'Harmonic', 'Solar return', 'Lunar return', 'Relocated'] as const;

/** Computed CSS values of the selector wrapper, its field and its label. */
interface SelectorStyles {
  wrapperMarginTop: string;
  wrapperMarginBottom: string;
  fieldGap: string;
  labelMarginBottom: string;
}

/**
 * The selector's measured design values on one chart page: the select height, the view bar height (null on a page
 * with no view bar, such as Relocated, which has no tabs), plus the styles.
 */
interface SelectorMetrics extends SelectorStyles {
  selectHeight: number;
  viewBarHeight: number | null;
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 3440, height: 1440 },
]) {
  test.describe(`at ${String(viewport.width)}x${String(viewport.height)}`, () => {
    test.use({ viewport });

    /** Computed design values of the selector wrapper, its select and the view bar, read per chart type. */
    async function selectorMetrics(): Promise<SelectorMetrics> {
      const select = await box(page.getByLabel('Chart type', { exact: true }));
      const viewBarLocator = page.locator('.tab-row__viewport').first();
      const hasViewBar = (await viewBarLocator.count()) > 0;
      const viewBarHeight = hasViewBar ? (await box(viewBarLocator)).height : null;
      const styles = await page.evaluate<SelectorStyles | null>(
        "(() => { const w = document.querySelector('.chart-type-select'); const f = w && w.querySelector('.primitive-field'); const l = w && w.querySelector('label'); if (!w || !l) return null; const ws = getComputedStyle(w); return { wrapperMarginTop: ws.marginTop, wrapperMarginBottom: ws.marginBottom, fieldGap: f ? getComputedStyle(f).rowGap : '', labelMarginBottom: getComputedStyle(l).marginBottom }; })()",
      );
      if (styles === null) throw new Error('chart type selector is not rendered');
      return { selectHeight: select.height, viewBarHeight, ...styles };
    }

    for (const type of CHART_TYPE_LABELS) {
      test(`${type}: the chart type select is the same height as the view bar`, async () => {
        await openSharedPerson(page, baseUrl, EINSTEIN);
        await openChart(page, type);

        const metrics = await selectorMetrics();
        // Relocated has no view bar (no tabs), so there is nothing to match against; the design-value test covers it.
        if (metrics.viewBarHeight === null) {
          expect(type).toBe('Relocated');
          return;
        }
        expect(Math.abs(metrics.selectHeight - metrics.viewBarHeight)).toBeLessThanOrEqual(0.5);
      });

      test(`${type}: the back link sits above the heading and the label sits above the select`, async () => {
        await openSharedPerson(page, baseUrl, EINSTEIN);
        await openChart(page, type);

        const back = await box(page.locator('main p.back').first());
        const heading = await box(page.getByRole('heading', { level: 1 }));
        expect(back.bottom).toBeLessThanOrEqual(heading.top);

        const label = await box(page.locator('.chart-type-select label'));
        const select = await box(page.getByLabel('Chart type', { exact: true }));
        expect(label.bottom).toBeLessThanOrEqual(select.top);
      });
    }

    test('every chart type uses the same selector design values (height, margins, gap)', async () => {
      test.setTimeout(120_000);
      const rows: { type: string; metrics: SelectorMetrics }[] = [];
      for (const type of CHART_TYPE_LABELS) {
        await openSharedPerson(page, baseUrl, EINSTEIN);
        await openChart(page, type);
        rows.push({ type, metrics: await selectorMetrics() });
      }
      const [first, ...rest] = rows;
      if (first === undefined) throw new Error('no chart types measured');
      for (const row of rest) {
        // The view bar is absent on Relocated, so its height is compared only where both pages have one.
        const comparable = (metrics: SelectorMetrics): Omit<SelectorMetrics, 'viewBarHeight'> => ({
          selectHeight: metrics.selectHeight,
          wrapperMarginTop: metrics.wrapperMarginTop,
          wrapperMarginBottom: metrics.wrapperMarginBottom,
          fieldGap: metrics.fieldGap,
          labelMarginBottom: metrics.labelMarginBottom,
        });
        expect({ type: row.type, ...comparable(row.metrics) }).toEqual({
          type: row.type,
          ...comparable(first.metrics),
        });
      }
    });
  });
}
