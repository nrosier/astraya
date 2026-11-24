/**
 * The arc transform's warning for a very large harmonic (#1407). A pair closer than 1 degree gives a harmonic over 360,
 * and every other point is then off by that harmonic times the ephemeris error, so the screen says the other points are
 * not reliable. It needs a birth with such a pair, so this spec makes its own person on its own server instead of using
 * the shared seeded people (#799: a test that adds a person must not depend on them).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { createPerson, gotoAndSettle, openChart } from './support.ts';

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

test('an arc transform harmonic above 360 warns that the other points are unreliable (#1407)', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  // Born 16 October 1990 at noon in Greenwich: Mercury and Venus are 0.12 degrees apart, a harmonic near 2,900.
  await createPerson(page, {
    name: 'Close Pair',
    date: '1990-10-16',
    time: '12:00:00',
    latitude: '51.4779',
    longitude: '0',
  });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('link', { name: /^Close Pair/ }).click();
  await openChart(page, 'Harmonic');
  await page.getByLabel('Divisional chart').selectOption({ label: 'Arc transform' });
  await page.getByLabel('First point', { exact: true }).selectOption({ label: 'Mercury' });
  await page.getByLabel('Second point', { exact: true }).selectOption({ label: 'Venus' });
  await expect(page.getByText(/This harmonic is above 360: the pair is less than 1° apart/)).toBeVisible();
  await expect(page.locator('div.chart-wheel')).toBeVisible();
});
