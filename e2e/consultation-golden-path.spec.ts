/**
 * The golden path for the consultation dashboard (#563): a person with a known birth time gets a
 * Consultation screen showing current transits, active timing techniques, and chart highlights,
 * each with a link to its own full canonical screen. Same real worker/DOM machinery
 * `transit-golden-path.spec.ts`/`synastry-golden-path.spec.ts` exercise, applied to the new
 * screen, which computes nothing new of its own.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

test('a person with a known birth time gets a Consultation screen with transits, timing tracks and highlights', async ({
  page,
}) => {
  test.setTimeout(60_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });

  await page.getByRole('link', { name: 'Consultation', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /consultation/i })).toBeVisible();

  // The page is cast for the moment it opened, to the minute, and Now recasts it (#676).
  await expect(page.getByText(/^As of \d{4}-\d{2}-\d{2} \d{2}:\d{2}, your local time/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Now', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Current transits' })).toBeVisible();

  // "View all transits"/"Open timing timeline"/"Open natal chart" each appear twice — once
  // beside their own section, once again in "Next" (#506/#509's launchpad pattern) — so these
  // are counted, not asserted singly.
  await expect(page.getByRole('heading', { level: 2, name: 'Current transits' })).toBeVisible();
  // Transits to the angles are listed apart from the ranked ones (#678).
  await expect(page.getByRole('heading', { level: 3, name: 'Transits to the Ascendant and Midheaven' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View all transits', exact: true })).toHaveCount(2);

  await expect(page.getByRole('heading', { level: 2, name: 'Active timing techniques' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open timing timeline', exact: true })).toHaveCount(2);

  await expect(page.getByRole('heading', { level: 2, name: 'Chart highlights' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Patterns & condition', exact: true })).toBeVisible();

  await expect(page.getByRole('heading', { level: 2, name: 'Next' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open interpretation', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Build PDF', exact: true })).toBeVisible();

  // The link actually opens the full canonical screen (one home per feature).
  await page.getByRole('link', { name: 'View all transits', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: /transits/i })).toBeVisible();
});
