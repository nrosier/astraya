/**
 * Captures every screen listed in `visual-review-screens.json` at 390x844, 1920x1080 and 1280x800 in light and dark, for
 * the owner's visual review (docs/ops/VISUAL-REVIEW.md). It is a capture tool, not a test: it skips unless
 * `VISUAL_REVIEW_OUT` names the folder to write the JPEGs to, so the normal e2e run and CI do nothing here.
 *
 * VISUAL_REVIEW_OUT=<dir> npx playwright test e2e/visual-review.spec.ts --project=chromium
 * node scripts/build-visual-review.mjs <dir> <page.html>
 *
 * A screen's slug in the JSON must have a step below that opens it. Add the step when a screen is added to the review.
 */
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { gotoAndSettle, openNatalChart } from './support.ts';

const OUT = process.env.VISUAL_REVIEW_OUT;
const SIZES = [
  { w: 390, h: 844 },
  { w: 1280, h: 800 },
  { w: 1920, h: 1080 },
] as const;
const THEMES = ['light', 'dark'] as const;

test.skip(OUT === undefined, 'Set VISUAL_REVIEW_OUT to capture the visual review screenshots');

async function shoot(page: Page, slug: string, ready?: () => Promise<void>): Promise<void> {
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await page.waitForTimeout(350);
      // A screen whose open state does not survive a resize reopens itself here.
      if (ready !== undefined) await ready();
      await page.screenshot({
        path: join(OUT ?? '', `${slug}__${String(size.w)}__${theme}.jpg`),
        type: 'jpeg',
        quality: 58,
        // The phone shot is the whole page; the wide ones are the first screen.
        fullPage: size.w === 390,
      });
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test('capture the screens of the visual review', async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(OUT ?? '', { recursive: true });
  process.env.LOG_LEVEL = 'silent';
  const app = await build({ dbPath: join(mkdtempSync(join(tmpdir(), 'visual-review-')), 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  const baseUrl = `http://127.0.0.1:${String(address.port)}`;

  // First use: nobody stored.
  const empty = await (await browser.newContext()).newPage();
  await gotoAndSettle(empty, `${baseUrl}/#/people`);
  await empty.getByText('Nobody yet.', { exact: false }).waitFor();
  await shoot(empty, '01-people-first-use');
  await gotoAndSettle(empty, `${baseUrl}/#/about`);
  await empty.getByRole('heading', { level: 1 }).waitFor();
  await shoot(empty, '02-about');

  const page = await (await newSeededContext(browser, baseUrl)).newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSharedPerson(page, baseUrl, EINSTEIN);

  await openNatalChart(page);
  await page.locator('div.chart-wheel').waitFor();
  await shoot(page, '03-charts-natal');

  // #1532: the Charts tabs beside the wheel, then the wheel with a transit ring (the bar's ring toggle shows).
  for (const [tab, slug, ready] of [
    ['Placements', '27-charts-placements', '#chart-view-placements table'],
    ['Aspects', '28-charts-aspects', '#chart-view-aspects table'],
    ['Aspect matrix', '29-charts-matrix', '.mgrid'],
  ] as const) {
    await page.getByRole('link', { name: tab, exact: true }).click();
    await page.locator(ready).first().waitFor({ timeout: 60_000 });
    await shoot(page, slug);
  }
  await page.getByRole('link', { name: 'Wheel', exact: true }).click();
  await page.locator('div.chart-wheel').waitFor();
  await page.locator('.chart-overlay-settings button.chart-overlay-trigger').click();
  const overlayDialog = page.locator('.chart-overlay-settings dialog');
  await overlayDialog.getByRole('checkbox', { name: 'Transit ring', exact: true }).check();
  await overlayDialog.getByRole('button', { name: 'Apply overlays', exact: true }).click();
  await page.locator('[data-ring-legend="1"]').waitFor({ timeout: 60_000 });
  await shoot(page, '26-charts-natal-transit');

  await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
  await page.getByText(/^Now: profected/).waitFor({ timeout: 60_000 });
  await page.locator('.overview-wheel svg').waitFor();
  await shoot(page, '04-overview');

  await page.getByRole('link', { name: 'Birth record', exact: true }).first().click();
  await page.getByRole('heading', { name: /Identity and birth timestamp/ }).waitFor();
  await page
    .getByRole('button', { name: /Timezone details/ })
    .first()
    .click();
  await shoot(page, '05-birth-record-open-card');

  await page.getByRole('link', { name: 'Consultation', exact: true }).first().click();
  await page.locator('.consultation-grid').waitFor({ timeout: 60_000 });
  await page.locator('.consultation-grid .primitive-disclosure-trigger').first().click();
  await shoot(page, '06-consultation-open-card');

  await page.getByRole('link', { name: 'Interpretation', exact: true }).first().click();
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  // The reading comes from the corpus chunks (`npm run corpus:split`); without them the page says it could not load.
  await expect(page.getByText(/Could not load the interpretation/)).toHaveCount(0, { timeout: 30_000 });
  await shoot(page, '07-interpretation');

  await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Transits', exact: true }).click();
  await page.getByRole('table', { name: 'Contacts' }).waitFor({ timeout: 60_000 });
  await shoot(page, '08-transits');
  await page.getByRole('tab', { name: 'Forecast', exact: true }).click();
  await page.getByRole('heading', { name: 'Daily', level: 2 }).waitFor({ timeout: 60_000 });
  await shoot(page, '09-forecast-daily');
  await page
    .getByRole('tablist', { name: 'Forecast period' })
    .getByRole('tab', { name: 'Yearly', exact: true })
    .click();
  await shoot(page, '10-forecast-yearly');

  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).first().click();
  for (const [tab, slug, ready] of [
    ['Timing timeline', '11-timing-timeline', '.gantt'],
    ['Profections', '12-profections', 'table'],
    ['Progressions', '13-progressions', 'table'],
    ['Solar Arc', '14-solar-arc', 'table'],
    ['Primary Directions (Placidus)', '15-primary-directions', '.timing-controls'],
  ] as const) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.locator(ready).first().waitFor({ timeout: 90_000 });
    await page.waitForTimeout(800);
    await shoot(page, slug);
  }

  await openNatalChart(page);
  await page.locator('button.extended-settings-trigger').click();
  // Wait for the drawer to be open and visible, not just attached: the shot must show the settings, not the page behind.
  // The drawer is the card with the 'Extended settings' heading; wait for that text to be on screen.
  await page.getByRole('heading', { name: 'Extended settings', exact: true }).waitFor({ state: 'visible' });
  // A resize closes the drawer, so reopen it before each shot: shoot() resizes between sizes (see shoot()).
  const reopenExtended = async (): Promise<void> => {
    const heading = page.getByRole('heading', { name: 'Extended settings', exact: true });
    if (await heading.isVisible()) return;
    // At phone width the trigger sits in the Chart actions sheet, as the overlay step handles it.
    const actions = page.getByRole('button', { name: 'Chart actions', exact: true });
    if (await actions.isVisible()) await actions.click();
    await page.locator('button.extended-settings-trigger:visible').first().click();
    await heading.waitFor({ state: 'visible' });
    await page.waitForTimeout(400);
  };
  await shoot(page, '16-extended-settings-advanced-closed', reopenExtended);
  // Close the drawer so the page behind it is reachable for the next steps.
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'Extended settings', exact: true }).waitFor({ state: 'hidden' });

  // #1229: the Consultation transit tables, without a card opened.
  await page.getByRole('link', { name: 'Consultation', exact: true }).first().click();
  await page.locator('.consultation-grid').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
  await shoot(page, '17-consultation-transit-tables');

  // #1225: a page reached by a click from Overview shows where it came from.
  await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
  await page.getByText(/^Now: profected/).waitFor({ timeout: 60_000 });
  await page.getByRole('link', { name: 'View transits', exact: true }).click();
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await shoot(page, '18-back-link');

  // #1161: the screens whose raw buttons became the Button primitive.
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await shoot(page, '19-people-list');
  await gotoAndSettle(page, `${baseUrl}/#/preferences`);
  await page.getByRole('tab', { name: 'Astrology Defaults', exact: true }).click();
  await page.waitForTimeout(500);
  await shoot(page, '20-preferences-astrology');
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openNatalChart(page);
  const reopenOverlays = async (): Promise<void> => {
    const drawer = page.locator('.chart-overlay-settings dialog[open]');
    if ((await drawer.count()) > 0) return;
    // At phone width the trigger sits in the Chart actions sheet.
    const actions = page.getByRole('button', { name: 'Chart actions', exact: true });
    if (await actions.isVisible()) await actions.click();
    await page.locator('button.chart-overlay-trigger:visible').first().click();
    await drawer.waitFor();
    await page.waitForTimeout(400);
  };
  await shoot(page, '21-chart-overlay-settings', reopenOverlays);

  // #1190: a consultation preset that adds lines to the Selection card.
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openNatalChart(page);
  await page.getByLabel('Consultation preset').selectOption({ label: 'Predictive and timing: major and hard minor' });
  await page.getByText(/^Active Time Lord/).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
  await shoot(page, '22-chart-preset-predictive');

  // #1261: a saved search in Continue where you left off.
  await page.getByRole('banner').getByRole('link', { name: 'Tools', exact: true }).click();
  await page
    .getByRole('tablist', { name: 'Tools subtabs' })
    .getByRole('tab', { name: 'Ephemeris research', exact: true })
    .click();
  await page.getByLabel('Query name', { exact: true }).fill('Mars stations 2027');
  await page.getByRole('button', { name: 'Save query', exact: true }).click();
  await page.getByText('Saved “Mars stations 2027”.').waitFor();
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
  await page.getByRole('link', { name: /^Saved search:/ }).waitFor({ timeout: 60_000 });
  await shoot(page, '23-overview-saved-search');

  // #1404: the graphic ephemeris tool (classical seven, one-year default).
  await gotoAndSettle(page, `${baseUrl}/#/explore/graphic-ephemeris`);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.waitForTimeout(800);
  await shoot(page, '24-graphic-ephemeris');

  // #1445: the rectification screen (the method and its limits sit in a closed disclosure).
  await gotoAndSettle(page, `${baseUrl}/#/explore/rectification`);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.waitForTimeout(800);
  await shoot(page, '25-rectification');

  await app.close();
});
