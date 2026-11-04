/**
 * The sub-view navigation of the four multi-view sections (#1050): Transits & forecast, Progressions & directions,
 * Relationship charts and Tools. Ordinary route links in the shared tab row, styled like the chart view links;
 * every link reachable by keyboard with a visible focus ring; the labelled Select at 40rem and below inside a
 * landmark (axe `region`); the Horary page placing its row exactly where the other Tools pages do; and the row
 * holding at 390x844, 1280x800 and 3440x1440 in both themes.
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
  { width: 1280, height: 800 },
  { width: 3440, height: 1440 },
] as const;
const THEMES = ['light', 'dark'] as const;

let dir: string;
let app: FastifyInstance;
let baseUrl: string;
let context: BrowserContext;
let page: Page;
let personId = '';

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
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSharedPerson(page, baseUrl, EINSTEIN);
  personId = /#\/people\/([^/]+)/.exec(page.url())?.[1] ?? '';
  expect(personId).not.toBe('');
});

test.afterEach(async () => {
  await context.close();
});

interface Section {
  readonly name: string;
  readonly label: string;
  readonly hash: (id: string) => string;
}

const SECTIONS: readonly Section[] = [
  { name: 'Transits & forecast', label: 'Transits & Forecast subtabs', hash: (id) => `#/people/${id}/timing/transits` },
  {
    name: 'Progressions & directions',
    label: 'Progressions & Directions subtabs',
    hash: (id) => `#/people/${id}/timing/profections`,
  },
  {
    name: 'Relationship charts',
    label: 'Relationship Charts subtabs',
    hash: (id) => `#/people/${id}/relationships/synastry`,
  },
  { name: 'Tools', label: 'Tools subtabs', hash: () => '#/explore/cycles' },
  { name: 'Tools (Horary)', label: 'Tools subtabs', hash: () => '#/explore/horary' },
];

async function openSection(section: Section): Promise<void> {
  await page.goto(`${baseUrl}/${section.hash(personId)}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
}

test('sub-view links are ordinary links with no tab role, in every group', async () => {
  test.setTimeout(120_000);
  for (const section of SECTIONS) {
    await openSection(section);
    const nav = page.getByRole('navigation', { name: section.label });
    await expect(nav).toBeVisible();
    await expect(nav.locator('[role="tab"], [role="tablist"]')).toHaveCount(0);
    expect(await nav.getByRole('link').count(), `${section.name}: links`).toBeGreaterThan(1);
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
  }
});

test('sub-view links share the chart view links style: colour, weight, size, padding and the active rule', async () => {
  test.setTimeout(120_000);
  const read = async (selector: string): Promise<Record<string, string>> => {
    const style = await page.evaluate<Record<string, string> | null>(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (element === null) return null;
      const style = getComputedStyle(element);
      const pick = (name) => style.getPropertyValue(name);
      return {
        color: pick('color'),
        fontSize: pick('font-size'),
        fontWeight: pick('font-weight'),
        padding: pick('padding'),
        borderBottomWidth: pick('border-bottom-width'),
        borderBottomColor: pick('border-bottom-color'),
        textDecorationLine: pick('text-decoration-line'),
      };
    })()`);
    if (style === null) throw new Error(`no element for ${selector}`);
    expect(style.fontSize, selector).toMatch(/px$/);
    return style;
  };

  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`${baseUrl}/#/people/${personId}/charts/natal/wheel`);
    await expect(page.locator('nav.chart-view-nav a[aria-current="page"]')).toBeVisible({ timeout: 30_000 });
    const chartActive = await read('nav.chart-view-nav a[aria-current="page"]');
    const chartIdle = await read('nav.chart-view-nav a:not([aria-current])');

    await page.goto(`${baseUrl}/#/explore/cycles`);
    const nav = page.getByRole('navigation', { name: 'Tools subtabs' });
    await expect(nav.locator('a[aria-current="page"]')).toBeVisible({ timeout: 30_000 });
    expect(await read('nav[aria-label="Tools subtabs"] a[aria-current="page"]'), `active (${theme})`).toEqual(
      chartActive,
    );
    expect(await read('nav[aria-label="Tools subtabs"] a:not([aria-current])'), `idle (${theme})`).toEqual(chartIdle);
  }
});

test('keyboard: Tab reaches the sub-view links, and every focus ring is visible', async () => {
  test.setTimeout(120_000);
  for (const section of SECTIONS) {
    await openSection(section);
    const nav = page.getByRole('navigation', { name: section.label });
    const links = nav.getByRole('link');
    const count = await links.count();

    // Real Tab presses walk every link in order, and each one shows a focus indicator (:focus-visible).
    await links.first().focus();
    await page.keyboard.press('Shift+Tab');
    for (let index = 0; index < count; index += 1) {
      await page.keyboard.press('Tab');
      const link = links.nth(index);
      await expect(link).toBeFocused();
      const outline = await page.evaluate<{ width: string; style: string }>(
        `(() => ({ width: getComputedStyle(document.activeElement).outlineWidth, style: getComputedStyle(document.activeElement).outlineStyle }))()`,
      );
      expect(outline.style, `${section.name} link ${String(index)} focus ring`).not.toBe('none');
      expect(outline.width, `${section.name} link ${String(index)} focus ring width`).not.toBe('0px');
    }

    // Tab order: from the first link, Tab moves to the next link.
    await links.first().focus();
    await page.keyboard.press('Tab');
    await expect(links.nth(1)).toBeFocused();
  }
});

for (const theme of THEMES) {
  test(`at 390x844 the sub-view Select sits in a landmark: axe region passes on every group (${theme})`, async () => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const section of SECTIONS) {
      await openSection(section);
      await expect(page.locator('.tab-row__fallback')).toBeVisible();
      await expect(page.locator('.tab-row__tabs')).toBeHidden();
      const results = await new AxeBuilder({ page }).withRules(['region']).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
        `${section.name} (${theme})`,
      ).toEqual([]);
    }
  });
}

test('the Horary page shows its sub-view row where the other Tools pages do', async () => {
  test.setTimeout(120_000);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const boxes: Record<string, { x: number; y: number; width: number }> = {};
    for (const tool of ['cycles', 'eclipses', 'horary', 'electional']) {
      await page.goto(`${baseUrl}/#/explore/${tool}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
      const row = page.locator('.section-nav');
      const box = await row.boundingBox();
      if (box === null) throw new Error(`${tool}: no sub-view row`);
      boxes[tool] = { x: box.x, y: box.y, width: box.width };
      // The row is the first thing in the content column, above the page's own <main>.
      const aboveMain = await page.evaluate<number>(
        `(() => { const row = document.querySelector('.section-nav'); return row.compareDocumentPosition(document.querySelector('main')) & 4; })()`,
      );
      expect(aboveMain, `${tool}: row precedes main`).toBeGreaterThan(0);
    }
    const reference = boxes.cycles;
    for (const [tool, box] of Object.entries(boxes)) {
      expect(box, `${tool} at ${String(viewport.width)}`).toEqual(reference);
    }
  }
});

for (const theme of THEMES) {
  test(`the sub-view row holds at 390x844, 1280x800 and 3440x1440 in the ${theme} theme`, async () => {
    test.setTimeout(240_000);
    await page.emulateMedia({ colorScheme: theme });
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const section of SECTIONS) {
        await openSection(section);
        const what = `${section.name} at ${String(viewport.width)}x${String(viewport.height)} (${theme})`;
        const sideways = await page.evaluate<boolean>(
          'document.documentElement.scrollWidth > document.documentElement.clientWidth + 1',
        );
        expect(sideways, `${what}: scrolls sideways`).toBe(false);
        const narrow = viewport.width <= 640;
        await expect(page.locator('.section-nav .tab-row__fallback')).toBeVisible({ visible: narrow });
        await expect(page.locator('.section-nav .tab-row__tabs')).toBeVisible({ visible: !narrow });
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).include('.section-nav').analyze();
        expect(
          axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
          `${what}: accessibility`,
        ).toEqual([]);
      }
    }
  });
}
