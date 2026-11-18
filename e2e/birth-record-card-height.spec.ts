/**
 * Birth record cards size to their content (#1729, owner decision 2026-11-18, reversing the #895 shared bottom edge for
 * this page only). At 1280×800 and 390×844 every birth-record card ends right after its last visible child, plus its own
 * bottom padding and border: no card is stretched to fill empty space beside a taller neighbour. The Location card, which
 * used to absorb the slack, is the one this guards.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
] as const;

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

interface CardReport {
  readonly className: string;
  readonly height: number;
  /** Distance from the last visible child's bottom edge to the card's bottom border edge. */
  readonly gap: number;
  /**
   * The room a content-sized card legitimately keeps below its last child: the card's bottom padding and border, the
   * last child's bottom margin (the field spacing) and the card's grid gap (owner decision 2026-11-18, #1729).
   */
  readonly allowance: number;
}

// A string expression, as elsewhere in this spec folder: the e2e tsconfig has no DOM types for an `evaluate` callback.
const CARD_REPORT_SCRIPT = `(() => {
  return Array.from(document.querySelectorAll('.birth-record > .birth-record-column > .birth-record-card')).map((card) => {
    const box = card.getBoundingClientRect();
    const style = getComputedStyle(card);
    const visible = Array.from(card.children).filter((child) => child.getClientRects().length > 0 && child.getBoundingClientRect().height > 0);
    const last = visible[visible.length - 1];
    const lastBottom = last === undefined ? box.top : last.getBoundingClientRect().bottom;
    const lastMargin = last === undefined ? 0 : parseFloat(getComputedStyle(last).marginBottom);
    return {
      className: card.className,
      height: box.height,
      gap: box.bottom - lastBottom,
      allowance: parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth) + lastMargin + parseFloat(style.rowGap),
    };
  });
})()`;

test('birth record cards are sized by their content at 1280x800 and 390x844 (#1729)', async () => {
  test.setTimeout(120_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  const id = /#\/people\/([^/]+)/.exec(page.url())?.[1];
  expect(id).toBeDefined();
  const stretched: string[] = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/#/people/${id ?? ''}/birth-record`);
    await expect(page.locator('.birth-record')).toBeVisible({ timeout: 30_000 });
    const cards = await page.evaluate<CardReport[]>(CARD_REPORT_SCRIPT);
    const label = `${String(viewport.width)}x${String(viewport.height)}`;
    expect(cards.length, `${label}: the birth record has cards`).toBeGreaterThan(0);
    const location = cards.find((card) => card.className.includes('birth-record-card--location'));
    console.log(`location card ${label}: ${(location?.height ?? 0).toFixed(2)}px`);
    for (const card of cards) {
      if (card.gap > card.allowance + 1) {
        stretched.push(
          `${label}: ${card.className} ends ${card.gap.toFixed(2)}px below its last child (allowance ${card.allowance.toFixed(2)}px plus 1px)`,
        );
      }
    }
  }
  expect(stretched, 'birth record cards stretched past their content').toEqual([]);
});
