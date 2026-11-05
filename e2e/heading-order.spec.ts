/**
 * Heading order on the table routes (#1163): the page title is the one h1, and the first heading below
 * it is an h2, so a SortableTable caption (headingLevel={2}) never skips a level. Checked structurally
 * (exactly one h1, no jump of more than one level) and with axe's `heading-order` rule.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
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

/** The routes #1163 lists, as paths below `#/people/:id/`. */
const ROUTES: readonly { readonly name: string; readonly path: string }[] = [
  { name: 'Transit', path: 'timing/transits' },
  { name: 'Progressions', path: 'timing/progressions' },
  { name: 'Solar arc', path: 'timing/solar-arc' },
  { name: 'Primary directions', path: 'timing/primary-directions' },
  { name: 'Synastry', path: 'relationships/synastry' },
  { name: 'Solar return', path: 'charts/solar-return/wheel' },
];

test.describe('with the shared people (#799)', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    context = await newSeededContext(browser, baseUrl);
    page = await context.newPage();
  });

  test.afterEach(async () => {
    await context.close();
  });

  for (const { name, path } of ROUTES) {
    test(`${name}: one h1, then h2, and no heading level is skipped (#1163)`, async () => {
      test.setTimeout(90_000);

      await openSharedPerson(page, baseUrl, EINSTEIN);
      await expect(page).toHaveURL(/#\/people\/[^/]+\//);
      const personId = /#\/people\/([^/?]+)/.exec(page.url())?.[1];
      if (personId === undefined) throw new Error(`no person id in ${page.url()}`);
      await gotoAndSettle(page, `${baseUrl}/#/people/${personId}/${path}`);

      // Synastry needs a second person before its data table renders (same pick as synastry-golden-path).
      if (name === 'Synastry') {
        await page.getByLabel('Compare with').selectOption({ label: 'Max Born' });
      }

      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      // A table caption is a heading, so wait for the data table before reading the outline.
      await expect(page.locator('table').first()).toBeVisible({ timeout: 60_000 });

      const headings = await page.evaluate<string[]>(
        `Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) => h.tagName.toLowerCase() + ' ' + (h.textContent || '').trim())`,
      );
      const levels = headings.map((heading) => Number(heading.charAt(1)));
      expect(levels.filter((level) => level === 1)).toHaveLength(1);
      let previous = 0;
      for (const level of levels) {
        expect(level, `headings ${JSON.stringify(headings)}`).toBeLessThanOrEqual(previous + 1);
        previous = level;
      }
      expect(levels[1]).toBe(2);

      const results = await new AxeBuilder({ page }).withRules(['heading-order', 'page-has-heading-one']).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
