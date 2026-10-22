/**
 * Saved AI interpretations are scoped to the selected person (#768): the PDF builder's picker lists only that
 * person's results, and results saved before a person was recorded appear only in the Past tab's separate
 * "Not linked to a person" section. The results endpoint is stubbed with `page.route`, as in
 * `pdf-export-builder.spec.ts`, so no model is called and nothing is generated.
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { createPerson, gotoAndSettle, signIn } from './support.ts';

const BOOTSTRAP_TOKEN = 'e2e-saved-person-bootstrap-token';
const USERNAME = 'person-scope-reader';
const PASSWORD = 'correct-horse-battery-e2e';

let dir: string;
let app: FastifyInstance;
let baseUrl: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-e2e-'));
  process.env.LOG_LEVEL = 'silent';
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
  process.env.ASTRAYA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  app = await build({ dbPath: join(dir, 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup',
    payload: { token: BOOTSTRAP_TOKEN, username: USERNAME, password: PASSWORD },
  });
  if (setup.statusCode >= 400) throw new Error(`setup failed: ${String(setup.statusCode)}`);
  delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
  delete process.env.ASTRAYA_ENCRYPTION_KEY;
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const ADA = {
  name: 'Ada Lovelace',
  date: '1815-12-10',
  time: '07:45:00',
  latitude: '51.5072',
  longitude: '-0.1276',
};
const CHARLES = { ...ADA, name: 'Charles Babbage', date: '1820-12-26', time: '10:00:00' };

function entry(id: string, description: string, createdAt: string): Record<string, unknown> {
  return {
    id,
    mode: 'freeform',
    locale: 'en',
    createdAt,
    description,
    kind: 'whole-chart',
    basis: { kind: 'whole-chart' },
  };
}

/**
 * Stubs the list endpoint: a person's request returns one result whose description names that person id, an
 * unlinked request returns one older result. Returns the person ids asked for, in order.
 */
async function stubResults(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route('**/api/interpretation/results?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const personId = params.get('personId');
    if (personId !== null) {
      asked.push(personId);
      await route.fulfill({
        json: { results: [entry(`res-${personId}`, `Reading for ${personId}`, '2026-10-02T09:00:00.000Z')] },
      });
    } else if (params.get('unlinked') === '1') {
      await route.fulfill({
        json: { results: [entry('res-old', 'Older reading with no person', '2026-09-01T09:00:00.000Z')] },
      });
    } else {
      await route.fulfill({ status: 400, json: { error: 'a person or unlinked is required' } });
    }
  });
  return asked;
}

test('the PDF builder’s picker lists only the selected person’s results, and switching person changes the list (#768)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const asked = await stubResults(page);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await page.getByRole('link', { name: '← People' }).click();
  await createPerson(page, CHARLES);
  await signIn(page, USERNAME, PASSWORD);
  await page.goto(`${baseUrl}/#/documents/pdf`);

  const picker = page.getByRole('group', { name: 'Saved AI interpretations', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Choose saved AI interpretations' });

  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Ada Lovelace' });
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  const adaId = asked[asked.length - 1] ?? '';
  await picker.getByRole('button', { name: 'Choose interpretations', exact: true }).click();
  await expect(dialog.getByRole('checkbox')).toHaveCount(1);
  await expect(dialog.getByText(`Reading for ${adaId}`)).toBeVisible();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(picker.getByRole('listitem')).toHaveCount(1);

  const askedBefore = asked.length;
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Charles Babbage' });
  await expect.poll(() => asked.length).toBeGreaterThan(askedBefore);
  const charlesId = asked[asked.length - 1] ?? '';
  expect(charlesId).not.toBe('');
  expect(charlesId).not.toBe(adaId);
  // Ada's tick is cleared: nothing of hers carries over to Charles.
  await expect(picker.getByRole('listitem')).toHaveCount(0);
  await picker.getByRole('button', { name: 'Choose interpretations', exact: true }).click();
  await expect(dialog.getByRole('checkbox')).toHaveCount(1);
  await expect(dialog.getByText(`Reading for ${charlesId}`)).toBeVisible();
  await expect(dialog.getByText(`Reading for ${adaId}`)).toHaveCount(0);
  // Unlinked results are never offered in the picker.
  await expect(dialog.getByText('Older reading with no person')).toHaveCount(0);
});

test('the Past tab shows the selected person’s results and a separate Not linked to a person section (#768)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const asked = await stubResults(page);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await signIn(page, USERNAME, PASSWORD);
  await page.getByRole('link', { name: 'Interpretation', exact: true }).click();
  await page.getByRole('tab', { name: 'Past interpretations' }).click();

  await expect.poll(() => asked.length).toBeGreaterThan(0);
  const adaId = asked[asked.length - 1] ?? '';
  const panel = page.locator('section.saved-interpretations-panel');
  const unlinked = panel.locator('section.saved-interpretations-unlinked');
  await expect(unlinked.getByRole('heading', { name: 'Not linked to a person', level: 3 })).toBeVisible();
  await expect(unlinked.getByText('Older reading with no person')).toBeVisible();
  await expect(panel.getByText(`Reading for ${adaId}`)).toBeVisible();
  // The person's own result is outside the unlinked section, and the older one is outside the person's list.
  await expect(unlinked.getByText(`Reading for ${adaId}`)).toHaveCount(0);
  await expect(panel.locator('li.saved-interpretation-row')).toHaveCount(2);
  await expect(unlinked.locator('li.saved-interpretation-row')).toHaveCount(1);
});
