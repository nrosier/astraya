/**
 * Deep links to the four drawers (#1667): `?drawer=<key>` on the route that hosts the drawer opens it on load, and
 * closing it removes `drawer` from the hash while keeping the rest of the URL. One test per drawer.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { gotoAndSettle } from './support.ts';

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

/** The hash of the page right now, after the drawer has been opened or closed. */
function currentHash(page: Page): Promise<string> {
  // A string script: the e2e tsconfig has no DOM types, so the callback cannot name `window` in TypeScript.
  return page.evaluate('window.location.hash');
}

/**
 * Opens the drawer from its deep link, then closes it with Escape. Checks the hash still holds the route's path and
 * has lost `drawer`.
 */
async function expectDeepLinkRoundTrip(page: Page, route: string, drawer: Locator): Promise<void> {
  const path = route.split('?')[0] ?? route;
  await gotoAndSettle(page, `${baseUrl}/#${route}`);
  await expect(drawer).toBeVisible();
  expect(await currentHash(page)).toContain('drawer=');

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  const hash = await currentHash(page);
  expect(hash).not.toContain('drawer');
  expect(hash.split('?')[0]).toBe(`#${path}`);
}

test.describe('with the shared people (#1667)', () => {
  let context: BrowserContext;
  let page: Page;
  let personPath: string;

  // A fresh context per test, holding the shared people; no test here saves, edits or deletes one.
  test.beforeEach(async ({ browser }) => {
    context = await newSeededContext(browser, baseUrl);
    page = await context.newPage();
    await openSharedPerson(page, baseUrl, EINSTEIN);
    const match = /#(\/people\/[^/?]+)/.exec(page.url());
    if (match?.[1] === undefined) throw new Error(`expected a person route, got ${page.url()}`);
    personPath = match[1];
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('overlays: ?drawer=overlays on the chart wheel opens Overlay settings, and closing removes drawer', async () => {
    test.setTimeout(90_000);
    const drawer = page.locator('.chart-overlay-settings dialog');
    await expectDeepLinkRoundTrip(page, `${personPath}/charts/natal/wheel?drawer=overlays`, drawer);
  });

  test('extended-settings: ?drawer=extended-settings on the chart route opens Extended settings, and closing removes drawer', async () => {
    test.setTimeout(90_000);
    const drawer = page.locator('dialog.settings-card').filter({ hasText: 'Extended settings' });
    await expectDeepLinkRoundTrip(page, `${personPath}/charts/natal/wheel?drawer=extended-settings`, drawer);
  });

  test('life-events: ?drawer=life-events on the birth record opens Life events, and closing removes drawer', async () => {
    const drawer = page.locator('dialog.life-events-drawer');
    await expectDeepLinkRoundTrip(page, `${personPath}/birth-record?drawer=life-events`, drawer);
  });

  test('map-settings: ?drawer=map-settings on the astrocartography route opens Map settings, and closing removes drawer', async () => {
    const drawer = page.getByRole('dialog', { name: 'Map settings' });
    await expectDeepLinkRoundTrip(page, `${personPath}/location/astrocartography?drawer=map-settings`, drawer);
  });
});
