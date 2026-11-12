/**
 * The golden path for transits (#172): enter birth data with a known time, open the Transit
 * screen from the person page, and the bi-wheel and contacts table render with a CSV
 * download — the same real worker/DOM/download machinery `chart-golden-path.spec.ts`
 * exercises for the chart, applied to the new screen.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, MARIC, newSeededContext, openSharedPerson } from './shared-people.ts';

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

/** Chooses a preset in the transit filter card, which a header button opens (#1227), and applies it. */
async function choosePreset(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Which transits to show', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Show', exact: true }).getByLabel(label, { exact: true }).check();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
}

test.describe('with the shared people (#799)', () => {
  let context: BrowserContext;
  let page: Page;

  // A fresh context per test, holding the shared people; no test here saves, edits or deletes one.
  test.beforeEach(async ({ browser }) => {
    context = await newSeededContext(browser, baseUrl);
    page = await context.newPage();
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('a person with a known birth time gets a Transit screen with a bi-wheel and contacts table', async () => {
    test.setTimeout(60_000);

    await openSharedPerson(page, baseUrl, EINSTEIN);

    await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).click();
    await page.getByRole('tab', { name: 'Transits', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: /transits/i })).toBeVisible();
    await expect(page.locator('.page-header-basis')).toHaveText('Tropical · Placidus · Modern rulers · Standard orbs');
    await expect(page.locator('div.chart-wheel')).toBeVisible();
    await expect(page.locator('div.chart-wheel svg')).toHaveCount(1);
    await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();

    // Important-only by default (#416): the count, the table rows and the wheel's cross-ring lines
    // all agree, and "All transits" widens every one of them.
    const countText = async (): Promise<[number, number]> => {
      const text = (await page.locator('.filter-summary-count').textContent()) ?? '';
      const match = /· (\d+) of (\d+) shown$/.exec(text);
      if (match === null) throw new Error(`unexpected count text: ${text}`);
      return [Number(match[1]), Number(match[2])];
    };
    const rows = page.getByRole('table', { name: 'Contacts' }).locator('tbody tr');
    const crossLines = page.locator('div.chart-wheel .chart-aspect-link[data-ring-a="1"][data-ring-b="0"]');
    const [shown, total] = await countText();
    expect(shown).toBeLessThan(total);
    await expect(rows).toHaveCount(shown);
    await expect(crossLines).toHaveCount(shown);
    // The collapsible explainer under the date bar (#1400, #1440) is closed on arrival, and its count is the live one.
    const explainer = page.getByRole('button', { name: /Show explanation/ });
    await expect(explainer).toHaveAttribute('aria-expanded', 'false');
    await explainer.click();
    const panel = page.locator('.primitive-disclosure-panel').filter({ hasText: 'Speed multiplies' });
    await expect(panel).toContainText(`Important · ${String(shown)} of ${String(total)} shown`);
    await choosePreset(page, 'All');
    await expect(rows).toHaveCount(total);
    await expect(crossLines).toHaveCount(total);
    await expect(panel).toContainText(`All · ${String(total)} of ${String(total)} shown`);
    await choosePreset(page, 'Important');

    // Click-to-isolate (#418): the transiting Saturn is picked out on its own ring, the panel names
    // the ring, and a second click clears it.
    const transitingSaturn = page.locator('div.chart-wheel .chart-point[data-body="saturn"][data-ring="1"]');
    await transitingSaturn.locator('.chart-hit-area').click();
    await expect(page.locator('.chart-isolation-head strong')).toHaveText('Saturn (Transit)');
    await expect(page.locator('div.chart-wheel .chart-dimmed').first()).toBeAttached();
    await expect(transitingSaturn).not.toHaveClass(/chart-dimmed/);

    // The AI interpretation of the selected placement (#424): offered below the card for a planet,
    // disabled with its reason while nobody is signed in, and accessible.
    const focusButton = page.getByRole('button', { name: 'Interpret the tensions of this placement' });
    await expect(focusButton).toBeVisible();
    await expect(focusButton).toBeDisabled();
    await expect(page.locator('.focus-interpretation')).toContainText('Sign in to generate an AI interpretation');
    const focusAxe = await new AxeBuilder({ page }).include('.focus-interpretation').analyze();
    expect(focusAxe.violations.map((v) => v.id)).toEqual([]);
    await transitingSaturn.locator('.chart-hit-area').click();
    await expect(page.locator('.chart-isolation-panel')).toHaveCount(0);
    await expect(page.locator('.focus-interpretation')).toHaveCount(0);
    await expect(page.locator('div.chart-wheel .chart-dimmed')).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download CSV', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('albert-einstein-transit-contacts.csv');
  });

  test('a person with an unknown birth time is told transits need one', async () => {
    await openSharedPerson(page, baseUrl, MARIC);

    await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).click();
    await page.getByRole('tab', { name: 'Transits', exact: true }).click();
    await expect(page.getByText(/needs a known birth time/)).toBeVisible();
  });
});
