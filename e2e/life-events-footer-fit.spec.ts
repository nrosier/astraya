/**
 * #1666: at 390x844 every Life events drawer footer button sits inside the viewport, with no horizontal scroll, in
 * English and Dutch. The footer is measured in the built app, so a wrap or a clipped label shows up here.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { gotoAndSettle, setLanguage } from './support.ts';

const PHONE = { width: 390, height: 844 };

let dir: string;
let app: Awaited<ReturnType<typeof build>>;
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

async function openLifeEventsDrawer(page: Page): Promise<void> {
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('heading', { name: /Identity and birth timestamp|Identiteit en geboortemoment/ }).waitFor();
  await page.getByRole('button', { name: /^(Manage Life Events|Levensgebeurtenissen beheren)$/ }).click();
  await page.locator('dialog.life-events-drawer[open]').waitFor({ state: 'visible' });
}

/** The right edge of every footer button in the open Life events drawer, plus the page's horizontal overflow. */
async function footerFit(page: Page): Promise<{ scrollWidth: number; viewport: number; rights: number[] }> {
  return page.evaluate<{ scrollWidth: number; viewport: number; rights: number[] }>(`(() => {
    const buttons = [...document.querySelectorAll('dialog.life-events-drawer .settings-card-footer-group > *')];
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
      rights: buttons.map((button) => button.getBoundingClientRect().right),
    };
  })()`);
}

for (const language of ['EN', 'NL'] as const) {
  test(`${language}: every Life events footer button fits inside a 390px viewport`, async ({ browser }) => {
    const context = await newSeededContext(browser, baseUrl, { viewport: PHONE });
    const page = await context.newPage();
    await gotoAndSettle(page, `${baseUrl}/#/people`);
    if (language === 'NL') await setLanguage(page, 'NL');
    await openLifeEventsDrawer(page);

    const fit = await footerFit(page);
    expect(fit.rights.length).toBeGreaterThan(0);
    expect(fit.scrollWidth, 'no horizontal scroll').toBeLessThanOrEqual(PHONE.width);
    for (const right of fit.rights) expect(right).toBeLessThanOrEqual(PHONE.width);
    await context.close();
  });
}
