/**
 * Reference screenshots of the surfaces the UI/UX overhaul restructured (#507): both themes, at 390×844, 1280×800 and
 * 1440×900, written to docs/ui-baselines/. They are documentation, not assertions — behaviour and accessibility
 * are pinned by the other specs, and a pixel comparison would fail on every font or OS difference. Skipped unless
 * asked for: `CAPTURE_UI_BASELINES=1 npx playwright test e2e/ui-baselines.spec.ts`.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';

const OUT = 'docs/ui-baselines';
const VIEWPORTS = [
  ['phone', 390, 844],
  ['laptop', 1280, 800],
  ['desktop', 1440, 900],
] as const;
const THEMES = ['light', 'dark'] as const;

let dir: string;
let app: FastifyInstance;
let baseUrl: string;
let personId = '';

test.skip(process.env.CAPTURE_UI_BASELINES !== '1', 'set CAPTURE_UI_BASELINES=1 to write the reference screenshots');

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-e2e-'));
  process.env.LOG_LEVEL = 'silent';
  app = await build({ dbPath: join(dir, 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
  mkdirSync(OUT, { recursive: true });
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const SURFACES: readonly (readonly [string, (id: string) => string])[] = [
  ['wheel-workbench', (id) => `#/people/${id}/charts/natal/wheel`],
  ['aspect-matrix', (id) => `#/people/${id}/charts/natal/matrix`],
  ['elements-modalities', (id) => `#/people/${id}/charts/natal/elements`],
  ['birth-record-form', (id) => `#/people/${id}/birth-record`],
  ['preferences', () => '#/preferences'],
  ['pdf-builder', () => '#/documents/pdf'],
];

test('capture the reference screenshots', async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  await openSharedPerson(page, baseUrl, EINSTEIN);
  personId = /#\/people\/([^/]+)\//.exec(page.url())?.[1] ?? '';
  for (const theme of THEMES) {
    await page.evaluate(`localStorage.setItem('astraya.theme', '${theme}')`);
    for (const [viewportName, width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      for (const [surface, hashOf] of SURFACES) {
        await page.goto(`${baseUrl}/${hashOf(personId)}`);
        await page.reload();
        await page.waitForTimeout(1200);
        await page.screenshot({
          path: join(OUT, `${surface}-${theme}-${viewportName}.jpg`),
          type: 'jpeg',
          quality: 70,
        });
      }
    }
  }
  await context.close();
});
