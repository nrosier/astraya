/**
 * The Interpretation configuration disclosure (#881), end to end at the two reference widths: it starts collapsed
 * on a first visit, its closed row states the current rulers and Sabian choice, opening it shows both settings,
 * and it is as wide as the report's other cards (the contents card and the sections).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';

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

async function boxWidth(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).first().boundingBox();
  if (box === null) throw new Error(`no box for ${selector}`);
  return box.width;
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
] as const) {
  test(`the configuration starts collapsed, states the current choice, opens to both settings and is card width at ${String(viewport.width)}px`, async ({
    browser,
  }) => {
    const context = await newSeededContext(browser, baseUrl);
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    // On a phone the navigation folds behind the Menu button.
    const menu = page.getByRole('banner').getByRole('button', { name: 'Menu', exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('link', { name: 'Interpretation', exact: true }).click();

    const trigger = page.locator('.config-block .primitive-disclosure-trigger');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger.locator('.primitive-disclosure-title')).toHaveText('Configuration');
    await expect(trigger.locator('.primitive-disclosure-summary')).toHaveText('Rulers: Modern · Sabian: on');
    await expect(page.getByRole('radiogroup', { name: 'Planetary rulers' })).toHaveCount(0);

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('radiogroup', { name: 'Planetary rulers' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Show Sabian symbol notes/ })).toBeVisible();

    // Same width as the other cards in the column (the contents card and the report sections), to the pixel.
    const config = await boxWidth(page, '.config-block');
    expect(Math.abs(config - (await boxWidth(page, '.report-toc')))).toBeLessThanOrEqual(1);
    expect(Math.abs(config - (await boxWidth(page, '.report-section')))).toBeLessThanOrEqual(1);
    // No horizontal overflow of the page.
    expect(await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(1);

    await page.getByRole('checkbox', { name: /Show Sabian symbol notes/ }).uncheck();
    await expect(trigger.locator('.primitive-disclosure-summary')).toHaveText('Rulers: Modern · Sabian: off');
    await context.close();
  });
}
