/**
 * The chart wheel sits above the fold at 1280x800 on every chart page (#1013, contract #801 and #817).
 * Natal sets the reference; Draconic, Harmonic, Solar return and Lunar return must match it. Each wheel's
 * bottom edge must be at or above 800px, and the Selection card must be above the fold too.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { openChart } from './support.ts';

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

const FOLD = 800;

test.describe('chart wheel above the fold at 1280x800 (#1013)', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    context = await newSeededContext(browser, baseUrl);
    page = await context.newPage();
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('natal, draconic, harmonic, solar return and lunar return wheels all sit above 800px', async () => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    const results: string[] = [];
    for (const type of ['Natal', 'Draconic', 'Harmonic', 'Solar return', 'Lunar return'] as const) {
      await openChart(page, type);
      const wheelSvg = page.locator('.chart-workbench-dial .chart-wheel svg').first();
      await expect(wheelSvg).toBeVisible();
      const wheel = await wheelSvg.boundingBox();
      const card = await page.locator('.chart-workbench .selection-inspector').first().boundingBox();
      if (wheel === null || card === null) throw new Error(`${type}: no wheel or card box`);
      const wheelBottom = wheel.y + wheel.height;
      const cardBottom = card.y + card.height;
      results.push(
        `${type}: wheel ${wheel.y.toFixed(1)}..${wheelBottom.toFixed(1)} card ${card.y.toFixed(1)}..${cardBottom.toFixed(1)}`,
      );
      expect.soft(wheelBottom, `${type} wheel bottom`).toBeLessThanOrEqual(FOLD);
      expect.soft(card.y + card.height, `${type} card bottom`).toBeLessThanOrEqual(FOLD);
    }
    console.log(results.join('\n'));
  });
});
