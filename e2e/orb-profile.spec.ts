/**
 * A person's own orb profile (#590): saved from the Transit screen, it survives a reload, changes
 * how many contacts the screen finds, and removing it brings the built-in orbs back. Real server,
 * store and ephemeris, as `transit-golden-path.spec.ts` uses.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { createPerson, gotoAndSettle } from './support.ts';

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

test('a saved orb profile changes the transit contacts, persists, and can be removed', async ({ page }) => {
  test.setTimeout(90_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await page.getByRole('button', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('link', { name: 'Transits', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();

  const totalCount = async (): Promise<number> => {
    const text = (await page.locator('.transit-filter-count').textContent()) ?? '';
    const match = /of (\d+) shown$/.exec(text);
    if (match === null) throw new Error(`unexpected count text: ${text}`);
    return Number(match[1]);
  };
  const builtInTotal = await totalCount();

  await page.getByRole('button', { name: /Show orb profile/ }).click();
  await page.getByLabel('Profile name', { exact: true }).fill('Tight house');
  await page.getByRole('spinbutton', { name: /^Scale/ }).fill('-90');
  await page.mouse.move(0, 0);
  const axe = await new AxeBuilder({ page }).include('.primitive-disclosure').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await page.getByRole('button', { name: 'Save orb profile' }).click();
  await expect(page.getByText('Saved as revision 1.')).toBeVisible();

  await expect.poll(totalCount).toBeLessThan(builtInTotal);
  const tightTotal = await totalCount();

  await page.reload();
  await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();
  await expect.poll(totalCount).toBe(tightTotal);
  await expect(page.getByText('Tight house, revision 1')).toBeVisible();

  await page.getByRole('button', { name: /Show orb profile/ }).click();
  await page.getByRole('button', { name: 'Remove orb profile' }).click();
  await expect.poll(totalCount).toBe(builtInTotal);
});
