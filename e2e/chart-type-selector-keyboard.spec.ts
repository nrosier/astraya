/**
 * The chart type, aspect family and consultation preset selects are reachable by keyboard on a phone (#1224): at
 * 390x844 each is focusable, Tab visits them in DOM order (chart type, then aspects shown, then preset), and each
 * shows a focus-visible ring when focused.
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

// On the Wheel tab the instrument bar's pills replace the family Select (#1532), so the row holds two pills (#1545).
const LABELS = ['Chart type', 'Consultation preset'] as const;

test('Tab reaches chart type and consultation preset in order, each with a visible focus ring (#1224, #1532)', async () => {
  await openSharedPerson(page, baseUrl, EINSTEIN);
  // The header's Charts link lives in the wide rail; open the chart there, then shrink to the phone viewport.
  await openChart(page, 'Natal');
  await page.setViewportSize({ width: 390, height: 844 });

  const selects = LABELS.map((label) => page.getByRole('button', { name: label }));
  for (const select of selects) await expect(select).toBeVisible();

  // Start from the first pill, then Tab: the next stop must be the other pill. A key press first makes the
  // programmatic focus count as keyboard focus, so `:focus-visible` matches (the preceding click would not).
  await page.keyboard.press('Escape');
  await selects[0]?.focus();
  for (const [index, label] of LABELS.entries()) {
    const select = selects[index];
    if (select === undefined) throw new Error('missing select');
    await expect(select, `${label} is focused`).toBeFocused();
    const focusVisible =
      String(await page.evaluate("String(document.activeElement?.matches(':focus-visible'))")) === 'true';
    expect(focusVisible, `${label} shows focus-visible`).toBe(true);
    const outlineStyle = String(await page.evaluate('getComputedStyle(document.activeElement).outlineStyle'));
    const outlineWidth = String(await page.evaluate('getComputedStyle(document.activeElement).outlineWidth'));
    const shadow = String(await page.evaluate('getComputedStyle(document.activeElement).boxShadow'));
    const drawsIndicator = (outlineStyle !== 'none' && outlineWidth !== '0px') || shadow !== 'none';
    expect(drawsIndicator, `${label} draws a focus indicator`).toBe(true);
    if (index < LABELS.length - 1) await page.keyboard.press('Tab');
  }
});
