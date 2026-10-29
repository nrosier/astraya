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
