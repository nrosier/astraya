/**
 * Every chart page uses the same chart-type selector layout (#981, owner decision 2026-11-01): the back link sits
 * above the page heading, the "Chart type" label sits inline beside its pill (#1545), and the pill is the same height as the
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
  await expect.soft(locator, 'element visible').toBeVisible();
  // The chart page re-renders when a pill commits a new type (#1545), so the element can be re-mounted between the
  // visibility check and the measurement; poll until it has a box again.
  await expect.poll(async () => (await locator.boundingBox()) !== null).toBe(true);
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
    async function selectorMetrics(type: (typeof CHART_TYPE_LABELS)[number]): Promise<SelectorMetrics> {
      // Wait for the pill to show this type before measuring: it re-mounts as the page settles on the new chart (#1545).
      await expect(page.getByRole('button', { name: 'Chart type' })).toContainText(type);
      const select = await box(page.getByRole('button', { name: 'Chart type' }));
      // Owner decision (2026-11-14): the view bar is hidden on Relocated, so its height is not measured there; every
      // other chart type still has its pill compared against the view bar.
      const viewBarLocator = page.locator('.tab-row__viewport').first();
      const hasViewBar = type !== 'Relocated' && (await viewBarLocator.count()) > 0;
      const viewBarHeight = hasViewBar ? (await box(viewBarLocator)).height : null;
      const styles = await page.evaluate<SelectorStyles | null>(
        "(() => { const w = document.querySelector('.chart-type-select'); const p = w && w.querySelector('.primitive-pill-select'); const l = w && w.querySelector('.primitive-pill-select-label'); if (!w || !l || !p) return null; const ws = getComputedStyle(w); return { wrapperMarginTop: ws.marginTop, wrapperMarginBottom: ws.marginBottom, fieldGap: getComputedStyle(p).columnGap, labelMarginBottom: getComputedStyle(l).marginBottom }; })()",
      );
      if (styles === null) throw new Error('chart type selector is not rendered');
      return { selectHeight: select.height, viewBarHeight, ...styles };
    }

    for (const type of CHART_TYPE_LABELS) {
      test(`${type}: the chart type select is the same height as the view bar`, async () => {
        await openSharedPerson(page, baseUrl, EINSTEIN);
        await openChart(page, type);

        const metrics = await selectorMetrics(type);
        // Relocated has no view bar (no tabs), so there is nothing to match against; the design-value test covers it.
        if (metrics.viewBarHeight === null) {
          expect.soft(type, 'only Relocated has no view bar').toBe('Relocated');
          return;
        }
        expect
          .soft(
            Math.abs(metrics.selectHeight - metrics.viewBarHeight),
            `${type} at ${String(viewport.width)}: select height (${String(metrics.selectHeight)}) equals view bar (${String(metrics.viewBarHeight)})`,
          )
          .toBeLessThanOrEqual(0.5);
      });

      test(`${type}: the back link sits above the heading and the label sits beside the pill`, async () => {
        await openSharedPerson(page, baseUrl, EINSTEIN);
        await openChart(page, type);

        const back = await box(page.locator('p.back').first());
        const heading = await box(page.getByRole('heading', { level: 1 }));
        expect
          .soft(back.bottom, `${type} at ${String(viewport.width)}: back link above the heading`)
          .toBeLessThanOrEqual(heading.top);
        // Moved from natal-chart-selector-layout.spec.ts (#1093): the natal chart has no separate title row.
        if (type === 'Natal')
          await expect
            .soft(page.locator('.chart-title-row'), `Natal at ${String(viewport.width)}: no title row`)
            .toHaveCount(0);

        // The pill draws its label inline (#1545): the label sits to the left of the pill, not above it.
        const label = await box(page.locator('.chart-type-select .primitive-pill-select-label'));
        const pill = await box(page.getByRole('button', { name: 'Chart type' }));
        expect
          .soft(label.top, `${type} at ${String(viewport.width)}: label on the pill's row`)
          .toBeLessThanOrEqual(pill.bottom);
      });
    }

    for (const type of ['Natal', 'Draconic'] as const) {
      test(`${type}: chart type and consultation preset sit side by side in one row; the Wheel tab has no family Select (#1224, #1532)`, async () => {
        await openSharedPerson(page, baseUrl, EINSTEIN);
        await openChart(page, type);

        // On the Wheel tab the instrument bar's Hard, Soft and Minor pills replace the family Select (owner, 2026-11-13).
        await expect(page.getByLabel('Aspects shown', { exact: true })).toHaveCount(0);
        const selects = [
          await box(page.getByRole('button', { name: 'Chart type' })),
          await box(page.getByRole('button', { name: 'Consultation preset' })),
        ];
        const wheel = await box(page.locator('div.chart-wheel'));
        const [first, ...rest] = selects;
        if (first === undefined) throw new Error('no selects measured');
        for (const [index, select] of rest.entries()) {
          expect
            .soft(Math.abs(select.top - first.top), `${type}: select ${String(index + 2)} top`)
            .toBeLessThanOrEqual(1);
          expect.soft(select.height, `${type}: select ${String(index + 2)} height`).toBeCloseTo(first.height, 0);
        }
        for (const select of selects)
          expect.soft(select.bottom, `${type}: selects above the wheel`).toBeLessThanOrEqual(wheel.top);
      });
    }

    test('the PDF link is the rightmost action of a chart page header (owner review 2026-11-07)', async () => {
      await openSharedPerson(page, baseUrl, EINSTEIN);
      await openChart(page, 'Natal');
      const xs = await page.evaluate<number[]>(
        "[...document.querySelectorAll('.page-header-actions > *')].map((e) => e.getBoundingClientRect().x)",
      );
      const pdf = await page.evaluate<number>(
        "document.querySelector('.page-header-actions > .chart-pdf-link').getBoundingClientRect().x",
      );
      expect(pdf).toBe(Math.max(...xs));
    });

    test('every chart type uses the same selector design values (height, margins, gap)', async () => {
      test.setTimeout(120_000);
      const rows: { type: string; metrics: SelectorMetrics }[] = [];
      for (const type of CHART_TYPE_LABELS) {
        await openSharedPerson(page, baseUrl, EINSTEIN);
        await openChart(page, type);
        rows.push({ type, metrics: await selectorMetrics(type) });
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
        expect
          .soft(
            { type: row.type, ...comparable(row.metrics) },
            `${row.type} at ${String(viewport.width)}: same design values as ${first.type}`,
          )
          .toEqual({
            type: row.type,
            ...comparable(first.metrics),
          });
      }
    });
  });
}
