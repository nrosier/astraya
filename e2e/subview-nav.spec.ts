/**
 * The sub-view navigation of the multi-view sections (#1050): Transits & forecast, Progressions & directions and
 * Relationship charts as ordinary links in the shared tab row, styled like the chart view links, every link
 * reachable by keyboard with a visible focus ring, the labelled Select at 40rem and below inside a landmark (axe
 * `region`); the Tools pages (#1139) as a "Tools" header with a Tabs bar and the Select fallback, and the frame
 * holding at 390x844, 1280x800 and 3440x1440 in both themes.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
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

interface LinkStyle {
  readonly color: string;
  readonly backgroundColor: string;
  readonly borderBottomColor: string;
  readonly fontWeight: string;
}

/** The colours and weight that decide how a tab-row link reads; read from computed style, never from source. */
async function linkStyle(link: Locator): Promise<LinkStyle> {
  const href = await link.getAttribute('href');
  if (href === null) throw new Error('the link has no href');
  return page.evaluate<LinkStyle>(
    `(() => {
      const element = Array.from(document.querySelectorAll('.tab-row__tabs > a')).find((a) => a.getAttribute('href') === ${JSON.stringify(href)});
      const style = getComputedStyle(element);
      return {
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderBottomColor: style.borderBottomColor,
        fontWeight: style.fontWeight,
      };
    })()`,
  );
}

/** The chart screen's ChartViewNav links (`.chart-view-nav`), on the natal wheel. */
async function openChartPage(): Promise<Locator> {
  await page.goto(`${baseUrl}/#/people/${personId}/charts/natal/wheel`);
  const nav = page.locator('nav.chart-view-nav');
  await expect(nav).toBeVisible({ timeout: 30_000 });
  return nav.getByRole('link');
}

test('hover: a sub-view link and a chart view link show the same hover colour and background (#1050)', async () => {
  test.setTimeout(120_000);
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 1280, height: 800 });

    const chartLinks = await openChartPage();
    const chartTarget = chartLinks.locator(':scope:not([aria-current="page"])').nth(0);
    const chartIdle = await linkStyle(chartTarget);
    await chartTarget.hover();
    const chartHover = await linkStyle(chartTarget);
    // A rest-to-hover change proves the hover rule applies at all, so the comparison below is not vacuous.
    expect(chartHover, `chart view hover changes the link (${theme})`).not.toEqual(chartIdle);

    for (const section of SECTIONS) {
      await openSection(section);
      const subLinks = page.getByRole('navigation', { name: section.label }).getByRole('link');
      const subTarget = subLinks.locator(':scope:not([aria-current="page"])').nth(0);
      const subIdle = await linkStyle(subTarget);
      await subTarget.hover();
      const subHover = await linkStyle(subTarget);
      expect(subHover, `${section.name} hover (${theme})`).not.toEqual(subIdle);
      expect(
        { color: subHover.color, backgroundColor: subHover.backgroundColor },
        `${section.name} hover matches chart view hover (${theme})`,
      ).toEqual({ color: chartHover.color, backgroundColor: chartHover.backgroundColor });
    }
  }
});

test('active: the open sub-view link and the open chart view link share the active style (#1050)', async () => {
  test.setTimeout(120_000);
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 1280, height: 800 });

    await openChartPage();
    const chartActive = await linkStyle(page.locator('nav.chart-view-nav a[aria-current="page"]'));
    for (const section of SECTIONS) {
      await openSection(section);
      const subActive = await linkStyle(
        page.getByRole('navigation', { name: section.label }).locator('a[aria-current="page"]'),
      );
      expect(subActive, `${section.name} active style (${theme})`).toEqual(chartActive);
    }
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

const TOOL_HASHES = ['cycles', 'event-search', 'eclipses', 'horary', 'electional', 'rectification'] as const;

test('every Tools page has a Tools h1, a Tabs bar with the tool open, and its own name as a section heading (#1139)', async () => {
  test.setTimeout(120_000);
  for (const tool of TOOL_HASHES) {
    await page.goto(`${baseUrl}/#/explore/${tool}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const tabs = page.getByRole('tablist', { name: 'Tools subtabs' });
    await expect(tabs.getByRole('tab')).toHaveCount(TOOL_HASHES.length);
    await expect(tabs.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    await expect(page.locator(`#tools-panel-${tool} h2`).first()).toBeVisible();
  }
});

test('Tools tabs: arrow, Home and End move between tools at their unchanged routes, with a visible focus ring (#1139)', async () => {
  test.setTimeout(120_000);
  await page.goto(`${baseUrl}/#/explore/cycles`);
  const tabs = page.getByRole('tablist', { name: 'Tools subtabs' });
  await expect(tabs).toBeVisible({ timeout: 30_000 });
  await tabs.getByRole('tab', { selected: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#\/explore\/event-search$/);
  await expect(tabs.getByRole('tab', { selected: true })).toBeFocused();
  const outline = await page.evaluate<{ width: string; style: string }>(
    `(() => ({ width: getComputedStyle(document.activeElement).outlineWidth, style: getComputedStyle(document.activeElement).outlineStyle }))()`,
  );
  expect(outline.style).not.toBe('none');
  expect(outline.width).not.toBe('0px');
  await page.keyboard.press('End');
  await expect(page).toHaveURL(/#\/explore\/rectification$/);
  await page.keyboard.press('Home');
  await expect(page).toHaveURL(/#\/explore\/cycles$/);
});

for (const theme of THEMES) {
  test(`the Tools frame holds at 390x844, 1280x800 and 3440x1440 in the ${theme} theme (#1139)`, async () => {
    test.setTimeout(240_000);
    await page.emulateMedia({ colorScheme: theme });
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const tool of TOOL_HASHES) {
        await page.goto(`${baseUrl}/#/explore/${tool}`);
        await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeVisible({ timeout: 30_000 });
        const what = `${tool} at ${String(viewport.width)}x${String(viewport.height)} (${theme})`;
        const sideways = await page.evaluate<boolean>(
          'document.documentElement.scrollWidth > document.documentElement.clientWidth + 1',
        );
        expect(sideways, `${what}: scrolls sideways`).toBe(false);
        const narrow = viewport.width <= 640;
        await expect(page.locator('.tools-select')).toBeVisible({ visible: narrow });
        await expect(page.locator('.tools-tabs')).toBeVisible({ visible: !narrow });
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(
          axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
          `${what}: accessibility`,
        ).toEqual([]);
      }
    }
  });
}
