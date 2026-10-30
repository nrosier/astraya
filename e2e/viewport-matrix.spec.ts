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

/**
 * The 90% rule (#895, `docs/ui/UI-UX_GUIDELINES.md` section 10.1): where cards or columns sit side by side, the
 * shorter one is at least 90% of the taller one. Measured on natural content height, so the stretch that aligns the
 * bottom edges cannot hide a shortfall: the probe sets the row to `align-items: start` and releases the last card's
 * grow, then reads the boxes. It changes nothing the page ships.
 *
 * Horary meets 90% at every measured width. Consultation is held to 0.895, the floor the owner accepted on 2026-10-30
 * (the two columns differ by 80px at 1280×800 and 3440×1440); it is still measured and reported.
 */
const NINETY_PERCENT = 0.9;
const CONSULTATION_FLOOR = 0.895;

interface RatioReport {
  readonly heights: number[];
  readonly count: number;
}

interface PageTarget {
  readonly name: string;
  readonly hash: string;
  readonly ready: string;
  readonly cards: string;
}

async function naturalHeights(page: Page, selector: string): Promise<RatioReport> {
  await page.addStyleTag({
    content:
      '.consultation-grid, .horary-form { align-items: start !important; } .consultation-col > :last-child { flex-grow: 0 !important; }',
  });
  return page.evaluate<RatioReport>(`(() => {
    const rects = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, height: r.height };
    });
    const first = rects[0];
    if (first === undefined) return { heights: [], count: 0 };
    const row = rects.filter((r) => Math.abs(r.top - first.top) <= 1);
    return { heights: row.length > 1 ? row.map((r) => r.height) : [], count: rects.length };
  })()`);
}

/** Measures one page's side-by-side row at every bottom-edge viewport, appending one report line per width. */
async function measureRatios(
  page: Page,
  baseUrl: string,
  target: PageTarget,
  report: string[],
): Promise<{ readonly label: string; readonly ratio: number }[]> {
  const out: { readonly label: string; readonly ratio: number }[] = [];
  for (const viewport of BOTTOM_EDGE_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/${target.hash}`);
    await expect(page.locator(target.ready)).toBeVisible({ timeout: 30_000 });
    const { heights } = await naturalHeights(page, target.cards);
    const label = `${target.name} ${String(viewport.width)}x${String(viewport.height)}`;
    if (heights.length === 0) {
      report.push(`${label}: stacked`);
      continue;
    }
    const ratio = Math.min(...heights) / Math.max(...heights);
    report.push(`${label}: ${ratio.toFixed(3)} (${heights.map((h) => String(Math.round(h))).join(' / ')})`);
    out.push({ label, ratio });
  }
  return out;
}

test('horary side-by-side cards keep the shorter at least 90% of the taller (#895)', async () => {
  test.setTimeout(120_000);
  const report: string[] = [];
  const ratios = await measureRatios(
    page,
    baseUrl,
    { name: 'horary', hash: '#/explore/horary', ready: '.horary-form', cards: '.horary-form > .horary-card' },
    report,
  );
  console.log(report.join('\n'));
  const short = ratios.filter((r) => r.ratio < NINETY_PERCENT).map((r) => `${r.label}: ${r.ratio.toFixed(3)}`);
  expect(short, 'horary shorter column below 90% of the taller').toEqual([]);
});

test('consultation side-by-side columns keep the owner-accepted floor (#895)', async () => {
  test.setTimeout(120_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  const id = /#\/people\/([^/]+)/.exec(page.url())?.[1];
  expect(id).toBeDefined();
  const report: string[] = [];
  const ratios = await measureRatios(
    page,
    baseUrl,
    {
      name: 'consultation',
      hash: `#/people/${id ?? ''}/consultation`,
      ready: '.consultation-grid',
      cards: '.consultation-grid > .consultation-col',
    },
    report,
  );
  console.log(report.join('\n'));
  const short = ratios.filter((r) => r.ratio < CONSULTATION_FLOOR).map((r) => `${r.label}: ${r.ratio.toFixed(3)}`);
  expect(short, 'consultation shorter column below the accepted floor').toEqual([]);
});

test('the horary astrological parameters card spans the full form width at 1280×800', async () => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseUrl}/#/explore/horary`);
  await expect(page.locator('.horary-form')).toBeVisible({ timeout: 30_000 });
  const widths = await page.evaluate<{ readonly card: number; readonly form: number }>(`(() => {
    const form = document.querySelector('.horary-form');
    const card = document.querySelector('.horary-card--wide');
    return {
      card: card === null ? 0 : card.getBoundingClientRect().width,
      form: form === null ? 0 : form.getBoundingClientRect().width,
    };
  })()`);
  expect(widths.card, 'parameters card width').toBeGreaterThan(0);
  expect(
    Math.abs(widths.card - widths.form),
    `card ${String(widths.card)} vs form ${String(widths.form)}`,
  ).toBeLessThanOrEqual(1);
});

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
