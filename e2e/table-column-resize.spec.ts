/**
 * Resizable table columns (#1301): on the Placements table a keyboard step and a pointer drag on a header's resize
 * handle change that column's real width, and a reload starts unresized (widths are not stored).
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

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

test('a column resizes by keyboard and by drag, and sorting still works (#1301)', async () => {
  test.setTimeout(60_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openNatalChart(page, 'Placements');

  const table = page.getByRole('table').first();
  const header = table.locator('thead th').first();
  const handle = header.getByRole('separator');
  const widthOf = async (): Promise<number> => (await header.boundingBox())?.width ?? 0;

  const before = await widthOf();
  await handle.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(widthOf).toBeGreaterThan(before + 40);

  const afterKey = await widthOf();
  const box = await handle.boundingBox();
  if (box === null) throw new Error('no handle box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(widthOf).toBeGreaterThan(afterKey + 40);

  await header.getByRole('button').first().click();
  await expect(header).toHaveAttribute('aria-sort', 'ascending');

  await page.reload();
  await expect(page.getByRole('table').first().locator('col')).toHaveCount(0);
});
