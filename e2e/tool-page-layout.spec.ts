/**
 * The tool-page layout (owner decision 2026-11-03; #1051-#1054): the search form and a side panel share a top zone,
 * side by side at desktop widths with the form the wider column, and stacked on a phone; the results run full width
 * below. The pair keeps the guidelines' 90% rule (§10.1 rule 2) at 1280×800 and 3440×1440, measured from each card's
 * natural height, as the #895 checks in `viewport-matrix.spec.ts` are.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { newSeededContext } from './shared-people.ts';
import { gotoAndSettle } from './support.ts';

interface ToolPage {
  readonly name: string;
  readonly hash: string;
  /** What marks the page as ready to measure: its first result, or the layout itself on a page that waits for input. */
  readonly ready: string;
  /** False where the owner accepted a measured shortfall from the 90% rule (§10.1: report it, do not force heights). */
  readonly balanced: boolean;
}

/** Each tool page, by route. */
const TOOL_PAGES: readonly ToolPage[] = [
  { name: 'Eclipses', hash: '#/explore/eclipses', ready: 'table', balanced: true },
  { name: 'Planetary cycles', hash: '#/explore/cycles', ready: 'svg.cycle-diagram', balanced: true },
  // No search runs on open, and the form has eleven controls: the panel is 0.33 of the form before a search and 0.62
  // after one. The owner accepted the shortfall on 2026-11-03 (#1052); the cards still stretch to one bottom edge.
  { name: 'Ephemeris research', hash: '#/explore/event-search', ready: '.tool-layout', balanced: false },
  // The rules take the side panel (owner decision 2026-11-03, #1053), in two columns, with the location controls on one
  // compact grid in the form (owner decision 2026-11-04): the pair now meets the 90% rule.
  { name: 'Electional search', hash: '#/explore/electional', ready: '.tool-layout', balanced: true },
];

const DESKTOP = [
  { width: 1280, height: 800 },
  { width: 3440, height: 1440 },
] as const;
const PHONE = { width: 390, height: 844 } as const;

interface Zone {
  readonly sideBySide: boolean;
  readonly widths: readonly number[];
  readonly heights: readonly number[];
  readonly resultsBelow: boolean;
}

/** Natural heights of the top zone's cards (the grid stops stretching them), and whether the results sit below. */
const ZONE = `(() => {
  const layout = document.querySelector('.tool-layout');
  if (layout === null) return null;
  const style = document.createElement('style');
  style.textContent = '.tool-layout { align-items: start !important; }';
  document.head.appendChild(style);
  const cards = Array.from(layout.children).map((c) => c.getBoundingClientRect());
  style.remove();
  const zone = layout.getBoundingClientRect();
  const table = document.querySelector('main table');
  return {
    sideBySide: cards.length === 2 && Math.abs(cards[0].top - cards[1].top) < 1,
    widths: cards.map((r) => r.width),
    heights: cards.map((r) => r.height),
    resultsBelow: table === null || table.getBoundingClientRect().top >= zone.bottom,
  };
})()`;

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

for (const tool of TOOL_PAGES) {
  test(`${tool.name}: form and panel side by side, balanced, results below; stacked on a phone`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const context = await newSeededContext(browser, baseUrl);
    const page = await context.newPage();
    try {
      for (const viewport of DESKTOP) {
        await page.setViewportSize(viewport);
        await gotoAndSettle(page, `${baseUrl}/${tool.hash}`);
        await expect(page.locator(`main ${tool.ready}`).first()).toBeVisible({ timeout: 60_000 });
        const zone = await page.evaluate<Zone | null>(ZONE);
        const at = `${tool.name} ${String(viewport.width)}x${String(viewport.height)}`;
        expect(zone, `${at}: .tool-layout`).not.toBeNull();
        if (zone === null) return;
        expect(zone.sideBySide, `${at}: form and panel side by side`).toBe(true);
        const [formWidth = 0, panelWidth = 0] = zone.widths;
        expect(formWidth, `${at}: the form is the wider column`).toBeGreaterThan(panelWidth);
        if (tool.balanced) {
          const ratio = Math.min(...zone.heights) / Math.max(...zone.heights);
          expect(ratio, `${at}: the shorter card is at least 90% of the taller`).toBeGreaterThanOrEqual(0.9);
        }
        expect(zone.resultsBelow, `${at}: the results sit below the top zone`).toBe(true);
      }

      await page.setViewportSize(PHONE);
      await gotoAndSettle(page, `${baseUrl}/${tool.hash}`);
      await expect(page.locator(`main ${tool.ready}`).first()).toBeVisible({ timeout: 60_000 });
      const phone = await page.evaluate<Zone | null>(ZONE);
      expect(phone?.sideBySide, `${tool.name} 390x844: stacked`).toBe(false);
      expect(
        await page.evaluate<boolean>('document.documentElement.scrollWidth > document.documentElement.clientWidth + 1'),
        `${tool.name} 390x844: no sideways scroll`,
      ).toBe(false);
    } finally {
      await context.close();
    }
  });
}
