/**
 * The golden path for solar arc directions (#398): a person with a known birth time, opening
 * the Solar Arc screen from the person page, and the directed positions and directed-to-natal
 * contacts tables both render.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, MARIC, newSeededContext, openSharedPerson } from './shared-people.ts';

let dir: string;
let app: FastifyInstance;
let baseUrl: string;
let context: BrowserContext;
let page: Page;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-e2e-'));
  process.env.LOG_LEVEL = 'silent';

  app = await build({ dbPath: join(dir, 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

// A fresh context per test, holding the shared people (#799); no test here saves, edits or deletes one.
test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test('a person with a known birth time gets a Solar Arc screen with directed positions and contacts', async () => {
  test.setTimeout(60_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);

  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('tab', { name: 'Solar Arc', exact: true }).click();
  await expect(page.getByRole('heading', { name: /solar arc/i, level: 2 })).toBeVisible();
  await expect(page.locator('.page-header-basis')).toHaveText(
    'Tropical · Placidus · Mean node · Standard orbs · Solar arc (the Sun’s progressed arc) · directed in longitude only',
  );
  await expect(page.getByText('Longitude only: declination is not directed.')).toBeVisible();

  await expect(page.getByRole('table', { name: 'Directed positions' })).toBeVisible();
  await expect(page.getByText(/^Arc: /)).toBeVisible();

  // The date stepper (#1400): stepping forward a day changes the as-of date and writes it to the URL.
  const bar = page.getByRole('group', { name: 'Date and animation' });
  const date = bar.getByLabel('As of');
  const before = await date.inputValue();
  await bar.getByRole('button', { name: 'Step forward one day' }).click();
  await expect(date).not.toHaveValue(before);
  const after = await date.inputValue();
  await expect.poll(() => page.url()).toContain(`date=${after}`);
});

test('the Solar Arc screen can direct in declination: parallels to the natal bodies (#1407)', async () => {
  test.setTimeout(60_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('tab', { name: 'Solar Arc', exact: true }).click();
  const directedIn = page.getByLabel('Directed in', { exact: true });
  await expect(directedIn).toHaveValue('longitude');

  await directedIn.selectOption('declination');
  await expect(page.locator('.page-header-basis')).toHaveText(
    'Tropical · Placidus · Mean node · Standard orbs · Solar arc (the Sun’s progressed arc) · directed in declination',
  );
  await expect(page.getByText(/^Arc in declination: /)).toBeVisible();
  await expect(page.getByText('Longitude only: declination is not directed.')).toHaveCount(0);
  const declinations = page.getByRole('table', { name: 'Directed declinations' });
  await expect(declinations).toBeVisible();
  // Each declination reads as degrees and minutes north or south of the equator.
  await expect(declinations.locator('tbody tr').first()).toContainText(/\d+°\d{2}′ [NS]/);
  const parallels = page.getByRole('table', { name: 'Directed-to-natal parallels' });
  await expect(
    parallels.or(page.getByText('No directed-to-natal parallels or contraparallels within orb.')),
  ).toBeVisible();

  // Back to longitude: the screen is as it was.
  await directedIn.selectOption('longitude');
  await expect(page.getByRole('table', { name: 'Directed positions' })).toBeVisible();
  await expect(page.getByText('Longitude only: declination is not directed.')).toBeVisible();
});

test('the Solar Arc screen takes an arc, a multiplier and converse, and hides them for declination (#1407)', async () => {
  test.setTimeout(90_000);
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('tab', { name: 'Solar Arc', exact: true }).click();
  const arc = page.getByLabel('Arc', { exact: true });
  const multiplier = page.getByLabel('Multiplier', { exact: true });
  const converse = page.getByLabel('Converse (backwards in time)', { exact: true });
  await expect(arc).toHaveValue('solar');
  await expect(multiplier).toHaveValue('1');
  await expect(converse).not.toBeChecked();
  const positions = page.getByRole('table', { name: 'Directed positions' });
  await expect(positions).toBeVisible();
  const before = await positions.locator('tbody tr').first().innerText();

  await arc.selectOption('ascendant');
  await multiplier.selectOption('0.5');
  await converse.check();
  await expect(page.locator('.page-header-basis')).toContainText('Ascendant arc');
  await expect(page.locator('.page-header-basis')).toContainText('MC by solar arc in longitude');
  await expect(page.locator('.page-header-basis')).toContainText('×0.5');
  await expect(page.locator('.page-header-basis')).toContainText('converse (backwards in time)');
  await expect(positions).toBeVisible();
  await expect.poll(() => positions.locator('tbody tr').first().innerText()).not.toBe(before);
  // The Ascendant arc has no simple inverse in time, so its contacts carry no exact dates, by design.
  const contacts = page.getByRole('table', { name: 'Directed-to-natal contacts' });
  if ((await contacts.count()) > 0) {
    await expect(contacts.getByText('outside search window')).toHaveCount(0);
    await expect(contacts.getByText('not dated for this arc').first()).toBeVisible();
  }

  // Declination takes none of these options: the three controls go, and come back with the longitude view.
  await page.getByLabel('Directed in', { exact: true }).selectOption('declination');
  await expect(arc).toHaveCount(0);
  await expect(multiplier).toHaveCount(0);
  await expect(converse).toHaveCount(0);
  await page.getByLabel('Directed in', { exact: true }).selectOption('longitude');
  await expect(arc).toHaveValue('ascendant');
});

test('the Solar Arc converse control shares its bottom edge with the Arc select at 1280x800 (#1407)', async () => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('tab', { name: 'Solar Arc', exact: true }).click();
  const arc = page.getByLabel('Arc', { exact: true });
  const converse = page.getByLabel('Converse (backwards in time)', { exact: true });
  await expect(converse).toBeVisible();
  const boxOf = async (control: typeof arc): Promise<{ y: number; height: number }> => {
    const box = await control.boundingBox();
    if (box === null) throw new Error('control has no bounding box');
    return box;
  };
  const arcBox = await boxOf(arc);
  const converseBox = await boxOf(page.locator('.progressions-controls .primitive-choice'));
  // The label row above a select is not part of the select's own box, so compare bottom edges of the controls.
  expect(Math.abs(arcBox.y + arcBox.height - (converseBox.y + converseBox.height))).toBeLessThanOrEqual(1);
});

test('a person with an unknown birth time is told solar arc directions need one', async () => {
  await openSharedPerson(page, baseUrl, MARIC);

  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('tab', { name: 'Solar Arc', exact: true }).click();
  await expect(page.getByText(/need a known birth time/)).toBeVisible();
});
