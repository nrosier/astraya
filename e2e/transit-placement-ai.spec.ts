/**
 * The Transits placement card with its AI interpretation inside it (#2028): one card, the interpretation below the
 * aspect list after a top border, an idle Interpret button, and once a reading is shown an "AI interpretation"
 * subheader with a Regenerate button. Changing the placement resets the reading, and the void-of-course line stays
 * below the card. The generate endpoint is stubbed with `page.route`, so no model is called (ADR 0003).
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { gotoAndSettle, signIn } from './support.ts';

const BOOTSTRAP_TOKEN = 'e2e-transit-placement-ai-bootstrap-token';
const USERNAME = 'transit-ai-reader';
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

test('the placement card holds its AI interpretation: idle, generated with Regenerate, and reset on a new placement (#2028)', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const context = await newSeededContext(browser, baseUrl);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoAndSettle(page, baseUrl);
  await signIn(page, USERNAME, PASSWORD);

  let requests = 0;
  await page.route('**/api/interpretation/generate', async (route) => {
    requests += 1;
    await route.fulfill({
      json: { sections: [{ heading: 'Saturn under pressure', body: 'A stubbed reading for the test.' }] },
    });
  });

  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('tab', { name: 'Transits', exact: true }).click();
  await expect(page.locator('div.chart-wheel')).toBeVisible();

  await page.locator('div.chart-wheel .chart-point[data-body="saturn"][data-ring="1"] .chart-hit-area').click();
  const card = page.locator('.chart-isolation-panel');
  await expect(card.locator('.chart-isolation-head strong')).toHaveText('Saturn (Transit)');

  // Idle: one card, the interpretation inside it in the right column (#2028 owner spec; was below the facts), with no card of its own.
  await expect(page.locator('.focus-interpretation')).toHaveCount(1);
  await expect(card.locator('.chart-isolation-aside .focus-interpretation-embedded')).toBeVisible();
  const interpret = card.getByRole('button', { name: 'Interpret the tensions of this placement', exact: true });
  await expect(interpret).toBeEnabled();

  // The split card (#2028, owner spec): at 1280 the AI block sits in the right column, pinned to the bottom right, and
  // Clear sits at the top right.
  const cardBox = await card.boundingBox();
  const factsBox = await card.locator('.chart-isolation-main').boundingBox();
  const interpretBox = await interpret.boundingBox();
  const clearBox = await card.getByRole('button', { name: 'Clear', exact: true }).boundingBox();
  if (cardBox === null || factsBox === null || interpretBox === null || clearBox === null) {
    throw new Error('a card part has no box');
  }
  expect(interpretBox.x).toBeGreaterThan(factsBox.x + factsBox.width);
  expect(cardBox.x + cardBox.width - (interpretBox.x + interpretBox.width)).toBeLessThan(40);
  expect(clearBox.y).toBeLessThan(interpretBox.y);
  // Signed in there is no sign-in hint, so the button is the block's last line and sits on the card's bottom padding.
  expect(await card.getByText('Sign in to generate', { exact: false }).count()).toBe(0);
  expect(cardBox.y + cardBox.height - (interpretBox.y + interpretBox.height)).toBeLessThan(40);
  // The Interpret pill is compact, the height of the heading row's compact Export pill (#2028, owner instruction).
  const exportBox = await page
    .locator('.page-header-actions')
    .getByRole('button', { name: 'Export', exact: true })
    .boundingBox();
  if (exportBox === null) throw new Error('Export has no box');
  expect(Math.abs(interpretBox.height - exportBox.height)).toBeLessThan(0.5);

  // The void-of-course line, when there is one, follows the card rather than sitting inside it.
  const voc = page.locator('.void-of-course-summary');
  if ((await voc.count()) > 0) {
    await expect(card.locator('.void-of-course-summary')).toHaveCount(0);
    const order = await page.evaluate<boolean>(
      `(() => { const c = document.querySelector('.chart-isolation-panel'); const v = document.querySelector('.void-of-course-summary'); return Boolean(c.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING); })()`,
    );
    expect(order).toBe(true);
  }

  // Generated: consent, then the subheader, Regenerate and the reading, all inside the card.
  await interpret.click();
  await card.getByRole('checkbox').check();
  await card.getByRole('button', { name: 'Confirm & send', exact: true }).click();
  await expect(card.locator('.tier2-result')).toContainText('A stubbed reading for the test.');
  await expect(card.getByRole('heading', { name: 'AI interpretation', exact: true })).toBeVisible();
  const regenerate = card.getByRole('button', { name: 'Regenerate', exact: true });
  await expect(regenerate).toBeVisible();
  // Regenerate and Clear side by side in the top-right action row (#2028, owner spec).
  const regenerateBox = await regenerate.boundingBox();
  const clearAfter = await card.getByRole('button', { name: 'Clear', exact: true }).boundingBox();
  if (regenerateBox === null || clearAfter === null) throw new Error('an action has no box');
  expect(Math.abs(regenerateBox.y - clearAfter.y)).toBeLessThan(1);
  expect(regenerateBox.x).toBeLessThan(clearAfter.x);
  expect(requests).toBe(1);

  // Regenerate is a new request, so it asks for consent again; cancelling keeps the reading.
  await regenerate.click();
  await expect(card.getByRole('checkbox')).not.toBeChecked();
  await card.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card.locator('.tier2-result')).toContainText('A stubbed reading for the test.');
  expect(requests).toBe(1);

  // Clearing the selection removes the card and its reading.
  await card.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('.chart-isolation-panel')).toHaveCount(0);
  await expect(page.locator('.focus-interpretation')).toHaveCount(0);
  // Selecting the placement again starts over: the card is back with no reading, only the idle button.
  await page.locator('div.chart-wheel .chart-point[data-body="saturn"][data-ring="1"] .chart-hit-area').click();
  await expect(card.locator('.chart-isolation-head strong')).toHaveText('Saturn (Transit)');
  await expect(card.locator('.tier2-result')).toHaveCount(0);
  await expect(
    card.getByRole('button', { name: 'Interpret the tensions of this placement', exact: true }),
  ).toBeVisible();

  await context.close();
});
