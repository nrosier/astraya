/**
 * Journey 5 of the final acceptance list (#514): "Expand line meanings without guessing that a triangle is
 * interactive." On Einstein's shared Astrocartography page, each "What the lines mean" entry must announce itself
 * as a control before it is touched: a real button with a text label, a count and an `aria-expanded` state, not a
 * bare triangle.
 *
 * Step -> box text:
 *   1. Without guessing  -> before any click the entry is a focusable button (not a bare glyph) named "Show meanings",
 *                           carries the "4 line types selected" count, and is collapsed (`aria-expanded=false`).
 *   2. Expand            -> a keyboard Enter on the focused button expands it: the label flips to "Hide meanings",
 *                           `aria-expanded` is true and the written text appears, not the mechanical fallback.
 *   3. Collapse          -> pressing it again hides the text and restores "Show meanings".
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
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

test('each line meaning is a labelled, counted, collapsed button that expands from the keyboard', async () => {
  test.setTimeout(90_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Astrocartography', exact: true }).click();
  await expect(page.locator('div.acg-map svg')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What the lines mean', level: 2 })).toBeVisible();

  const entry = page.locator('.acg-meanings .primitive-disclosure').first();
  const button = entry.getByRole('button');
  const meaning = entry.locator('dd').first();

  // 1. Before any interaction it already reads as a control.
  await expect(button).toBeVisible();
  await expect(button).toContainText('Show meanings');
  await expect(button).toContainText('4 line types selected');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(meaning).toBeHidden();

  // 2. Keyboard expand.
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toContainText('Hide meanings');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(meaning).toBeVisible();
  await expect(meaning).not.toContainText('Sun on the Midheaven line.');
  await expect.poll(async () => ((await meaning.textContent()) ?? '').length).toBeGreaterThan(40);

  // 3. Collapse again.
  await page.keyboard.press('Enter');
  await expect(button).toContainText('Show meanings');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(meaning).toBeHidden();
});
