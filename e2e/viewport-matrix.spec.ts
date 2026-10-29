/**
 * The required viewport matrix (#514, `docs/ui/UI-UX_IMPLEMENTATION_PLAN.md` §9): the screens a person actually uses —
 * People, the person's Overview, the natal chart in each view, Transits, the PDF builder, Preferences — at 390×844,
 * 768×1024, 1280×800, 1440×900 and 3440×1440, in both themes: nothing scrolls sideways, and axe finds no WCAG 2 A/AA
 * violation. A layout regression at one size, or a colour that fails in one theme, fails here by name.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 3440, height: 1440 },
] as const;
const THEMES = ['light', 'dark'] as const;

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

// A fresh context per test, holding the shared people (#799); the test only reads them.
test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

async function expectSound(page: Page, what: string): Promise<void> {
  const sideways = await page.evaluate<boolean>(
    'document.documentElement.scrollWidth > document.documentElement.clientWidth + 1',
  );
  expect(sideways, `${what}: the page scrolls sideways`).toBe(false);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    `${what}: accessibility`,
  ).toEqual([]);
}

/**
 * Bottom edges of the multi-card pages (#895). Where two cards or columns sit side by side (the same top edge),
 * they must end on one straight line. Stacked cards have no shared row, so they are not compared. The check
 * reads rendered boxes only and never forces a height.
 */
const BOTTOM_EDGE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
  { width: 3440, height: 1440 },
] as const;

interface EdgeReport {
  /** Bottom edges of the side-by-side boxes, or empty when the boxes are stacked. */
  readonly bottoms: number[];
  readonly count: number;
}

async function sideBySideBottoms(page: Page, selector: string): Promise<EdgeReport> {
  // A string expression, as `expectSound` uses: the e2e tsconfig has no DOM types for an `$$eval` callback.
  return page.evaluate<EdgeReport>(`(() => {
    const rects = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    const first = rects[0];
    if (first === undefined) return { bottoms: [], count: 0 };
    const row = rects.filter((r) => Math.abs(r.top - first.top) <= 1);
    return { bottoms: row.length > 1 ? row.map((r) => r.bottom) : [], count: rects.length };
  })()`);
}

for (const theme of THEMES) {
  test(`the bottom row of multi-card pages shares one bottom edge in the ${theme} theme`, async () => {
    await page.addInitScript((mode) => {
      localStorage.setItem('astraya.theme', mode);
    }, theme);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    const id = /#\/people\/([^/]+)/.exec(page.url())?.[1];
    expect(id).toBeDefined();
    const pages: readonly {
      readonly name: string;
      readonly hash: string;
      readonly ready: string;
      readonly cards: string;
    }[] = [
      {
        name: 'consultation',
        hash: `#/people/${id ?? ''}/consultation`,
        ready: '.consultation-grid',
        cards: '.consultation-grid > .consultation-col',
      },
      {
        name: 'horary',
        hash: '#/explore/horary',
        ready: '.horary-form',
        cards: '.horary-form > .horary-card',
      },
    ];
    for (const viewport of BOTTOM_EDGE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const target of pages) {
        await page.goto(`${baseUrl}/${target.hash}`);
        await expect(page.locator(target.ready)).toBeVisible({ timeout: 30_000 });
        const { bottoms, count } = await sideBySideBottoms(page, target.cards);
        const label = `${target.name} at ${String(viewport.width)}×${String(viewport.height)} (${theme})`;
        expect(count, `${label}: the page has cards`).toBeGreaterThan(0);
        if (bottoms.length === 0) continue;
        const spread = Math.max(...bottoms) - Math.min(...bottoms);
        expect(spread, `${label}: side-by-side bottom edges ${bottoms.join(', ')} do not align`).toBeLessThanOrEqual(1);
      }
    }
  });
}

for (const theme of THEMES) {
  test(`the main screens hold at every required viewport in the ${theme} theme`, async () => {
    test.setTimeout(240_000);
    await page.addInitScript((mode) => {
      localStorage.setItem('astraya.theme', mode);
    }, theme);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    const personUrl = page.url().replace(/\/(birth-record|overview).*$/, '');
    const id = /#\/people\/([^/]+)/.exec(page.url())?.[1];
    expect(id).toBeDefined();
    const screens: readonly (readonly [string, string])[] = [
      ['people', '#/people'],
      ['overview', `#/people/${id ?? ''}/overview`],
      ['natal wheel', `#/people/${id ?? ''}/charts/natal/wheel`],
      ['natal aspects', `#/people/${id ?? ''}/charts/natal/aspects`],
      ['natal placements', `#/people/${id ?? ''}/charts/natal/placements`],
      ['natal patterns', `#/people/${id ?? ''}/charts/natal/patterns`],
      ['natal matrix', `#/people/${id ?? ''}/charts/natal/matrix`],
      ['natal elements and modalities', `#/people/${id ?? ''}/charts/natal/elements`],
      ['transits', `#/people/${id ?? ''}/timing/transits`],
      ['PDF builder', '#/documents/pdf'],
      ['preferences', '#/preferences'],
    ];
    expect(personUrl).toContain('#/people/');
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const [name, hash] of screens) {
        await page.goto(`${baseUrl}/${hash}`);
        // Each screen is a lazy chunk (and a store open) behind a "Loading…" status; the heading is the app's
        // ready signal. Under parallel load that hand-off outlasts the 5s default, so wait for it explicitly
        // (still bounded) rather than race it — axe must never scan the loading placeholder.
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
        await expectSound(page, `${name} at ${String(viewport.width)}×${String(viewport.height)} (${theme})`);
      }
    }
  });
}
