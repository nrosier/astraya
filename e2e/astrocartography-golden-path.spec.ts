/**
 * The golden path for the astrocartography/Local Space map (#171): a person with a known birth
 * time, opening the Astrocartography screen from their page, the map rendering, a line-type
 * checkbox changing what's drawn, and the SVG export downloading — the same real worker/DOM/
 * download machinery `chart-golden-path.spec.ts` exercises for the natal wheel.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { chooseExport, createPerson, gotoAndSettle } from './support.ts';

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

async function openMapSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Map settings/ }).click();
  await expect(page.getByRole('dialog', { name: 'Map settings' })).toBeVisible();
}

async function applyMapSettings(page: Page): Promise<void> {
  await page.getByRole('dialog', { name: 'Map settings' }).getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Map settings' })).toBeHidden();
}

async function openAda(page: Page): Promise<void> {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  // On a phone the navigation is folded behind the Menu button.
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name: 'Astrocartography', exact: true }).click();
  await expect(page.locator('div.acg-map svg')).toBeVisible();
}

test('a person with a known birth time gets an Astrocartography map and the SVG export downloads', async ({ page }) => {
  test.setTimeout(60_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });

  await page.getByRole('link', { name: 'Astrocartography', exact: true }).click();
  await expect(page.getByRole('heading', { name: /astrocartography/i, level: 1 })).toBeVisible();
  await expect(page.locator('div.acg-map')).toBeVisible();
  await expect(page.locator('div.acg-map svg')).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), chooseExport(page, 'Download SVG')]);
  expect(download.suggestedFilename()).toBe('ada-lovelace-astrocartography.svg');

  const contents = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of contents) chunks.push(chunk as Buffer);
  const svg = Buffer.concat(chunks).toString('utf-8');
  expect(svg).toContain('<svg');

  // What each line means, from the reviewed corpus text rather than the mechanical fallback (#427).
  await expect(page.getByRole('heading', { name: 'What the lines mean', level: 2 })).toBeVisible();
  const sun = page.locator('.acg-meanings .primitive-disclosure').first();
  await sun.getByRole('button').click();
  await expect(sun.locator('dd').first()).not.toContainText('Sun on the Midheaven line.');
  expect((await sun.locator('dd').first().textContent())?.length ?? 0).toBeGreaterThan(40);
});

test('unchecking a line type removes it from the map', async ({ page }) => {
  test.setTimeout(60_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });

  await page.getByRole('link', { name: 'Astrocartography', exact: true }).click();
  await expect(page.locator('div.acg-map svg')).toBeVisible();

  const mcLines = page.locator('div.acg-map .acg-line-mc');
  const before = await mcLines.count();
  expect(before).toBeGreaterThan(0);

  await openMapSettings(page);
  await page.getByLabel('MC (Midheaven)').uncheck();
  await applyMapSettings(page);
  await expect(mcLines).toHaveCount(0);
});

test('enabling Local Space adds lines for the checked bodies', async ({ page }) => {
  test.setTimeout(60_000);

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });

  await page.getByRole('link', { name: 'Astrocartography', exact: true }).click();
  await expect(page.locator('div.acg-map svg')).toBeVisible();

  const localSpaceLines = page.locator('div.acg-map .acg-line-local-space');
  await expect(localSpaceLines).toHaveCount(0);

  await openMapSettings(page);
  await page.getByLabel('Show Local Space lines for the checked bodies').check();
  await applyMapSettings(page);
  await expect(localSpaceLines.first()).toBeVisible();
});

test('a person with an unknown birth time is told the map needs one', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, {
    name: 'Unknown Time',
    date: '1990-01-01',
    latitude: '40.7128',
    longitude: '-74.006',
  });

  await page.getByRole('link', { name: 'Astrocartography', exact: true }).click();
  await expect(page.getByText(/needs a known birth time/)).toBeVisible();
});

test('the map settings are one staged dialog: opening and cancelling never change the map, and nothing "Extended" remains (#512)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openAda(page);
  const trigger = page.getByRole('button', { name: /^Map settings/ });
  await expect(trigger).toContainText('4 line types · 7 bodies · Local Space off');
  // The settings are not scattered over the page any more.
  await expect(page.getByRole('group', { name: 'Line types' })).toHaveCount(0);
  await expect(page.getByText('Extended', { exact: true })).toHaveCount(0);

  const markup = await page.locator('div.acg-map').innerHTML();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Map settings' });
  await expect(dialog.getByRole('group', { name: 'Primary bodies' })).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Additional bodies' })).toBeVisible();
  await dialog.getByLabel('MC (Midheaven)').uncheck();
  await dialog.getByLabel('Show Local Space lines for the checked bodies').check();
  // Nothing happens to the map, or to the trigger's summary, until Apply.
  expect(await page.locator('div.acg-map').innerHTML()).toBe(markup);

  // Cancel, Escape, the close button and the backdrop each discard the draft and give focus back.
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  for (const close of ['escape', 'close', 'backdrop'] as const) {
    await trigger.click();
    await expect(dialog.getByLabel('MC (Midheaven)')).toBeChecked();
    await dialog.getByLabel('MC (Midheaven)').uncheck();
    if (close === 'escape') await page.keyboard.press('Escape');
    else if (close === 'close') await dialog.getByRole('button', { name: 'Close without applying' }).click();
    else await page.mouse.click(2, 2);
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  expect(await page.locator('div.acg-map').innerHTML()).toBe(markup);
  await expect(trigger).toContainText('4 line types · 7 bodies · Local Space off');
});

test('applying several changes at once is one recalculation, with the last map kept on screen meanwhile (#512)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openAda(page);
  await page.evaluate(`(() => {
    window.__acgReplacements = 0;
    const map = document.querySelector('div.acg-map');
    new MutationObserver((records) => {
      for (const record of records) if (record.type === 'childList') window.__acgReplacements += 1;
    }).observe(map, { childList: true });
  })()`);

  await openMapSettings(page);
  const dialog = page.getByRole('dialog', { name: 'Map settings' });
  await dialog.getByLabel('MC (Midheaven)').uncheck();
  await dialog.getByLabel('IC (Nadir)').uncheck();
  await dialog.getByLabel('Show Local Space lines for the checked bodies').check();
  await dialog.getByLabel('Uranus').check();
  await applyMapSettings(page);

  await expect(page.getByRole('button', { name: /^Map settings/ })).toContainText(
    '2 line types · 8 bodies · Local Space on',
  );
  await expect(page.locator('div.acg-map .acg-line-mc')).toHaveCount(0);
  await expect(page.locator('div.acg-map .acg-line-local-space').first()).toBeVisible();
  await expect(page.locator('div.acg-map')).not.toHaveAttribute('aria-busy', 'true');
  // The map was swapped once for the whole draft, and was never emptied in between.
  expect(await page.evaluate('window.__acgReplacements')).toBe(1);
  await expect(page.locator('div.acg-map svg')).toBeVisible();
});

test('relocation is validated before it can be applied (#512)', async ({ page }) => {
  test.setTimeout(90_000);
  await openAda(page);
  await openMapSettings(page);
  const dialog = page.getByRole('dialog', { name: 'Map settings' });
  const apply = dialog.getByRole('button', { name: /^Apply/ });

  await dialog.getByLabel('Latitude').fill('48.85');
  await expect(dialog.getByText('Enter both latitude and longitude, or leave both empty.')).toBeVisible();
  await expect(apply).toBeDisabled();
  await dialog.getByLabel('Longitude').fill('200');
  await expect(dialog.getByText('Enter a number from -180 to 180.')).toBeVisible();
  await expect(apply).toBeDisabled();
  await dialog.getByLabel('Longitude').fill('2.35');
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(page.getByRole('button', { name: /^Map settings/ })).toContainText('relocated');
  await expect(page.getByText(/Ascendant: .* · Midheaven: /)).toBeVisible();
});

test('the dialog works on a phone and on a short laptop screen, and line meanings say they expand (#512)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openAda(page);
  await openMapSettings(page);
  const dialog = page.getByRole('dialog', { name: 'Map settings' });
  const apply = dialog.getByRole('button', { name: /^Apply/ });
  await expect(apply).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

  // A short laptop: the footer stays reachable and takes well under half the height; the body scrolls.
  await page.setViewportSize({ width: 1280, height: 420 });
  await openMapSettings(page);
  const footer = await dialog.locator('.settings-card-footer').boundingBox();
  expect(footer?.height ?? 999).toBeLessThan(420 * 0.25);
  await expect(apply).toBeInViewport();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

  // The line meanings are real disclosures: a named, counted, labelled button, not a bare triangle.
  const first = page.locator('.acg-meanings .primitive-disclosure').first();
  await expect(first.getByRole('button')).toContainText('Show meanings');
  await expect(first.getByRole('button')).toContainText('4 line types selected');
  await expect(first.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  await first.getByRole('button').click();
  await expect(first.getByRole('button')).toContainText('Hide meanings');
  await expect(first.locator('dd').first()).toBeVisible();
});

test('the Astrocartography page and its settings dialog have no automatically detectable accessibility violations (#512)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openAda(page);
  const resting = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(resting.violations).toEqual([]);
  await openMapSettings(page);
  const open = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(open.violations).toEqual([]);
});
