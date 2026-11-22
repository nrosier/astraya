/**
 * Captures every screen listed in `visual-review-screens.json` at 390x844, 1280x800 and 3440x1440 in light and dark, for
 * the owner's visual review (docs/ops/VISUAL-REVIEW.md). It is a capture tool, not a test: it skips unless
 * `VISUAL_REVIEW_OUT` names the folder to write the JPEGs to, so the normal e2e run and CI do nothing here.
 *
 * VISUAL_REVIEW_OUT=<dir> npx playwright test e2e/visual-review.spec.ts --project=chromium
 * node scripts/build-visual-review.mjs <dir> <page.html>
 *
 * A screen's slug in the JSON must have a step below that opens it. Add the step when a screen is added to the review.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { build } from '../server/index.ts';
import { measureCards } from '../scripts/measure-cards.mjs';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { choosePill, gotoAndSettle, openChart, openNatalChart, setLanguage } from './support.ts';

const OUT = process.env.VISUAL_REVIEW_OUT;
const SIZES = [
  { w: 390, h: 844 },
  { w: 1280, h: 800 },
  { w: 3440, h: 1440 },
] as const;
const THEMES = ['light', 'dark'] as const;

test.skip(OUT === undefined, 'Set VISUAL_REVIEW_OUT to capture the visual review screenshots');

async function shoot(
  page: Page,
  slug: string,
  ready?: () => Promise<void>,
  sizes: readonly (typeof SIZES)[number][] = SIZES,
): Promise<void> {
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    for (const size of sizes) {
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
      // The card measurements for scripts/measure-cards.mjs, beside the shot.
      writeFileSync(
        join(OUT ?? '', `${slug}__${String(size.w)}__${theme}.cards.json`),
        JSON.stringify(await measureCards(page)),
      );
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test('capture the screens of the visual review', async ({ browser }) => {
  test.setTimeout(1_800_000);
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
  // #1609: the almuten candidate table on Patterns & condition (Detriment, Fall and Mutual reception columns).
  await page.getByRole('link', { name: 'Patterns & condition', exact: true }).click();
  const almutenTable = page.getByRole('table', { name: 'Almuten candidates' });
  await almutenTable.waitFor({ timeout: 60_000 });
  const showAlmuten = async (): Promise<void> => {
    await almutenTable.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  };
  await showAlmuten();
  await shoot(page, '64-charts-almuten-candidates', showAlmuten);
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
  // #1855: the Consultation header unscrolled. The card above leaves the page scrolled, so scroll back to the top before
  // each shot (shoot() runs this before every size and theme) and wait for the header controls to be on screen.
  const showConsultationHeader = async (): Promise<void> => {
    await page.evaluate('window.scrollTo(0, 0)');
    await page.getByRole('link', { name: 'View Chart Wheel', exact: true }).first().waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
  };
  await showConsultationHeader();
  await shoot(page, '06b-consultation-header-top', showConsultationHeader);

  await page.getByRole('link', { name: 'Interpretation', exact: true }).first().click();
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  // The reading comes from the corpus chunks (`npm run corpus:split`); without them the page says it could not load.
  await expect(page.getByText(/Could not load the interpretation/)).toHaveCount(0, { timeout: 30_000 });
  await shoot(page, '07-interpretation');

  await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Transits', exact: true }).click();
  await page.getByRole('table', { name: 'Contacts' }).waitFor({ timeout: 60_000 });
  await shoot(page, '08-transits');

  // #1508: the Change filters dialog. It is a dialog at desktop widths and a bottom sheet below 40rem. It closes on resize,
  // so reopen it before each shot.
  const transitsUrl = page.url();
  const filterDialog = page.getByRole('dialog', { name: 'Change filters', exact: true });
  const reopenFilters = async (): Promise<void> => {
    if (await filterDialog.isVisible()) return;
    await page.getByRole('button', { name: 'Change filters', exact: true }).click();
    await filterDialog.waitFor({ state: 'visible' });
    await page.waitForTimeout(400);
  };
  await reopenFilters();
  await shoot(page, '41-transits-filter-open', reopenFilters);
  await shoot(page, '45-transits-filter-phone-sheet', reopenFilters, [SIZES[0]]);
  await shoot(page, '47-filter-overhaul-desktop', reopenFilters, [SIZES[1], SIZES[2]]);
  await shoot(page, '48-filter-overhaul-phone', reopenFilters, [SIZES[0]]);
  await page.keyboard.press('Escape');
  await filterDialog.waitFor({ state: 'hidden' });

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
  // #1508: the same drawer, shot at phone width as the second multi-row sheet (the drawer is still open from 21).
  await shoot(page, '46-overlay-settings-phone-sheet', reopenOverlays, [SIZES[0]]);

  // #1190: a consultation preset that adds lines to the Selection card.
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openNatalChart(page);
  await choosePill(page, 'Consultation preset', 'Predictive and timing: major and hard minor');
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

  // #1407: the Heliocentric chart type (no houses, the Earth for the Sun).
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await openChart(page, 'Heliocentric');
  await page.locator('div.chart-wheel').waitFor({ timeout: 60_000 });
  await shoot(page, '51-charts-heliocentric');

  // #1407: Extended settings with a user-defined ayanamsa (Sidereal, then User-defined). A resize closes the drawer and
  // drops its draft, so each shot reopens it and chooses again.
  await openNatalChart(page);
  await page.locator('div.chart-wheel').waitFor();
  const userAyanamsa = page.getByRole('group', { name: 'User-defined ayanamsa', exact: true });
  const reopenUserAyanamsa = async (): Promise<void> => {
    if (await userAyanamsa.isVisible()) return;
    const actions = page.getByRole('button', { name: 'Chart actions', exact: true });
    if (await actions.isVisible()) await actions.click();
    await page.locator('button.extended-settings-trigger:visible').first().click();
    const card = page.locator('dialog.settings-card');
    await card.waitFor({ state: 'visible' });
    await card.getByRole('radiogroup', { name: 'Zodiac', exact: true }).getByText('Sidereal', { exact: true }).click();
    await card.getByLabel('Ayanamsa', { exact: true }).selectOption({ label: 'User-defined' });
    await userAyanamsa.waitFor({ state: 'visible' });
    await userAyanamsa.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  };
  await reopenUserAyanamsa();
  await shoot(page, '50-extended-settings-user-ayanamsa', reopenUserAyanamsa);
  await page.keyboard.press('Escape');
  await page.locator('dialog.settings-card').waitFor({ state: 'hidden' });

  // #1407: Progressions with the contacts measured to the transits, and Solar Arc directed in declination.
  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Progressions', exact: true }).click();
  await page.getByLabel('Contacts to', { exact: true }).selectOption('transit');
  await page.getByRole('table', { name: 'Progressed positions' }).waitFor({ timeout: 60_000 });
  await shoot(page, '52-progressions-contacts-transit');
  await page.getByRole('tab', { name: 'Solar Arc', exact: true }).click();
  await page.getByLabel('Directed in', { exact: true }).selectOption('declination');
  await page.getByRole('table', { name: 'Directed declinations' }).waitFor({ timeout: 60_000 });
  await shoot(page, '53-solar-arc-declination');

  // #1401, #1356, #1545: the timing timeline (orb windows, pass numbers, technique tags on the bars).
  await page.getByRole('tab', { name: 'Timing timeline', exact: true }).click();
  await page.locator('.gantt').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
  await shoot(page, '54-timing-timeline');

  // #1439, #1506: the Life Events card on the Birth record, then its management drawer (it closes on resize).
  await page.getByRole('link', { name: 'Birth record', exact: true }).first().click();
  await page.getByRole('heading', { name: /Identity and birth timestamp/ }).waitFor();
  const manage = page.getByRole('button', { name: 'Manage Life Events', exact: true });
  await manage.scrollIntoViewIfNeeded();
  await shoot(page, '55-life-events-card');
  const drawerHeading = page.getByRole('heading', { name: /^Life events, / });
  const reopenLifeEvents = async (): Promise<void> => {
    if (await drawerHeading.isVisible()) return;
    await manage.scrollIntoViewIfNeeded();
    await manage.click();
    await drawerHeading.waitFor({ state: 'visible' });
    await page.waitForTimeout(400);
  };
  await reopenLifeEvents();
  await shoot(page, '56-life-events-drawer', reopenLifeEvents);
  await page.keyboard.press('Escape');

  // #1508: the same phone sheet in Dutch, last so the language switch cannot change the English shots above.
  await setLanguage(page, 'NL');
  await page.goto(transitsUrl);
  const dutchFilterDialog = page.getByRole('dialog', { name: 'Filters wijzigen', exact: true });
  const reopenDutchFilters = async (): Promise<void> => {
    if (await dutchFilterDialog.isVisible()) return;
    await page.getByRole('button', { name: 'Filters wijzigen', exact: true }).click();
    await dutchFilterDialog.waitFor({ state: 'visible' });
    await page.waitForTimeout(400);
  };
  await reopenDutchFilters();
  await shoot(page, '49-filter-overhaul-dutch-phone', reopenDutchFilters, [SIZES[0]]);

  await app.close();
});

/**
 * The M13 and M14 screens with no step above (#1641, #1654, #1668, #1730, #1731, #1732)
 * (the PDFs are the next test).
 */
