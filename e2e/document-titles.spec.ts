/**
 * Every screen has its own browser tab title (#1078, WCAG 2.4.2): its `<h1>`, then the app name. Tabs, history entries
 * and a screen reader's page announcement can then tell screens apart, and the title follows the interface language.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { gotoAndSettle, setLanguage } from './support.ts';

const GLOBAL = ['people', 'explore/eclipses', 'explore/horary', 'documents/pdf', 'preferences', 'about'];
const PERSON = ['overview', 'birth-record', 'charts/natal/wheel', 'consultation', 'timing/transits', 'timing/forecast'];

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

test('every screen titles its tab with its heading and the app name, and the titles differ (#1078)', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  try {
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.waitForURL(/#\/people\/[^/]+\//);
    const personId = /#\/people\/([^/]+)\//.exec(page.url())?.[1] ?? '';
    const routes = [...GLOBAL, ...PERSON.map((route) => `people/${personId}/${route}`)];

    const titles = new Set<string>();
    for (const route of routes) {
      await gotoAndSettle(page, `${baseUrl}/#/${route}`);
      // A Tools page's tab title names the tool, its h2 section heading (#1139); its h1 is the shared "Tools".
      const level = route.startsWith('explore/') ? 2 : 1;
      const heading = (await page.getByRole('heading', { level }).first().innerText()).trim();
      await expect(page, route.replace(personId, ':id')).toHaveTitle(`${heading} – Astraya`);
      titles.add(await page.title());
    }
    expect(titles.size, 'each screen has its own title').toBe(routes.length);

    // The title follows the interface language.
    await setLanguage(page, 'NL');
    await gotoAndSettle(page, `${baseUrl}/#/explore/eclipses`);
    await expect(page).toHaveTitle('Verduisteringen – Astraya');
  } finally {
    await context.close();
  }
});
