/**
 * The Admin sections label and select sit inside the shelf card at phone width, not flush against its border (#1188).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { gotoAndSettle, openAdminPanel, signIn } from './support.ts';

const BOOTSTRAP_TOKEN = 'e2e-admin-inset-bootstrap-token';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'correct-horse-battery-e2e';

let dir: string;
let app: FastifyInstance;
let baseUrl: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-e2e-'));
  process.env.LOG_LEVEL = 'silent';
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
  app = await build({ dbPath: join(dir, 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const response = await fetch(new URL('/api/setup', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: BOOTSTRAP_TOKEN, username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  if (!response.ok) throw new Error(`bootstrap failed with status ${String(response.status)}`);
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
});

interface Measure {
  cardLeft: number;
  cardRight: number;
  cardPaddingLeft: string;
  cardPaddingRight: string;
  labelLeft: number;
  labelRight: number;
  scopeLeft: number;
  scopeWidth: number;
  selectLeft: number;
  selectRight: number;
  selectWidth: number;
}

async function measure(page: Page): Promise<Measure> {
  return page.evaluate<Measure>(`(() => {
    const card = document.querySelector('div.person-shelf');
    const scope = card.querySelector('.preferences-scope');
    const select = card.querySelector('.person-nav select');
    const label = card.querySelector('.person-nav label');
    const c = card.getBoundingClientRect();
    const l = label?.getBoundingClientRect();
    const s = select?.getBoundingClientRect();
    const p = scope.getBoundingClientRect();
    const cs = getComputedStyle(card);
    return {
      cardLeft: c.left, cardRight: c.right, cardPaddingLeft: cs.paddingLeft, cardPaddingRight: cs.paddingRight,
      labelLeft: l?.left ?? -1, labelRight: l?.right ?? -1, scopeLeft: p.left, scopeWidth: p.width,
      selectLeft: s?.left ?? -1, selectRight: s?.right ?? -1, selectWidth: s?.width ?? -1,
    };
  })()`);
}

test('the Admin sections label and select are inset inside the card at 390px and unchanged at 1280px (#1188)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await signIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
  await openAdminPanel(page);
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
  const wide = await measure(page);
  // Baseline recorded on main before the fix: the select is hidden (tabs show instead) and the scope label is unmoved.
  expect(wide.cardLeft).toBe(224);
  expect(wide.scopeLeft).toBe(225);
  expect(wide.scopeWidth).toBe(616);
  expect(wide.selectWidth, 'the select stays hidden above 40rem').toBe(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await measure(page);
  expect(narrow.selectLeft - narrow.cardLeft, 'select inset from the card edge').toBeGreaterThanOrEqual(8);
  expect(narrow.cardRight - narrow.selectRight, 'select inset from the card right edge').toBeGreaterThanOrEqual(8);
  expect(narrow.labelLeft - narrow.cardLeft, 'label inset from the card edge').toBeGreaterThanOrEqual(8);
  expect(narrow.scopeLeft, 'scope label unchanged').toBe(1);
  expect(narrow.scopeWidth, 'scope label unchanged').toBe(388);
});
