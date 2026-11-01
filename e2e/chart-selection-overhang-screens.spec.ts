/**
 * The Selection card overhangs the chart wheel equally on every single-wheel chart screen (#817): one
 * --space-6 above the wheel's top and the same below its bottom. Every screen that draws its wheel through
 * ChartDataView shares one workbench, so each is measured the same way, at 1280x800 and 3440x1440.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { gotoAndSettle, openChart } from './support.ts';

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

interface Measure {
  readonly screen: string;
  readonly width: number;
  readonly height: number;
  readonly above: number;
  readonly below: number;
  readonly token: number;
  readonly wheelH: number;
  readonly cardH: number;
}

async function measure(page: Page, screen: string, width: number, height: number): Promise<Measure> {
  await page.setViewportSize({ width, height });
  const wheel = await page.locator('.chart-workbench-dial .chart-wheel svg').first().boundingBox();
  const card = await page.locator('.chart-workbench .selection-inspector').first().boundingBox();
  if (wheel === null || card === null)
    throw new Error(`${screen}: no wheel or card box at ${String(width)}x${String(height)}`);
  const token = Number(
    await page.evaluate(
      "parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-6')) * parseFloat(getComputedStyle(document.documentElement).fontSize)",
    ),
  );
  const result: Measure = {
    screen,
    width,
    height,
    above: wheel.y - card.y,
    below: card.y + card.height - (wheel.y + wheel.height),
    token,
    wheelH: wheel.height,
    cardH: card.height,
  };
  console.log(
    `[screen ${screen} ${String(width)}x${String(height)}] wheel ${wheel.y.toFixed(2)}..${(wheel.y + wheel.height).toFixed(2)} (h ${wheel.height.toFixed(2)}) | card ${card.y.toFixed(2)}..${(card.y + card.height).toFixed(2)} (h ${card.height.toFixed(2)}) | above ${result.above.toFixed(2)} below ${result.below.toFixed(2)} token ${token.toFixed(2)}`,
  );
  return result;
}

function expectOverhang(m: Measure): void {
  expect(Math.abs(m.above - m.token), `${m.screen} above`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(m.below - m.token), `${m.screen} below`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(m.above - m.below), `${m.screen} equal`).toBeLessThanOrEqual(0.5);
}

test.describe('Selection card overhang on every single-wheel chart screen (#817)', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    context = await newSeededContext(browser, baseUrl);
    page = await context.newPage();
  });

  test.afterEach(async () => {
    await context.close();
  });

  for (const [width, height] of [
    [1280, 800],
    [3440, 1440],
  ] as const) {
    test(`natal, draconic, harmonic and relocated wheels overhang equally at ${String(width)}x${String(height)}`, async () => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height });
      await openSharedPerson(page, baseUrl, EINSTEIN);
      await openChart(page, 'Natal');
      const natal = await measure(page, 'natal', width, height);
      expectOverhang(natal);
      for (const type of ['Draconic', 'Harmonic'] as const) {
        await openChart(page, type);
        await expect(page.locator('.chart-workbench-dial .chart-wheel svg').first()).toBeVisible();
        expectOverhang(await measure(page, type.toLowerCase(), width, height));
      }
      // Relocated draws its wheel only once a location is saved (see relocated-chart-golden-path.spec.ts).
      await openChart(page, 'Relocated');
      await page.getByLabel('Relocation latitude', { exact: true }).fill('-33.8688');
      await page.getByLabel('Relocation longitude', { exact: true }).fill('151.2093');
      await page.getByLabel('Save this location as', { exact: true }).fill('Sydney');
      await page.getByRole('button', { name: 'Save location', exact: true }).click();
      await expect(page.locator('.chart-workbench-dial .chart-wheel svg').first()).toBeVisible();
      expectOverhang(await measure(page, 'relocated', width, height));
    });
  }

  for (const [width, height] of [
    [1280, 800],
    [3440, 1440],
  ] as const) {
    test(`composite overhangs equally at ${String(width)}x${String(height)}`, async () => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height });
      await openSharedPerson(page, baseUrl, EINSTEIN);
      await page.getByRole('link', { name: 'Relationship Charts', exact: true }).click();
      await page.getByRole('link', { name: 'Composite', exact: true }).click();
      await page.getByLabel('Compose with').selectOption({ label: 'Max Born' });
      await expect(page.locator('.chart-workbench-dial .chart-wheel svg').first()).toBeVisible();
      expectOverhang(await measure(page, 'composite', width, height));
    });

    test(`horary overhangs equally at ${String(width)}x${String(height)}`, async () => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height });
      await gotoAndSettle(page, `${baseUrl}/#/explore/horary`);
      await page.getByLabel('Date the question was asked').fill('2024-03-08');
      await page.getByLabel('Local time').fill('12:00');
      await page.getByLabel('Latitude', { exact: true }).fill('51.5072');
      await page.getByLabel('Longitude', { exact: true }).fill('-0.1276');
      await page.getByRole('button', { name: 'Cast chart', exact: true }).click();
      await expect(page.locator('.chart-workbench-dial .chart-wheel svg').first()).toBeVisible();
      expectOverhang(await measure(page, 'horary', width, height));
    });

    test(`solar and lunar returns overhang equally at ${String(width)}x${String(height)}`, async () => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height });
      await openSharedPerson(page, baseUrl, EINSTEIN);
      await openChart(page, 'Solar return');
      await expect(page.locator('.chart-workbench-dial .chart-wheel svg').first()).toBeVisible();
      expectOverhang(await measure(page, 'solar-return', width, height));
      await openChart(page, 'Lunar return');
      await expect(page.locator('.chart-workbench-dial .chart-wheel svg').first()).toBeVisible();
      expectOverhang(await measure(page, 'lunar-return', width, height));
    });
  }
});