test('capture the M13 and M14 screens', async ({ browser }) => {
  test.setTimeout(1_800_000);
  mkdirSync(OUT ?? '', { recursive: true });
  process.env.LOG_LEVEL = 'silent';
  const app = await build({ dbPath: join(mkdtempSync(join(tmpdir(), 'visual-review-')), 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  const baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const page = await (await newSeededContext(browser, baseUrl)).newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.waitForURL(/#\/people\/[^/]+\//);

  // #1732: the Export / Import card on its Import tab.
  await page.getByRole('link', { name: 'Birth record', exact: true }).first().click();
  const fileCard = page.getByRole('region', { name: 'Export and import', exact: true });
  await fileCard.getByRole('tab', { name: 'Import', exact: true }).click();
  const showImport = async (): Promise<void> => {
    await fileCard.scrollIntoViewIfNeeded();
  };
  await showImport();
  await shoot(page, '57-birth-record-import-tab', showImport);

  // #1654: the command palette, opened with Ctrl+K and searched.
  await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
  await page.getByText(/^Now: profected/).waitFor({ timeout: 60_000 });
  const palette = page.getByRole('combobox', { name: 'Search features, charts and tabs', exact: true });
  const openPalette = async (): Promise<void> => {
    if (await palette.isVisible()) return;
    await page.keyboard.press('Control+k');
    await palette.waitFor({ state: 'visible' });
    await palette.fill('solar return');
    await page.waitForTimeout(300);
  };
  await openPalette();
  await shoot(page, '61-command-palette', openPalette);
  await page.keyboard.press('Escape');

  // #1641: the wheel after a strict body filter (four transiting planets, four natal points, every aspect type), so it
  // draws only those bodies and the lines between them.
  await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Transits', exact: true }).click();
  await page.getByRole('table', { name: 'Contacts' }).waitFor({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Change filters', exact: true }).click();
  const transiting = page.getByRole('group', { name: 'Transiting planets', exact: true });
  const natal = page.getByRole('group', { name: 'Natal points', exact: true });
  await transiting.getByRole('button', { name: 'Clear', exact: true }).click();
  await natal.getByRole('button', { name: 'Clear', exact: true }).click();
  for (const name of ['Sun', 'Mars', 'Jupiter', 'Saturn']) await transiting.getByLabel(name, { exact: true }).check();
  for (const name of ['Sun', 'Moon', 'Venus', 'Mars']) await natal.getByLabel(name, { exact: true }).check();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  const filteredWheel = page.locator('div.chart-wheel').first();
  await filteredWheel.waitFor();
  const showWheel = async (): Promise<void> => {
    await filteredWheel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  };
  await showWheel();
  await shoot(page, '63-transits-filtered-wheel', showWheel);

  // #1731: the People list with the chart query open and a run applied (Sun in Pisces).
  await page.goto(`${baseUrl}/#/people`);
  await page.getByRole('button', { name: 'Chart query', exact: true }).click();
  await page
    .locator('#chart-query-panel li.cond')
    .first()
    .getByLabel('Sign', { exact: true })
    .selectOption({ label: 'Pisces' });
  await page.getByRole('button', { name: 'Run search', exact: true }).click();
  await page.locator('.people-query-status').waitFor({ timeout: 60_000 });
  await shoot(page, '58-people-query-run');

  // #1730: the bare root, after a person was viewed: People at #/people, with that person's sections in the sidebar.
  await page.goto(`${baseUrl}/`);
  await page.getByRole('heading', { name: 'People', level: 1 }).waitFor();
  await page.waitForURL(/#\/people$/);
  await shoot(page, '59-root-people');

  // #1668: the app icons as shipped (favicons, touch icon, PWA icons), on a plain page at one size.
  await page.setContent(
    `<body style="margin:24px;font:14px system-ui;display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">` +
      ['favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'maskable-512.png']
        .map(
          (file) =>
            `<figure style="margin:0;text-align:center"><img src="${baseUrl}/icons/${file}" alt="${file}" style="display:block;max-width:256px"><figcaption>${file}</figcaption></figure>`,
        )
        .join('') +
      `</body>`,
  );
  // Shoot only once every icon has loaded (the first capture shot a blank page before they did, #1668 verdict).
  const icons = page.locator('img');
  await expect(icons).toHaveCount(6);
  for (const icon of await icons.all()) {
    await expect
      .poll(() =>
        icon.evaluate((image: { complete: boolean; naturalWidth: number }) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
  }
  await shoot(page, '60-app-icons', undefined, [SIZES[1]]);

  await app.close();
});

/**
 * The Complete archive PDF for Einstein in en and nl, for the PDF issues (#1646, #1647, #1648). Saved beside the JPEGs as
 * `pdf-en.pdf` and `pdf-nl.pdf`; their pages are rendered to images outside this spec.
 */
test('capture the review PDFs', async ({ browser }) => {
  test.setTimeout(1_200_000);
  mkdirSync(OUT ?? '', { recursive: true });
  process.env.LOG_LEVEL = 'silent';
  const app = await build({ dbPath: join(mkdtempSync(join(tmpdir(), 'visual-review-')), 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  const baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const page = await (await newSeededContext(browser, baseUrl)).newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.waitForURL(/#\/people\/[^/]+\//);
  // #1646, #1647, #1648: the Complete archive PDF for Einstein, in English and then in Dutch.
  for (const code of ['EN', 'NL'] as const) {
    if (code === 'NL') await setLanguage(page, 'NL');
    await page.getByRole('banner').getByRole('link', { name: 'PDF', exact: true }).click();
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    await page
      .getByLabel(code === 'EN' ? 'Person' : 'Persoon', { exact: true })
      .selectOption({ label: 'Albert Einstein' });
    await choosePill(
      page,
      code === 'EN' ? 'Starting point' : 'Beginpunt',
      code === 'EN'
        ? 'Complete archive (every chart, every table, interpretation)'
        : 'Volledig archief (elke horoscoop, elke tabel, interpretatie)',
    );
    const buildPdf = page.getByRole('button', { name: code === 'EN' ? 'Build PDF' : 'PDF samenstellen', exact: true });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 600_000 }),
      buildPdf.first().click(),
    ]);
    await download.saveAs(join(OUT ?? '', `pdf-${code.toLowerCase()}.pdf`));
  }

  await app.close();
});

/**
 * The sidebar rail (#1747) and the life-event picker in the timing headers (#1770). The rail only exists from 64rem, so
 * its shots skip the phone size. The collapsed rail is shot with focus cleared (owner decision on #1747: the skip link
 * shows on keyboard focus by design), then once with the footer button keyboard-focused to show its tooltip.
 */
test('capture the #1747 and #1770 screens', async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT ?? '', { recursive: true });
  process.env.LOG_LEVEL = 'silent';
  const app = await build({ dbPath: join(mkdtempSync(join(tmpdir(), 'visual-review-')), 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  const baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const page = await (await newSeededContext(browser, baseUrl)).newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const wide = [SIZES[1], SIZES[2]];

  // #1770: give Einstein one life event, so the picker shows, as e2e/life-event-picker-header.spec.ts does.
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('heading', { name: /Identity and birth timestamp/ }).waitFor();
  await page.getByRole('button', { name: 'Manage Life Events' }).click();
  await page.locator('dialog.life-events-drawer[open]').waitFor({ state: 'visible' });
  await page.getByLabel('Date of the new event').fill('1905-06-30');
  await page.getByLabel('Description of the new event').fill('Miracle year');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Save and close' }).click();
  await page.locator('dialog.life-events-drawer[open]').waitFor({ state: 'hidden' });
  const personId = /#\/people\/([^/]+)/.exec(page.url())?.[1];
  if (personId === undefined) throw new Error('no person id in the URL');
  const clearFocus = async (): Promise<void> => {
    await page.evaluate(() => {
      (
        globalThis as unknown as { document: { activeElement: { blur?: () => void } | null } }
      ).document.activeElement?.blur?.();
    });
    await page.mouse.move(0, 0);
  };
  for (const [hash, slug] of [
    ['timing/progressions', '65-progressions-life-event-header'],
    ['timing/solar-arc', '66-solar-arc-life-event-header'],
  ] as const) {
    await page.goto(`${baseUrl}/#/people/${personId}/${hash}`);
    await page.locator('.date-animation-bar .life-event-picker select').first().waitFor({ state: 'visible' });
    await page.locator('.page-header-actions .page-header-export-toggle').waitFor({ state: 'visible' });
    await page.waitForTimeout(600);
    await clearFocus();
    await shoot(page, slug, clearFocus);
  }

  // #1747: the rail expanded (default), then collapsed with focus cleared, then the collapsed toggle's tooltip
  // (#1851 moved the toggle from the footer to the top of the rail; the '69-...-footer-tooltip' slug is a
  // review-page key and stays).
  await page.getByRole('link', { name: 'Birth record', exact: true }).first().click();
  await page.getByRole('heading', { name: /Identity and birth timestamp/ }).waitFor({ timeout: 60_000 });
  await clearFocus();
  await shoot(page, '67-rail-expanded', clearFocus, wide);
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.locator('.workspace-shell-collapsed').waitFor();
  await clearFocus();
  await shoot(page, '68-rail-collapsed', clearFocus, wide);
  const footer = page.getByRole('button', { name: 'Expand sidebar', exact: true });
  const focusFooter = async (): Promise<void> => {
    await footer.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await footer.locator('xpath=following-sibling::*[@role="tooltip"]').waitFor({ state: 'visible' });
  };
  await focusFooter();
  await shoot(page, '69-rail-collapsed-footer-tooltip', focusFooter, wide);
  await footer.click();
  await app.close();
});

/**
 * #1850: the sidebar footer, with its version link, the bullet separator and the About & Licence link. The footer sits in
 * the rail, which is expanded by default from 64rem, so no expand step is needed and the shots skip the phone size.
 */
test('capture the #1850 sidebar footer', async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT ?? '', { recursive: true });
  process.env.LOG_LEVEL = 'silent';
  const app = await build({ dbPath: join(mkdtempSync(join(tmpdir(), 'visual-review-')), 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  const baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const page = await (await newSeededContext(browser, baseUrl)).newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto(`${baseUrl}/`);
  await page.getByRole('link', { name: /^Version / }).waitFor({ state: 'visible' });
  await shoot(page, '76-sidebar-footer', undefined, [SIZES[1], SIZES[2]]);
  await app.close();
});

/**
 * #1834 (the Progressions controls no longer push the phone page sideways), #1798 (the prenatal syzygy row on the
 * chart's Patterns & condition tab) and #1802 (Composite and Synastry, whose control rows moved from <p> to <div>).
 */
test('capture the #1798, #1802 and #1834 screens', async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT ?? '', { recursive: true });
  process.env.LOG_LEVEL = 'silent';
  const app = await build({ dbPath: join(mkdtempSync(join(tmpdir(), 'visual-review-')), 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  const baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const page = await (await newSeededContext(browser, baseUrl)).newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSharedPerson(page, baseUrl, EINSTEIN);

  // #1834: Progressions with its Technique, MC method and Contacts-to row in view.
  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Progressions', exact: true }).click();
  await page.getByRole('table', { name: 'Progressed positions' }).waitFor({ timeout: 60_000 });
  // The phone shot is the whole page, taken from the top: a scrolled full-page shot draws the sticky header mid-page,
  // and the hidden skip link just above it shows up in the capture though no one can see it on a phone.
  const atTopOnPhone = async (scrollTo: () => Promise<void>): Promise<void> => {
    if ((page.viewportSize()?.width ?? 0) <= 390) await page.evaluate('window.scrollTo(0, 0)');
    else await scrollTo();
    await page.waitForTimeout(300);
  };
  const showControls = (): Promise<void> =>
    atTopOnPhone(() => page.locator('.progressions-controls').scrollIntoViewIfNeeded());
  await showControls();
  await shoot(page, '70-progressions-controls', showControls);

  // #1798: the prenatal syzygy row beside the lunar phase and sect.
  await openNatalChart(page);
  await page.getByRole('link', { name: 'Patterns & condition', exact: true }).click();
  const syzygy = page.locator('.prenatal-syzygy-summary');
  await syzygy.waitFor({ timeout: 60_000 });
  const showSyzygy = (): Promise<void> => atTopOnPhone(() => syzygy.scrollIntoViewIfNeeded());
  await showSyzygy();
  await shoot(page, '71-charts-prenatal-syzygy', showSyzygy);

  // #1802: Composite and Synastry with a partner chosen, as e2e/accessibility.spec.ts opens them.
  for (const [tab, label, slug] of [
    ['Composite', 'Compose with', '72-composite-controls'],
    ['Synastry', 'Compare with', '73-synastry-controls'],
  ] as const) {
    await page.getByRole('link', { name: 'Relationship Charts', exact: true }).first().click();
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.getByLabel(label).selectOption({ label: 'Max Born' });
    await page.locator('div.chart-wheel').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(500);
    await shoot(page, slug);
  }
  await app.close();
});

/**
 * #1853 (the horary Hard, Soft and Minor pills take clicks on their words) and #1867 (the Retrograde tooltip on the cycles
 * motion box sits on the word). Both open from a route with no person, as e2e/chart-tone-pill-click.spec.ts and
 * e2e/cycles-golden-path.spec.ts do.
 */
test('capture the #1853 and #1867 screens', async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT ?? '', { recursive: true });
  process.env.LOG_LEVEL = 'silent';
  const app = await build({ dbPath: join(mkdtempSync(join(tmpdir(), 'visual-review-')), 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  const baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const page = await (await newSeededContext(browser, baseUrl)).newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  // #1853: a horary chart cast for London, with the Hard, Soft and Minor pills in view.
  await gotoAndSettle(page, `${baseUrl}/#/explore/horary`);
  await page.getByLabel('Date the question was asked').fill('2024-03-08');
  await page.getByLabel('Local time').fill('12:00');
  await page.getByLabel('Latitude', { exact: true }).fill('51.5072');
  await page.getByLabel('Longitude', { exact: true }).fill('-0.1276');
  await page.getByRole('button', { name: 'Cast chart', exact: true }).click();
  await page.locator('.chart-workbench-dial .chart-wheel svg').first().waitFor({ timeout: 60_000 });
  const tones = page.getByRole('group', { name: 'Aspect families on the wheel', exact: true });
  const showTones = async (): Promise<void> => {
    await tones.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  };
  await showTones();
  await shoot(page, '74-horary-pills', showTones);

  // #1867: the motion filter on planetary cycles, with the Retrograde definition showing above the option.
  await gotoAndSettle(page, `${baseUrl}/#/explore/cycles`);
  await page.getByRole('table').waitFor({ timeout: 60_000 });
  const retrograde = page.getByRole('radio', {
    name: 'Retrograde only (e.g. Venus’s inferior conjunctions)',
    exact: true,
  });
  const option = page.locator('label.primitive-choice', { has: retrograde });
  const showTooltip = async (): Promise<void> => {
    await option.scrollIntoViewIfNeeded();
    await option.locator('.primitive-tooltip-trigger').hover();
    await option.getByRole('tooltip', { includeHidden: true }).waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
  };
  await showTooltip();
  await shoot(page, '75-cycles-retrograde-tooltip', showTooltip);
  await app.close();
});
