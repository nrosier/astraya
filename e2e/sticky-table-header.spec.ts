/**
 * Sticky table column headers (#1065, rule from #825): on a tall table the header row stays pinned at the top of
 * its scroll frame while the rows pass.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
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

test('a tall table keeps its header row at the top of the scroll frame while scrolling (#1065)', async ({
  browser,
}) => {
  test.setTimeout(60_000);

  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openNatalChart(page);
  await page.getByRole('link', { name: 'Placements', exact: true }).click();

  const frame = page.locator('.data-table-scroll-tall').first();
  await expect(frame).toBeVisible();
  const header = frame.locator('thead th').first();

  const scrolled = await page.evaluate(`(() => {
    const el = document.querySelector('.data-table-scroll-tall');
    el.scrollTop = el.scrollHeight;
    return el.scrollTop;
  })()`);
  expect(scrolled).toBeGreaterThan(0);

  const frameBox = await frame.boundingBox();
  const headerBox = await header.boundingBox();
  if (frameBox === null || headerBox === null) throw new Error('no bounding box');
  // The frame has a 1px border; the header sits at the top of its padding box.
  expect(Math.abs(headerBox.y - (frameBox.y + 1))).toBeLessThanOrEqual(1);
  await context.close();
});
