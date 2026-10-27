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
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';

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

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

/**
 * The transit tables are cast for a fixed day, so the count of "No further exact pass" dashes (a pass
 * is listed only when one is still ahead) does not change with the calendar. 2026-01-15 (local noon)
 * is the day the Einstein fixture was probed: 2 of its 5 major transit rows have no exact pass left.
 * Under the real clock the count was 0 on 2026-10-27 and 3 on 2027-03-15, which is why it is pinned.
 */
const PINNED_DAY = new Date('2026-01-15T12:00:00');
const PINNED_NO_PASS_DASHES = 2;

/**
 * The table's width depends on the font the browser picks, which differs between macOS, Ubuntu CI and
 * other machines. The layout test pins the one font the repo ships (`public/fonts/pdf/`, served from
 * `dist/fonts/pdf/` under `font-src 'self'`), and only for the transit table.
 */
const PINNED_TABLE_FONT_FILE = 'DejaVuSans.ttf';
const PINNED_TABLE_FONT = 'E2E Pinned Table';

// A fresh context per test, holding the shared people (#799); no test here saves, edits or deletes one.
test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
  await page.clock.setFixedTime(PINNED_DAY);
});

test.afterEach(async () => {
  await context.close();
});

test('a person with a known birth time gets a Consultation screen with transits, timing tracks and highlights', async () => {
  test.setTimeout(60_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);

  await page.getByRole('link', { name: 'Consultation', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /consultation/i })).toBeVisible();

  // The page is cast for the moment it opened, to the minute, and Now recasts it (#676).
  await expect(page.getByText(/^As of \d{4}-\d{2}-\d{2} \d{2}:\d{2}, your local time/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Now', exact: true }).click();

  // Summary first, then the grouped sections (#669), each one heading level below the title.
  await expect(page.getByRole('heading', { level: 2, name: 'At a glance' })).toBeVisible();
  for (const term of ['Sun', 'Moon', 'Ascendant', 'Chart ruler', 'Profection year']) {
    await expect(page.locator('.consultation-glance dt', { hasText: term }).first()).toBeVisible();
  }
  for (const heading of [
    'Major active transits',
    'Chart highlights',
    'Time lords and cycles',
    'Zodiacal releasing and directions',
  ]) {
    await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible();
  }
  // Transits to the angles are listed apart from the ranked ones (#678), one disclosure per angle (D-800a).
  await expect(page.getByRole('button', { name: /^Transits to the Ascendant/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Transits to the Midheaven/ })).toBeVisible();
  // No duplicate launchpad: one link per section, the rest in the page header.
  await expect(page.getByRole('heading', { level: 2, name: 'Next' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View all transits', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Open Patterns & condition', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open interpretation', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Build PDF', exact: true })).toBeVisible();
  // Detail a session rarely needs first is behind a disclosure.
  await expect(page.getByRole('button', { name: /More chart detail/ })).toBeVisible();

  // The link actually opens the full canonical screen (one home per feature).
  await page.getByRole('link', { name: 'View all transits', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /transits/i })).toBeVisible();
});

