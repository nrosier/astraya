/**
 * The sub-view navigation of the multi-view sections: the three person sections (#1175: Transits & Forecast,
 * Progressions & Directions, Relationship Charts) and Tools (#1139) share one frame, a section h1 over a Tabs bar, with
 * the open sub-view in the tab panel under its own h2. Arrow, Home and End move between tabs at their unchanged routes
 * with a visible focus ring, the labelled Select at 40rem and below sits inside a landmark (axe `region`), and the
 * frame holds at 390x844, 1280x800 and 3440x1440 in both themes.
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
  /** The section's h1. */
  readonly h1: string;
  readonly label: string;
  /** Prefix of the tab and panel ids. */
  readonly idBase: string;
  /** The key of the sub-view `hash` opens. */
  readonly openKey: string;
  readonly hash: (id: string) => string;
  readonly firstUrl: (id: string) => RegExp;
  readonly lastUrl: (id: string) => RegExp;
}

const SECTIONS: readonly Section[] = [
  {
    name: 'Transits & forecast',
    h1: 'Transits & Forecast',
    label: 'Transits & Forecast subtabs',
    idBase: 'transits-forecast',
    openKey: 'transit',
    hash: (id) => `#/people/${id}/timing/transits`,
    firstUrl: (id) => new RegExp(`#/people/${id}/timing/transits$`),
    lastUrl: (id) => new RegExp(`#/people/${id}/timing/forecast$`),
  },
  {
    name: 'Progressions & directions',
    h1: 'Progressions & Directions',
    label: 'Progressions & Directions subtabs',
    idBase: 'progressions-directions',
    openKey: 'profections',
    hash: (id) => `#/people/${id}/timing/profections`,
    firstUrl: (id) => new RegExp(`#/people/${id}/timing/timeline$`),
    lastUrl: (id) => new RegExp(`#/people/${id}/timing/primary-directions$`),
  },
  {
    name: 'Relationship charts',
    h1: 'Relationship Charts',
    label: 'Relationship Charts subtabs',
    idBase: 'relationship-charts',
    openKey: 'synastry',
    hash: (id) => `#/people/${id}/relationships/synastry`,
    firstUrl: (id) => new RegExp(`#/people/${id}/relationships/synastry$`),
    lastUrl: (id) => new RegExp(`#/people/${id}/relationships/composite$`),
  },
];

async function openSection(section: Section): Promise<void> {
  await page.goto(`${baseUrl}/${section.hash(personId)}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
}

test('every person section has its h1, a Tabs bar with the open sub-view selected, and an h2 for the screen (#1175)', async () => {
  test.setTimeout(120_000);
  for (const section of SECTIONS) {
    await openSection(section);
    await expect(page.getByRole('heading', { level: 1, name: section.h1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const tabs = page.getByRole('tablist', { name: section.label });
    expect(await tabs.getByRole('tab').count(), `${section.name}: tabs`).toBeGreaterThan(1);
    await expect(tabs.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    await expect(page.locator(`#${section.idBase}-panel-${section.openKey} h2`).first()).toBeVisible();
  }
});

test('person section tabs: arrow, Home and End move between sub-views at their unchanged routes, with a visible focus ring (#1175)', async () => {
  test.setTimeout(120_000);
  for (const section of SECTIONS) {
    await openSection(section);
    const tabs = page.getByRole('tablist', { name: section.label });
    const count = await tabs.getByRole('tab').count();
    await tabs.getByRole('tab', { selected: true }).focus();
    await page.keyboard.press('End');
    await expect(page).toHaveURL(section.lastUrl(personId));
    await expect(tabs.getByRole('tab', { selected: true })).toBeFocused();
    const outline = await page.evaluate<{ width: string; style: string }>(
      `(() => ({ width: getComputedStyle(document.activeElement).outlineWidth, style: getComputedStyle(document.activeElement).outlineStyle }))()`,
    );
    expect(outline.style, `${section.name} focus ring`).not.toBe('none');
    expect(outline.width, `${section.name} focus ring width`).not.toBe('0px');
    await page.keyboard.press('Home');
    await expect(page).toHaveURL(section.firstUrl(personId));
    expect(count).toBeGreaterThan(1);
  }
});

for (const theme of THEMES) {
  test(`at 390x844 the sub-view Select sits in a landmark: axe region passes on every group (${theme})`, async () => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const section of SECTIONS) {
      await openSection(section);
      await expect(page.locator('.section-select')).toBeVisible();
      await expect(page.locator('.section-tabs')).toBeHidden();
      const results = await new AxeBuilder({ page }).withRules(['region']).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
        `${section.name} (${theme})`,
      ).toEqual([]);
    }
  });
}

const TOOL_HASHES = [
  'cycles',
  'graphic-ephemeris',
  'event-search',
  'eclipses',
  'horary',
  'electional',
  'rectification',
] as const;

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
  // The Tools menu order puts Graphic ephemeris after Cycles (#1404), so ArrowRight moves there first.
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#\/explore\/graphic-ephemeris$/);
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
  test(`the person section frame holds at 390x844, 1280x800 and 3440x1440 in the ${theme} theme (#1175)`, async () => {
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
        await expect(page.locator('.section-select')).toBeVisible({ visible: narrow });
        await expect(page.locator('.section-tabs')).toBeVisible({ visible: !narrow });
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(
          axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
          `${what}: accessibility`,
        ).toEqual([]);
      }
    }
  });

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
        await expect(page.locator('.section-select')).toBeVisible({ visible: narrow });
        await expect(page.locator('.section-tabs')).toBeVisible({ visible: !narrow });
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(
          axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
          `${what}: accessibility`,
        ).toEqual([]);
      }
    }
  });
}
