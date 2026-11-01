/**
 * The Selection card overhangs the chart wheel equally (#817 owner decision): it starts one
 * spacing token above the wheel's top and ends the same distance below the wheel's bottom.
 * The token is --space-6 (1.5rem), the nearest token to 20px; no token equals 20px exactly.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { openNatalChart } from './support.ts';

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

test.describe('Selection card overhang (#817)', () => {
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
    test(`the card overhangs the wheel by one token above and below, equally, at ${String(width)}x${String(height)}`, async () => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height });
      await openSharedPerson(page, baseUrl, EINSTEIN);
      await openNatalChart(page);
      const wheel = await page.locator('.chart-workbench-dial .chart-wheel svg').first().boundingBox();
      const card = await page.locator('.selection-inspector').boundingBox();
      if (wheel === null || card === null) throw new Error('no boxes');
      const token = Number(
        await page.evaluate(
          "parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-6')) * parseFloat(getComputedStyle(document.documentElement).fontSize)",
        ),
      );
      const above = wheel.y - card.y;
      const below = card.y + card.height - (wheel.y + wheel.height);
      console.log(
        `[overhang ${String(width)}x${String(height)}] wheel top=${wheel.y.toFixed(2)} bottom=${(wheel.y + wheel.height).toFixed(2)} h=${wheel.height.toFixed(2)} | card top=${card.y.toFixed(2)} bottom=${(card.y + card.height).toFixed(2)} h=${card.height.toFixed(2)} | above=${above.toFixed(2)} below=${below.toFixed(2)} token=${token.toFixed(2)}`,
      );
      expect(Math.abs(above - token)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(below - token)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(above - below)).toBeLessThanOrEqual(0.5);
    });
  }
});