for (const { width, height } of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`the consultation layout holds at ${String(width)}px: tiles, 60/40 grid, a disclosure per angle, scrolling tables (#800)`, async () => {
    test.setTimeout(60_000);
    // Open the person at the desktop size, where the workspace nav shows the Consultation link, then resize.
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('link', { name: 'Consultation', exact: true }).click();
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('heading', { level: 2, name: 'Major active transits' })).toBeVisible();

    // Pin the table font before measuring, and wait until it has loaded so the widths use it.
    await page.addStyleTag({
      content: `@font-face { font-family: "${PINNED_TABLE_FONT}"; src: url("/fonts/pdf/${PINNED_TABLE_FONT_FILE}") format("truetype"); }
.consultation-section .data-table { font-family: "${PINNED_TABLE_FONT}"; }`,
    });
    await page.evaluate(`document.fonts.load('1em "${PINNED_TABLE_FONT}"')`);
    const tableFamily = String(
      await page.evaluate("getComputedStyle(document.querySelector('.consultation-section .data-table')).fontFamily"),
    );
    expect(tableFamily).toContain(PINNED_TABLE_FONT);

    // Tiles replace the At a glance list: 2 columns on a phone, 4 at 1280 (the shell is 64rem wide here).
    const tiles = page.locator('dl.consultation-tiles');
    await expect(tiles.locator('dt')).toHaveText([
      'Sun',
      'Moon',
      'Ascendant',
      'Chart ruler',
      'Sect',
      'Profection year',
    ]);
    // Columns follow the page's own content width (a container query): 2 below 40rem, 4 to 64rem, 6 above.
    const layoutRem = Number(
      await page.evaluate(
        "document.querySelector('.consultation-layout').getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize)",
      ),
    );
    const columns = String(
      await page.evaluate("getComputedStyle(document.querySelector('dl.consultation-tiles')).gridTemplateColumns"),
    ).split(' ').length;
    expect(columns).toBe(layoutRem >= 64 ? 6 : layoutRem >= 40 ? 4 : 2);
    if (width === 390) expect(columns).toBe(2);

    // One column on a phone; about 60/40 at 1280.
    const [left, right] = await page.locator('.consultation-col').all();
    const leftBox = await left?.boundingBox();
    const rightBox = await right?.boundingBox();
    if (leftBox === undefined || leftBox === null || rightBox === undefined || rightBox === null)
      throw new Error('both consultation columns should render');
    if (width === 390) {
      expect(rightBox.y).toBeGreaterThan(leftBox.y + leftBox.height - 1);
    } else {
      expect(Math.abs(rightBox.y - leftBox.y)).toBeLessThanOrEqual(1);
      const share = leftBox.width / (leftBox.width + rightBox.width);
      expect(share).toBeGreaterThan(0.55);
      expect(share).toBeLessThan(0.65);
    }

    // The major transit table: four columns, in a focusable scroll region; an em dash is named when no pass is left.
    const table = page.locator('.consultation-section .data-table-scroll');
    await expect(table.first().getByRole('columnheader')).toHaveText(['Aspect', 'Orb', 'State', 'Next exact date']);
    await expect(table).toHaveCSS('overflow-x', 'auto');
    // The pinned day leaves exactly PINNED_NO_PASS_DASHES rows with no exact pass ahead; each shows an em dash.
    const dashes = table.getByRole('img', { name: 'No further exact pass' });
    await expect(dashes).toHaveCount(PINNED_NO_PASS_DASHES);
    for (const dash of await dashes.all()) {
      await expect(dash).toHaveText('—');
    }
    const overflow = Number(
      await page.evaluate(
        "(() => { const el = document.querySelector('.consultation-section .data-table-scroll'); return el.scrollWidth - el.clientWidth; })()",
      ),
    );
    if (width === 390) expect(overflow).toBeGreaterThan(0);
    else expect(overflow).toBeLessThanOrEqual(1);
    // The page itself never scrolls sideways: the table scrolls inside its frame.
    const pageOverflow = Number(await page.evaluate('document.documentElement.scrollWidth - window.innerWidth'));
    expect(pageOverflow).toBeLessThanOrEqual(0);

    // Both angle disclosures exist and open on their own, each with its own table or its empty note.
    for (const angle of ['Ascendant', 'Midheaven']) {
      const trigger = page.getByRole('button', { name: new RegExp(`^Transits to the ${angle}`) });
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const panel = page.locator('.primitive-disclosure.open').filter({ has: trigger });
      await expect(panel.locator('.data-table-scroll').or(panel.locator('.hint'))).toBeVisible();
    }
    await expect(page.locator('.primitive-disclosure.open')).toHaveCount(2);
  });
}
