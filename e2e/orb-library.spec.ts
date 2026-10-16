/**
 * Named orb profiles on this device (#590): a profile saved on Preferences can be chosen for transits without
 * touching the card's orbs, and editing it saves a new revision. Real server, store and ephemeris.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { createPerson, gotoAndSettle, openNatalChart, openSettings } from './support.ts';

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

test('a named orb profile chosen for transits changes them, leaves the card alone, and edits save a revision', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });

  // The count with the card's own orbs, before any profile exists.
  await page.getByRole('button', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('link', { name: 'Transits', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();
  const count = async (): Promise<number> => {
    const text = (await page.locator('.transit-filter-count').textContent()) ?? '';
    const match = /of (\d+) shown$/.exec(text);
    if (match === null) throw new Error(`unexpected count text: ${text}`);
    return Number(match[1]);
  };
  const withCard = await count();

  // Create a profile on Preferences: a conjunction orb of 0° and a scale of -90%.
  await gotoAndSettle(page, `${baseUrl}/#/preferences/astrology`);
  await page.getByRole('button', { name: 'Add orb profile', exact: true }).click();
  await page.getByRole('textbox', { name: 'Profile name', exact: true }).fill('Exact only');
  await page.getByRole('spinbutton', { name: /^Scale/ }).fill('-90');
  await page.getByRole('button', { name: 'Save orb profile', exact: true }).click();
  await expect(page.getByText('Saved Exact only, revision 1.')).toBeVisible();

  // Choose it for transits.
  await page
    .getByRole('combobox', { name: 'Transits', exact: true })
    .selectOption({ label: 'Exact only (revision 1)' });
  await expect(page.getByText('Orb choice saved.')).toBeVisible();

  const axe = await new AxeBuilder({ page }).include('section[aria-labelledby="orb-library-heading"]').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // The transit screen now finds fewer contacts than the card's orbs give it. Preferences has no person tabs, so go back to the person first.
  await page.goto(`${baseUrl}/#/people`);
  await page.getByRole('link', { name: 'Ada Lovelace', exact: false }).first().click();
  await page.getByRole('button', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('link', { name: 'Transits', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();
  const withProfile = await count();
  expect(withProfile).toBeLessThan(withCard);

  // The card is untouched: natal still uses the card's own orbs, so its settings button does not name them.
  await openNatalChart(page);
  await expect(page.locator('button.extended-settings-trigger')).toHaveText('Extended settings');
  await openSettings(page);
  await expect(page.locator('dialog.settings-card').getByRole('radio', { name: /^Standard/ })).toBeChecked();
  await page.locator('dialog.settings-card').getByRole('button', { name: 'Cancel', exact: true }).click();

  // Editing the profile saves revision 2 and keeps the same name.
  await gotoAndSettle(page, `${baseUrl}/#/preferences/astrology`);
  await page.getByRole('button', { name: 'Edit Exact only', exact: true }).click();
  await page.getByRole('spinbutton', { name: /^Scale/ }).fill('-80');
  await page.getByRole('button', { name: 'Save as revision 2', exact: true }).click();
  await expect(page.getByText('Saved Exact only, revision 2.')).toBeVisible();

  await page.goto(`${baseUrl}/#/people`);
  await page.getByRole('link', { name: 'Ada Lovelace', exact: false }).first().click();
  await page.getByRole('button', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('link', { name: 'Transits', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();
  // A wider scale finds more contacts than the first revision did, so the new revision is what the screen uses.
  expect(await count()).toBeGreaterThan(withProfile);
});
