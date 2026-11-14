/**
 * The chart workbench layout (#511): the dial, then its SelectionInspector straight after it in
 * DOM order; one column below a 68rem workbench container, two columns (a 46rem-minimum dial and a 20-24rem inspector, #817) at 68rem
 * and above, whatever the viewport; and room reserved for the inspector so a first selection does not shove
 * the page.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { applySettings, choosePill, openNatalChart, openSettings } from './support.ts';

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

  test('a sign is selectable from the Placements table by keyboard, and clearable the same way (#511)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page, 'Placements');
    // Einstein's Sun is in Pisces.
    const show = page.getByRole('button', { name: 'Show Pisces on the wheel', exact: true }).first();
    await show.focus();
    await page.keyboard.press('Enter');
    // Show goes straight to the Wheel (#898).
    await expect(page.getByRole('link', { name: 'Wheel', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.selection-inspector-facts .chart-isolation-head strong')).toHaveText('Pisces');
    await expect(page.locator('.chart-sign[data-sign="gemini"]')).toHaveClass(/chart-dimmed/);

    await page.getByRole('link', { name: 'Placements', exact: true }).click();
    await expect(page.locator('.chart-selection-bar')).toContainText('Pisces');
    await page.getByRole('button', { name: 'Clear', exact: true }).first().click();
    await expect(page.locator('.chart-selection-bar')).toHaveCount(0);
  });

  test('a derived point is selectable from the Placements table by keyboard, with its position in the inspector (#511)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page, 'Placements');
    // Part of Spirit is hidden until switched on (#542), like Part of Fortune.
    await openSettings(page, 'Bodies');
    // The checkbox's accessible name now disambiguates visible/participates in aspects (#585).
    await page
      .locator('dialog.settings-card')
      .getByRole('checkbox', { name: 'Part of Spirit — visible', exact: true })
      .check();
    await applySettings(page);
    const show = page.getByRole('button', { name: 'Show Part of Spirit on the wheel', exact: true });
    await show.focus();
    await page.keyboard.press('Enter');
    // Show goes straight to the Wheel (#898).
    await expect(page.getByRole('link', { name: 'Wheel', exact: true })).toHaveAttribute('aria-current', 'page');
    const facts = page.locator('.selection-inspector-facts');
    await expect(facts.locator('.chart-isolation-head strong')).toHaveText('Part of Spirit');
    // The position and house are separate badges now (#801): "Pisces 29°51'" and "House 3".
    await expect(facts).toContainText(/°\d\d'/);
    await expect(facts).toContainText(/House \d+/);
    await expect(facts.locator('.chart-isolation-interpretation')).toBeVisible();
    // The corpus now carries real entries for the derived points: the meaning is written text, not the mechanical
    // "Part of Spirit in Cancer." fallback sentence.
    const meaning = page
      .locator('.selection-inspector')
      .getByText(/^The concerns of the mind and will/)
      .first();
    await expect(meaning).toBeVisible();

    await page.getByRole('link', { name: 'Placements', exact: true }).click();
    await expect(page.locator('tr.data-table-row-selected')).toContainText('Part of Spirit');
    await page.getByRole('button', { name: 'Clear', exact: true }).first().click();
    await expect(page.locator('tr.data-table-row-selected')).toHaveCount(0);
  });

  test('the aspect matrix is a view of its own, and a cell selects its pair on the wheel by mouse and keyboard (#511)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page, 'Aspect matrix');
    await expect(page.getByRole('heading', { name: 'Aspect matrix', level: 2 })).toBeVisible();
    await expect(page.locator('.mgrid')).toBeVisible();

    // Mars trines Pluto in Einstein's chart (Mars 296.91°, Pluto 54.73°: 117.81° apart, 2.19° off exact, inside
    // the 7° major orb): that cell is a button named for the pair.
    const cell = page.getByRole('button', { name: /^Mars Trine Pluto$|^Pluto Trine Mars$/ });
    await cell.click();
    // A click goes straight to the Wheel with the pair highlighted (#898).
    await expect(page.getByRole('link', { name: 'Wheel', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.chart-wheel .chart-dimmed').first()).toBeAttached();
    await expect(page.locator('.selection-inspector-facts')).toBeVisible();

    // The same selection is what the Aspects table shows.
    await page.getByRole('link', { name: 'Aspects', exact: true }).click();
    await expect(page.locator('tr.data-table-row-selected')).toContainText('Trine');

    // Back on the matrix, Enter on the focused cell opens the Wheel again.
    await page.getByRole('link', { name: 'Aspect matrix', exact: true }).click();
    await cell.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: 'Wheel', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('selecting a body keeps only its aspect lines on the wheel, and one control returns all of them (#1063)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const shown = page.locator('svg.chart-dial g.chart-aspect-link:not(.chart-isolate-hidden)');
    const visibleLines = async (): Promise<number> => shown.count();
    // The dial is drawn only once the chart has computed (an async load after the chart type is chosen), so wait for
    // its aspect lines before taking the baseline; a bare count() reads 0 on a slow runner.
    await expect.poll(visibleLines).toBeGreaterThan(3);
    const before = await visibleLines();
    expect(before).toBeGreaterThan(3);

    await page.locator('.chart-point[data-body="sun"]').first().click({ force: true });
    await expect.poll(visibleLines).toBeLessThan(before);
    const after = await visibleLines();
    expect(after).toBeGreaterThan(0);
    // Every line left on the wheel touches the Sun.
    await expect(
      page.locator(
        'svg.chart-dial g.chart-aspect-link:not(.chart-isolate-hidden):not([data-aspect-body-a="sun"]):not([data-aspect-body-b="sun"])',
      ),
    ).toHaveCount(0);

    // The control is keyboard-operable and returns every line while the Sun stays selected.
    const toggle = page.getByRole('button', { name: 'Show all aspects', exact: true });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect.poll(visibleLines).toBe(before);
    await expect(page.getByRole('button', { name: 'Show only this body’s aspects', exact: true })).toBeVisible();

    // Clearing the selection also restores the full wheel.
    await page.getByRole('button', { name: 'Show only this body’s aspects', exact: true }).click();
    await expect.poll(visibleLines).toBe(after);
    await page.getByRole('button', { name: 'Clear', exact: true }).first().click();
    await expect.poll(visibleLines).toBe(before);
  });

  test('the Hard, Soft and Minor pills filter the wheel by tone, and the family Select filters the matrix (#1063, #1532)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const shown = page.locator('svg.chart-dial g.chart-aspect-link:not(.chart-aspect-filtered)');
    await expect.poll(async () => shown.count()).toBeGreaterThan(3);
    const before = await shown.count();

    // On the Wheel tab the pills replace the family Select (owner, 2026-11-13); every pill starts on.
    await expect(page.getByLabel('Aspects shown', { exact: true })).toHaveCount(0);
    const pills = page.getByRole('group', { name: 'Aspect families on the wheel', exact: true });
    const hard = pills.getByRole('button', { name: 'Hard', exact: true });
    await expect(hard).toHaveAttribute('aria-pressed', 'true');
    await hard.click();
    await expect(hard).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => shown.count()).toBeLessThan(before);
    for (const key of ['conjunction', 'square', 'opposition', 'semisquare', 'sesquiquadrate']) {
      await expect(
        page.locator(`svg.chart-dial g.chart-aspect-link:not(.chart-aspect-filtered)[data-aspect-key="${key}"]`),
      ).toHaveCount(0);
    }
    await hard.click();
    await expect.poll(async () => shown.count()).toBe(before);

    // The matrix keeps the family Select.
    await page.getByRole('link', { name: 'Aspect matrix', exact: true }).click();
    const cells = page.locator('.mgrid-aspect');
    await expect(cells.first()).toBeVisible();
    const cellsBefore = await cells.count();
    const filter = page.getByLabel('Aspects shown', { exact: true });
    await filter.selectOption({ label: 'Hard minor: semisquare, sesquiquadrate, quincunx, semisextile' });
    await expect.poll(async () => cells.count()).toBeLessThan(cellsBefore);
    await filter.selectOption({ label: 'All aspects' });
    await expect.poll(async () => cells.count()).toBe(cellsBefore);
  });

  test('the instrument bar sits centred directly under the wheel, one dial draws both wheels, and Natal only hides the transit ring for this view (#1532)', async () => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const wheel = page.locator('.chart-workbench-dial div.chart-wheel');
    const bar = page.getByRole('group', { name: 'Wheel display', exact: true });
    await expect(bar).toBeVisible();
    // Centred on the wheel's MC-IC axis and directly beneath it.
    const wheelBox = await wheel.boundingBox();
    const barBox = await bar.boundingBox();
    if (wheelBox === null || barBox === null) throw new Error('no wheel or bar box');
    expect(Math.abs(barBox.x + barBox.width / 2 - (wheelBox.x + wheelBox.width / 2))).toBeLessThanOrEqual(1);
    expect(barBox.y).toBeGreaterThanOrEqual(wheelBox.y + wheelBox.height);
    expect(barBox.y - (wheelBox.y + wheelBox.height)).toBeLessThanOrEqual(24);
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(800);
    // Without a transit ring there is no ring toggle (owner decision, 2026-11-13).
    await expect(bar.getByRole('radiogroup')).toHaveCount(0);
    // One renderer for both wheels (owner review, 2026-11-14): the same dial, at the same size, with or without a ring.
    const dialSvg = page.locator('.chart-workbench-dial div.chart-wheel > svg');
    await expect(dialSvg).toHaveClass(/chart-dial/);
    const plainDial = await dialSvg.boundingBox();

    // With a transit ring, Natal only removes it from this view; the saved overlay setting stays on.
    await page.locator('.chart-overlay-settings button.chart-overlay-trigger').click();
    const dialog = page.locator('.chart-overlay-settings dialog');
    await dialog.getByRole('checkbox', { name: 'Transit ring', exact: true }).check();
    await dialog.getByLabel('Transit date', { exact: true }).fill('2025-01-01');
    await dialog.getByRole('button', { name: 'Apply overlays', exact: true }).click();
    await expect(dialog).toBeHidden();
    const legends = page.locator('[data-ring-legend]');
    await expect(legends).toHaveCount(2);
    await expect(dialSvg).toHaveClass(/chart-dial/);
    const ringDial = await dialSvg.boundingBox();
    if (plainDial === null || ringDial === null) throw new Error('no dial box');
    expect(Math.abs(ringDial.width - plainDial.width)).toBeLessThanOrEqual(1);
    const rings = bar.getByRole('radiogroup', { name: 'Rings on the wheel', exact: true });
    await expect(rings.getByRole('radio', { name: 'Natal + transit', exact: true })).toBeChecked();
    await rings.getByText('Natal only', { exact: true }).click();
    await expect(legends).toHaveCount(0);
    await expect(page.locator('svg.chart-dial .chart-glyph-transit')).toHaveCount(0);
    await rings.getByText('Natal + transit', { exact: true }).click();
    await expect(legends).toHaveCount(2);
    await page.locator('.chart-overlay-settings button.chart-overlay-trigger').click();
    await expect(dialog.getByRole('checkbox', { name: 'Transit ring', exact: true })).toBeChecked();
  });

  test('a consultation preset sets the instrument bar: its tone pills, and Natal + transit for a ring it turns on (#1532)', async () => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const bar = page.getByRole('group', { name: 'Wheel display', exact: true });
    const pill = (name: string) => bar.getByRole('button', { name, exact: true });
    const pressed = async () =>
      Promise.all(['Hard', 'Soft', 'Minor'].map(async (name) => pill(name).getAttribute('aria-pressed')));
    await expect.poll(pressed).toEqual(['true', 'true', 'true']);
    const rings = bar.getByRole('radiogroup', { name: 'Rings on the wheel', exact: true });

    // Standard overview names only major aspects, so Minor goes off (owner decision, 2026-11-14), and its transit ring
    // shows with the ring toggle on Natal + transit.
    await choosePill(page, 'Consultation preset', 'Standard overview: major and nodal and angular, orbs 8 and 6');
    await expect.poll(pressed).toEqual(['true', 'true', 'false']);
    await expect(rings.getByRole('radio', { name: 'Natal + transit', exact: true })).toBeChecked();
    await rings.getByText('Natal only', { exact: true }).click();
    await expect(rings.getByRole('radio', { name: 'Natal only', exact: true })).toBeChecked();

    // Predictive and timing's hard-minor family holds quincunx and semisextile, so Minor comes back on; choosing it
    // resets Natal only, so its transit ring shows.
    await choosePill(page, 'Consultation preset', 'Predictive and timing: major and hard minor');
    await expect.poll(pressed).toEqual(['true', 'true', 'true']);
    await expect(rings.getByRole('radio', { name: 'Natal + transit', exact: true })).toBeChecked();
    await expect(page.locator('[data-ring-legend]').first()).toBeVisible();

    // Natal core turns the transit ring off, so the ring toggle goes; Minor is off again.
    await choosePill(page, 'Consultation preset', 'Natal and core temperament: major and parallels, orbs 7 and 5');
    await expect.poll(pressed).toEqual(['true', 'true', 'false']);
    await expect(bar.getByRole('radiogroup')).toHaveCount(0);

    // No preset switches every pill back on.
    await choosePill(page, 'Consultation preset', 'No preset (default view)');
    await expect.poll(pressed).toEqual(['true', 'true', 'true']);
  });

  test('a consultation preset is applied only when chosen, and No preset returns the default view (#1063)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const shown = page.locator('svg.chart-dial g.chart-aspect-link:not(.chart-aspect-filtered)');
    await expect.poll(async () => shown.count()).toBeGreaterThan(3);
    const before = await shown.count();
    const preset = page.getByRole('button', { name: 'Consultation preset' });
    await expect(preset).toContainText('No preset');

    await choosePill(page, 'Consultation preset', 'Predictive and timing: major and hard minor');
    await expect.poll(async () => shown.count()).toBeLessThanOrEqual(before);
    // The family Select is on the Matrix tab only (#1532); there it reads the preset's families.
    await page.getByRole('link', { name: 'Aspect matrix', exact: true }).click();
    await expect(page.getByLabel('Aspects shown', { exact: true })).toContainText('Chosen families');

    await choosePill(page, 'Consultation preset', 'No preset (default view)');
    await expect(page.getByLabel('Aspects shown', { exact: true })).toHaveValue('all');
    await page.getByRole('link', { name: 'Wheel', exact: true }).click();
    await expect.poll(async () => shown.count()).toBe(before);
  });

  test('Predictive and timing says the active Time Lord and profection year in the Selection card and hides minor natal aspects (#1190)', async () => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const inspector = page.locator('.selection-inspector');
    // Nothing is added until the preset is chosen.
    await expect(inspector.getByText(/^Active Time Lord/)).toHaveCount(0);

    await choosePill(page, 'Consultation preset', 'Predictive and timing: major and hard minor');
    await expect(inspector.getByText(/^Active Time Lord \(firdaria\): .+/)).toBeVisible({ timeout: 60_000 });
    await expect(inspector.getByText(/^Profection year: .+, \d+(st|nd|rd|th) house, lord .+/)).toBeVisible();
    await expect(inspector.getByRole('link', { name: 'See Consultation' })).toBeVisible();

    // Between natal bodies only the major aspects are drawn, on the wheel (with the transit ring on, the natal lines may
    // all be hidden, which also holds) and in the matrix.
    const MAJOR = new Set(['conjunction', 'sextile', 'square', 'trine', 'opposition']);
    const natalLines = page.locator(
      'svg.chart-dial g.chart-aspect-link:not(.chart-aspect-filtered)[data-ring-a="0"][data-ring-b="0"]',
    );
    const keys = await Promise.all((await natalLines.all()).map((line) => line.getAttribute('data-aspect-key')));
    for (const key of keys) expect(MAJOR.has(key ?? '')).toBe(true);
    await page.getByRole('link', { name: 'Aspect matrix', exact: true }).click();
    const cells = page.locator('.mgrid-aspect .chart-aspect-glyph');
    await expect(cells.first()).toBeVisible();
    for (const glyph of await cells.all()) {
      const classes = (await glyph.getAttribute('class')) ?? '';
      expect([...MAJOR].some((key) => classes.includes(`chart-aspect-glyph-${key}`))).toBe(true);
    }

    // No preset brings the Selection card back to what it was.
    await choosePill(page, 'Consultation preset', 'No preset (default view)');
    await expect(inspector.getByText(/^Active Time Lord/)).toHaveCount(0);
  });

  test('with a body selected, the arrow keys step through its aspect contacts in zodiac order, announced and marked on the wheel (#1063)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const lines = page.locator('svg.chart-dial g.chart-aspect-link');
    await expect.poll(async () => lines.count()).toBeGreaterThan(3);

    await page.locator('.chart-point[data-body="sun"]').first().click({ force: true });
    const inspector = page.locator('.selection-inspector');
    const group = inspector.getByRole('group', { name: 'Step through this body’s aspect contacts', exact: true });
    await expect(group).toBeVisible();
    const status = group.getByRole('status');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(status).toHaveText(/^\d+ contacts?\. None chosen yet\.$/);
    const count = Number(((await status.textContent()) ?? '').split(' ')[0]);
    // The Sun's drawn lines, read straight from the dial: the stepper offers exactly those.
    const sunLines = page.locator(
      'svg.chart-dial g.chart-aspect-link[data-aspect-body-a="sun"][data-ring-a="0"], svg.chart-dial g.chart-aspect-link[data-aspect-body-b="sun"][data-ring-b="0"]',
    );
    expect(count).toBe(await sunLines.count());
    expect(count).toBeGreaterThan(1);

    const current = page.locator('svg.chart-dial .chart-contact-current');
    // A body is drawn as several elements (glyph, tick, degree stack); its glyph is the `.chart-point`.
    const partner = page.locator('svg.chart-dial .chart-point.chart-contact-partner');
    // Keyboard only: focus the Next button and use the arrow keys.
    const next = group.getByRole('button', { name: 'Next contact', exact: true });
    await next.focus();
    await expect(next).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(status).toHaveText(new RegExp(`^Contact 1 of ${String(count)}: `));
    // A visible focus state on the control while stepping by keyboard.
    await expect(next).toBeFocused();
    await expect(next).toHaveCSS('outline-style', 'solid');
    await expect(current).toHaveCount(1);
    await expect(partner).toHaveCount(1);
    const first = (await status.textContent()) ?? '';

    // Zodiac order forward from the Sun: each step's partner is at least as far ahead as the one before.
    const forward = async (): Promise<number> =>
      Number(
        await page.evaluate(`(() => {
          const sun = Number(document.querySelector('svg.chart-dial [data-body="sun"][data-ring="0"]').getAttribute('data-body-longitude'));
          const other = Number(document.querySelector('svg.chart-dial .chart-point.chart-contact-partner').getAttribute('data-body-longitude'));
          return (((other - sun) % 360) + 360) % 360;
        })()`),
      );
    let previous = await forward();
    for (let step = 2; step <= count; step += 1) {
      await page.keyboard.press('ArrowDown');
      await expect(status).toHaveText(new RegExp(`^Contact ${String(step)} of ${String(count)}: `));
      const now = await forward();
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
    // Next from the last contact wraps to the first; Left and Up go back.
    await page.keyboard.press('ArrowRight');
    await expect(status).toHaveText(first);
    await page.keyboard.press('ArrowLeft');
    await expect(status).toHaveText(new RegExp(`^Contact ${String(count)} of ${String(count)}: `));
    await page.keyboard.press('ArrowUp');
    await expect(status).toHaveText(new RegExp(`^Contact ${String(count - 1)} of ${String(count)}: `));

    // The same contacts with isolation off: the stepper is unchanged and the mark stays on a drawn, visible line.
    await inspector.getByRole('button', { name: 'Show all aspects', exact: true }).click();
    await expect(group).toBeVisible();
    await next.focus();
    await page.keyboard.press('ArrowRight');
    await expect(status).toHaveText(new RegExp(`^Contact \\d+ of ${String(count)}: `));
    await expect(current).toHaveCount(1);
    await expect(current).toBeVisible();

    // Clear removes the control, its marks and the selection.
    await inspector.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(group).toHaveCount(0);
    await expect(current).toHaveCount(0);
    await expect(page.locator('svg.chart-dial .chart-contact-partner')).toHaveCount(0);
  });

  test('Show on an Aspects row opens the Wheel with that aspect highlighted (#815)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page, 'Aspects');
    const first = page.locator('#chart-view-aspects table tbody tr').first();
    const show = first.getByRole('button', { name: /^Show .+ on the wheel$/ });
    const name = (await show.getAttribute('aria-label')) ?? '';
    expect(name).toMatch(/^Show .+ on the wheel$/);
    await show.click();

    await expect(page.getByRole('link', { name: 'Wheel', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#chart-view-wheel')).toBeVisible();
    await expect(page.locator('#chart-view-wheel')).toBeFocused();
    await expect(page.locator('#chart-view-aspects')).toHaveCount(0);
    // The selection dims everything but the aspect's two bodies and its line.
    await expect(page.locator('.chart-wheel .chart-dimmed').first()).toBeAttached();
    await expect(page.locator('.chart-wheel [data-body]:not(.chart-dimmed)')).not.toHaveCount(0);
    await expect(page.locator('.selection-inspector-facts')).toBeVisible();
    await expect(page.locator('.chart-wheel')).toBeInViewport();
  });

  test('Show on an Aspects row keeps the pair under the chart type and aspect filter (#1333, #1532)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.getByRole('button', { name: 'Chart type' })).toContainText('Natal');
    // With a filter that hides lines, the Aspects table lists exactly the contacts the wheel still draws (#1333).
    const drawn = page.locator('svg.chart-dial g.chart-aspect-link:not(.chart-aspect-filtered)');
    await expect.poll(async () => drawn.count()).toBeGreaterThan(3);
    const all = await drawn.count();
    // The preset's orb caps hide the widest contacts from the wheel.
    await choosePill(page, 'Consultation preset', 'Natal and core temperament: major and parallels, orbs 7 and 5');
    await expect.poll(async () => drawn.count()).toBeLessThan(all);
    const kept = await drawn.count();
    await page.getByRole('link', { name: 'Aspects', exact: true }).click();
    // Rows with a Show button are contacts; the wheel draws no line for a conjunction, so those are left out of the count.
    await expect(
      page
        .locator('#chart-view-aspects table')
        .first()
        .locator('tbody tr')
        .filter({ has: page.getByRole('button', { name: /^Show .+ on the wheel$/ }) })
        .filter({ hasNotText: 'Conjunction' }),
    ).toHaveCount(kept);
    await page.getByRole('link', { name: 'Wheel', exact: true }).click();
    await choosePill(page, 'Consultation preset', 'No preset (default view)');

    // The Minor pill off (#1532): the table follows the wheel and lists no minor-tone contact.
    await page
      .getByRole('group', { name: 'Aspect families on the wheel', exact: true })
      .getByRole('button', { name: 'Minor', exact: true })
      .click();
    await page.getByRole('link', { name: 'Aspects', exact: true }).click();
    // The table lists only what the wheel shows: no minor contact is in it.
    const rows = page.locator('#chart-view-aspects table').first().locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    const minor = /Quincunx|Semisextile|Quintile|Biquintile|Decile|Septile|Novile/i;
    await expect(rows.filter({ hasText: minor })).toHaveCount(0);

    // Show on a row with the Moon: the wheel keeps that row's pair and the line between them (#1333).
    const show = page
      .locator('#chart-view-aspects table')
      .first()
      .getByRole('button', { name: /^Show (Moon .+|.+ Moon) on the wheel$/ })
      .first();
    const label = (await show.getAttribute('aria-label')) ?? '';
    const named = /^Show (\S+) \S+ (\S+) on the wheel$/.exec(label);
    if (named === null) throw new Error(`unexpected Show label: ${label}`);
    const pair = [named[1] ?? '', named[2] ?? ''].map((name) => name.toLowerCase());
    expect(pair).toContain('moon');
    await show.click();

    await expect(page.getByRole('link', { name: 'Wheel', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#chart-view-wheel')).toBeVisible();
    for (const body of pair) {
      await expect(page.locator(`.chart-wheel [data-body="${body}"]`).first()).not.toHaveClass(/chart-dimmed/);
    }
    const outside = ['sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'].find((body) => !pair.includes(body));
    if (outside === undefined) throw new Error('no body outside the row');
    await expect(page.locator(`.chart-wheel [data-body="${outside}"]`).first()).toHaveClass(/chart-dimmed/);
    // No minor-tone contact is visible, and the Minor pill is still off (#1532).
    await expect(
      page
        .getByRole('group', { name: 'Aspect families on the wheel', exact: true })
        .getByRole('button', { name: 'Minor', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    const shown = page.locator('svg.chart-dial g.chart-aspect-link:not(.chart-aspect-filtered)');
    await expect.poll(async () => shown.count()).toBeGreaterThan(0);
    for (const key of ['quincunx', 'semisextile', 'quintile', 'biquintile', 'decile', 'septile', 'novile']) {
      await expect(
        page.locator(`svg.chart-dial g.chart-aspect-link:not(.chart-aspect-filtered)[data-aspect-key="${key}"]`),
      ).toHaveCount(0);
    }
  });

  test('the aspect matrix grid shows Name and House at 1280 and drops them at 390 (#820)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openNatalChart(page, 'Aspect matrix');
    const grid = page.locator('.mgrid');
    await expect(grid).toBeVisible();
    // The header names are screen-reader-only (#900); the row cells carry the visible Name and House.
    await expect(grid.locator('.mgrid-cell.mgrid-col-name').first()).toBeVisible();
    await expect(grid.locator('.mgrid-cell.mgrid-col-house').first()).toBeVisible();
    await expect(grid.locator('.mgrid-aspect').first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(grid).toBeVisible();
    await expect(grid.locator('.mgrid-cell.mgrid-col-name').first()).toBeHidden();
    await expect(grid.locator('.mgrid-cell.mgrid-col-house').first()).toBeHidden();
    await expect(grid.locator('.mgrid-cell.mgrid-num').first()).toBeVisible();
    await expect(grid.locator('.mgrid-cell.mgrid-ctr').first()).toBeVisible();
    await expect(grid.locator('.mgrid-aspect').first()).toBeVisible();
    await expect(grid.locator('.mgrid-aspect').first()).toBeVisible();
  });

  test('the aspect matrix has no visible header list and its text symbols match the AC and MC size (#900)', async () => {
    test.setTimeout(90_000);
    // Forces the text symbol class for this page only, before the app loads (#419).
    await page.addInitScript(() => {
      localStorage.setItem('astraya:symbolClass', 'text');
    });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openNatalChart(page, 'Aspect matrix');
    const grid = page.locator('.mgrid');
    await expect(grid).toBeVisible();

    // Every header name is kept for screen readers only: a 1px clipped span, not a visible column header.
    const headerNames = grid.locator('.mgrid-head span.sr-only');
    const headerCount = await headerNames.count();
    expect(headerCount).toBeGreaterThan(0);
    for (let index = 0; index < headerCount; index += 1) {
      const box = await headerNames.nth(index).boundingBox();
      expect(box?.width ?? 0, `header name ${String(index)} is visible`).toBeLessThanOrEqual(1);
    }

    // The text symbols and the AC and MC labels share one font size (--text-xs).
    const symbol = grid.locator('.mgrid-symbol-text').first();
    await expect(symbol).toBeVisible();
    const angle = grid.locator('.mgrid-label', { hasText: 'AC' }).first();
    await expect(angle).toBeVisible();
    const fontSize = (locator: Locator): Promise<string> =>
      locator.evaluate<string, unknown>('(element) => getComputedStyle(element).fontSize');
    expect(await fontSize(symbol)).toBe(await fontSize(angle));
  });

  test('the aspect matrix scales glyph, orb and a/s flag to a compact tile with tabular numerals (#900)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openNatalChart(page, 'Aspect matrix');
    const grid = page.locator('.mgrid');
    await expect(grid).toBeVisible();
    await expect(grid).toHaveCSS('font-variant-numeric', 'tabular-nums');
    const cell = grid.locator('.mgrid-aspect').first();
    const cellBox = await cell.boundingBox();
    const glyphBox = await cell.locator('.mgrid-glyph').boundingBox();
    const orbBox = await cell.locator('.mgrid-orb').boundingBox();
    expect(cellBox).not.toBeNull();
    expect(glyphBox).not.toBeNull();
    expect(orbBox).not.toBeNull();
    if (cellBox === null || glyphBox === null || orbBox === null) return;
    // A compact tile (about 2.75rem) holding the glyph, the orb and the flag inside its own border.
    expect(cellBox.width).toBeLessThanOrEqual(48);
    expect(cellBox.height).toBeLessThanOrEqual(48);
    expect(glyphBox.width).toBeLessThanOrEqual(cellBox.width * 0.5);
    expect(glyphBox.x).toBeGreaterThanOrEqual(cellBox.x);
    expect(orbBox.x + orbBox.width).toBeLessThanOrEqual(cellBox.x + cellBox.width + 0.5);
    expect(orbBox.y + orbBox.height).toBeLessThanOrEqual(cellBox.y + cellBox.height + 0.5);
  });

  test('the Elements top chart keeps its glyphs crisp and vertically mid-aligned in their cells (#900)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openNatalChart(page, 'Elements & modalities');
    const grid = page.locator('.emphasis-screen-grid');
    await expect(grid).toBeVisible();
    const glyphs = grid.locator('.emphasis-screen-glyph');
    await expect(glyphs.first()).toBeVisible();
    await expect(glyphs.first()).toHaveCSS('shape-rendering', 'geometricprecision');
    const centreOffset = async (inner: Locator, outer: Locator): Promise<number> => {
      const innerBox = await inner.boundingBox();
      const outerBox = await outer.boundingBox();
      if (innerBox === null || outerBox === null) throw new Error('no box to measure');
      return Math.abs(innerBox.y + innerBox.height / 2 - (outerBox.y + outerBox.height / 2));
    };
    // Every filled cell: its glyph row sits on the cell's vertical centre (within a pixel).
    const filled = grid.locator('.emphasis-screen-cell', { has: page.locator('.emphasis-screen-glyph') });
    const count = await filled.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const cell = filled.nth(index);
      expect(
        await centreOffset(cell.locator('.emphasis-screen-glyph').first(), cell),
        `cell ${String(index)}`,
      ).toBeLessThanOrEqual(1.5);
    }
    // The row heading and the row total share their row's vertical centre with the cells.
    const row = grid.locator('.emphasis-screen-row').first();
    const firstCell = row.locator('.emphasis-screen-cell').first();
    expect(await centreOffset(row.locator('.emphasis-screen-row-heading'), firstCell)).toBeLessThanOrEqual(1.5);
    expect(await centreOffset(row.locator('.emphasis-screen-row-total'), firstCell)).toBeLessThanOrEqual(1.5);
  });

  for (const mode of ['drawn', 'text'] as const) {
    test(`the Elements and Modalities markers are horizontally centred in their cells, ${mode} symbols (#900)`, async () => {
      test.setTimeout(90_000);
      if (mode === 'text') {
        await page.addInitScript(() => {
          localStorage.setItem('astraya:symbolClass', 'text');
        });
      }
      await openSharedPerson(page, baseUrl, EINSTEIN);
      await page.setViewportSize({ width: 1280, height: 800 });
      await openNatalChart(page, 'Elements & modalities');
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 800 });
        const grid = page.locator('.emphasis-screen-grid');
        await expect(grid).toBeVisible();
        // A marker is a drawn glyph or, in text mode, the HTML text symbol; either must sit on the cell's centre.
        const markerClass = '.emphasis-screen-glyph, .emphasis-screen-symbol-text';
        const filled = grid.locator('.emphasis-screen-cell', { has: page.locator(markerClass) });
        const count = await filled.count();
        expect(count).toBeGreaterThan(0);
        for (let index = 0; index < count; index += 1) {
          const cell = filled.nth(index);
          const label = `${mode} ${String(width)}px cell ${String(index)}`;
          // The markers' outer left and right edges, and the cell's, in viewport pixels.
          const cellBox = await cell.boundingBox();
          if (cellBox === null) throw new Error('no cell box');
          const markers = cell.locator(markerClass);
          const markerCount = await markers.count();
          let left = Number.POSITIVE_INFINITY;
          let right = Number.NEGATIVE_INFINITY;
          for (let m = 0; m < markerCount; m += 1) {
            const box = await markers.nth(m).boundingBox();
            if (box === null) throw new Error('no marker box');
            left = Math.min(left, box.x);
            right = Math.max(right, box.x + box.width);
          }
          const cellLeft = cellBox.x;
          const cellRight = cellBox.x + cellBox.width;
          expect(Math.abs((left + right) / 2 - (cellLeft + cellRight) / 2), label).toBeLessThanOrEqual(1.5);
          expect(left, `${label} inside the cell`).toBeGreaterThanOrEqual(cellLeft - 0.5);
          expect(right, `${label} inside the cell`).toBeLessThanOrEqual(cellRight + 0.5);
        }
        if (mode === 'text') {
          // --text-base (1rem of the 87.5% root = 14px), up from the --text-xs (about 11px) the symbols were too small at.
          const symbols = grid.locator('.emphasis-screen-symbol-text');
          const symbolCount = await symbols.count();
          expect(symbolCount).toBeGreaterThan(0);
          for (let n = 0; n < symbolCount; n += 1) {
            await expect(symbols.nth(n)).toHaveCSS('font-size', '14px');
          }
        }
      }
    });
  }

  test('the elements and modalities grid is a view of its own, with its table and a CSV download (#511)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page, 'Elements & modalities');
    await expect(page.getByRole('heading', { name: 'Elements & modalities', level: 2 })).toBeVisible();
    await expect(page.locator('.emphasis-screen-grid')).toBeVisible();

    // #821: the grid carries its own totals (four rows, three columns) at a phone and a desktop width.
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const grid = page.locator('.emphasis-screen-grid');
      await expect(grid.locator('.emphasis-screen-row-total')).toHaveCount(4);
      await expect(grid.locator('.emphasis-screen-column-total')).toHaveCount(3);
      await expect(grid.locator('.emphasis-screen-row-total').first()).toBeVisible();
      await expect(grid.locator('.emphasis-screen-column-total').first()).toBeVisible();
      await expect(grid.locator('.emphasis-screen-row-total').first()).toHaveCSS('text-align', 'right');
    }
    await page.setViewportSize({ width: 1600, height: 1000 });

    // The table holds every value the drawing does, as text: four elements and a totals row.
    const table = page.getByRole('table', { name: 'Elements and modalities' });
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await expect(table.getByRole('columnheader')).toHaveText(['Element', 'Cardinal', 'Fixed', 'Mutable', 'Total']);
    await expect(table.locator('tbody tr').last()).toContainText('Total');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download CSV', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('albert-einstein-elements-modalities.csv');
  });

  test('the inspector follows the dial, beside it from a 68rem workbench and below it under that', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const dial = page.locator('.chart-workbench-dial');
    const inspector = page.locator('.selection-inspector');
    await expect(dial).toBeVisible();
    await expect(inspector).toBeVisible();

    // DOM (and so focus) order: the dial first, the inspector after it.
    const dialFirst = await page.evaluate(
      "document.querySelector('.chart-workbench-dial').compareDocumentPosition(document.querySelector('.selection-inspector')) & 4",
    );
    expect(dialFirst).toBeTruthy();

    // Unpinned, a wide screen reaches the two-column state: the chart shell is at least 68rem wide,
    // the breakpoint of the workbench container query (the general shell is 80rem, so it is reachable).
    const remPx = Number(await page.evaluate('parseFloat(getComputedStyle(document.documentElement).fontSize)'));
    const naturalWidth = Number(
      await page.evaluate("document.querySelector('.chart-workbench-shell').getBoundingClientRect().width"),
    );
    expect(naturalWidth).toBeGreaterThanOrEqual(68 * remPx);
    const dialBox = await dial.boundingBox();
    const inspectorBox = await inspector.boundingBox();
    expect(inspectorBox?.x ?? 0).toBeGreaterThan((dialBox?.x ?? 0) + (dialBox?.width ?? 0) - 1);

    // The container's own width decides, not the viewport: pin the workbench shell to either side of 68rem.
    const pin = async (rem: number): Promise<void> => {
      await page.evaluate(`document.querySelector('.chart-workbench-shell').style.width = '${String(rem * remPx)}px'`);
    };
    const sideBySide = async (): Promise<boolean> => {
      const d = await dial.boundingBox();
      const i = await inspector.boundingBox();
      if (d === null || i === null) throw new Error('no boxes');
      return i.x >= d.x + d.width - 1 && i.y < d.y + d.height;
    };

    await pin(67.99);
    expect(await sideBySide()).toBe(false);
    const below = await inspector.boundingBox();
    const stackedDial = await dial.boundingBox();
    expect(below?.y ?? 0).toBeGreaterThanOrEqual((stackedDial?.y ?? 0) + (stackedDial?.height ?? 0) - 1);

    await pin(68);
    expect(await sideBySide()).toBe(true);

    // The two-column split is the grid's minmax(46rem, 1fr) dial track and minmax(20rem, 24rem)
    // inspector track (#817), tested at the widest the app really reaches: the wide shell is
    // 80rem less its 1.5rem side padding, so the workbench gets 77rem. Unpin and measure that, not a
    // width the app never has.
    await page.evaluate("document.querySelector('.chart-workbench-shell').style.width = ''");
    const realWidth = Number(
      await page.evaluate("document.querySelector('.chart-workbench-shell').getBoundingClientRect().width"),
    );
    expect(realWidth).toBeLessThanOrEqual(80 * remPx);
    expect(realWidth).toBeGreaterThanOrEqual(68 * remPx);
    const d = await dial.boundingBox();
    const i = await inspector.boundingBox();
    if (d === null || i === null) throw new Error('no boxes');
    const gap = i.x - (d.x + d.width);
    expect(gap).toBeGreaterThan(0);
    // The approved split (#817, mockup 2026-10-30): the dial takes at least 46rem and the inspector is 20-24rem.
    expect(d.width).toBeGreaterThanOrEqual(46 * remPx - 1);
    expect(i.width).toBeGreaterThanOrEqual(20 * remPx - 1);
    expect(i.width).toBeLessThanOrEqual(24 * remPx + 1);
    expect(d.width).toBeGreaterThan(i.width);
  });

  test('the inspector sits beside the wheel on desktop, overlapping its vertical span, and stacks on a phone (#801, #817)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const dial = page.locator('.chart-workbench-dial');
    const inspector = page.locator('.selection-inspector');

    // Desktop: the inspector starts inside the dial's vertical span (it overhangs the wheel itself, see
    // chart-selection-overhang.spec.ts), so the two read as one row.
    for (const [width, height] of [
      [1280, 800],
      [1600, 1000],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect(dial).toBeVisible();
      await expect(inspector).toBeVisible();
      const d = await dial.boundingBox();
      const i = await inspector.boundingBox();
      if (d === null || i === null) throw new Error('no boxes');
      expect(i.y).toBeGreaterThanOrEqual(d.y - 1);
      expect(i.y).toBeLessThan(d.y + d.height);
    }

    // Phone: the inspector sits below the wheel, not beside it.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(inspector).toBeVisible();
    // The header's overlay triggers move for one frame after the resize, so the header is taller and the
    // dial lower in that frame (#1503). Wait until the header height and the dial's box read the same on two
    // successive animation frames before comparing.
    const layoutSettled = (): Promise<boolean> =>
      page.evaluate<boolean>(`(async () => {
        const read = () => {
          const header = document.querySelector('.app-header')?.getBoundingClientRect();
          const box = document.querySelector('.chart-workbench-dial')?.getBoundingClientRect();
          return JSON.stringify([header?.height, box?.x, box?.y, box?.width, box?.height]);
        };
        const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
        await nextFrame();
        const first = read();
        await nextFrame();
        return read() === first;
      })()`);
    await expect.poll(layoutSettled).toBe(true);
    const dPhone = await dial.boundingBox();
    const iPhone = await inspector.boundingBox();
    if (dPhone === null || iPhone === null) throw new Error('no boxes');
    expect(iPhone.y).toBeGreaterThanOrEqual(dPhone.y + dPhone.height - 1);
  });

  test('the chart wheel sits fully in view at 1280x800 without scrolling (#801)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openNatalChart(page);
    const wheel = page.locator('.chart-workbench-dial svg').first();
    await expect(wheel).toBeVisible();
    const box = await wheel.boundingBox();
    if (box === null) throw new Error('no wheel box');
    const viewportHeight = page.viewportSize()?.height ?? 0;
    expect(await page.evaluate('window.scrollY')).toBe(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeLessThan(viewportHeight);
    expect(box.y + box.height).toBeLessThanOrEqual(viewportHeight);
  });

  test('with a body selected at 1280x800 and the Overlays drawer closed, the wheel and the Selection card both sit above the fold (#817)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await page.locator('.chart-point[data-body="sun"]').click();
    const inspector = page.locator('.selection-inspector');
    await expect(inspector.locator('.selection-inspector-facts')).toContainText('Sun');
    const viewportHeight = page.viewportSize()?.height ?? 0;
    const wheel = await page.locator('.chart-workbench-dial .chart-wheel svg').first().boundingBox();
    const card = await inspector.boundingBox();
    if (wheel === null || card === null) throw new Error('no boxes');
    // The card is capped to the mockup's clamp(350px, 55vh, 580px) and scrolls inside itself.
    expect(card.y + card.height).toBeLessThanOrEqual(viewportHeight);
    expect(wheel.y + wheel.height).toBeLessThanOrEqual(viewportHeight);
    expect(await page.evaluate('window.scrollY')).toBe(0);
    // The inspector is 24rem at most (336px at a 14px root) so the wheel keeps its 46rem minimum beside it.
    expect(card.width).toBeLessThanOrEqual(24 * 14 + 1);
  });

  test('the Selection card extends to the viewport bottom, keeping --space-6 clear, with no page scroll (#817, #900)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await page.locator('.chart-point[data-body="sun"]').click();
    const inspector = page.locator('.selection-inspector');
    await expect(inspector.locator('.selection-inspector-facts')).toContainText('Sun');
    const viewportHeight = page.viewportSize()?.height ?? 0;
    const card = await inspector.boundingBox();
    if (card === null) throw new Error('no card box');
    // --space-6 (1.5rem) resolved against the root font size, read from the page.
    const spaceSix = Number(
      await page.evaluate(
        "parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-6')) * parseFloat(getComputedStyle(document.documentElement).fontSize)",
      ),
    );
    expect(card.y + card.height).toBeLessThanOrEqual(viewportHeight);
    expect(viewportHeight - (card.y + card.height)).toBeGreaterThanOrEqual(spaceSix);
    expect(await page.evaluate('document.documentElement.scrollHeight <= window.innerHeight')).toBe(true);
    expect(await page.evaluate('window.scrollY')).toBe(0);
  });

  test('with the device degree-symbol setting off, the Sabian tier is gone from the Selection card (#817, D-817b)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.evaluate("localStorage.setItem('astraya:showDegreeSymbol', 'false')");
    await openNatalChart(page);
    await page.locator('.chart-point[data-body="sun"]').click();
    await expect(page.locator('.selection-inspector .selection-inspector-facts')).toContainText('Sun');
    await expect(page.locator('.selection-inspector .selection-sabian')).toHaveCount(0);
    await page.evaluate("localStorage.setItem('astraya:showDegreeSymbol', 'true')");
    await page.reload();
    await openNatalChart(page);
    await page.locator('.chart-point[data-body="sun"]').click();
    await expect(page.locator('.selection-inspector .selection-sabian')).toHaveCount(1);
  });

  test('selecting something fills the inspector in place, without moving it', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const inspector = page.locator('.selection-inspector');
    await expect(inspector).toContainText('to explore it');
    const pageTop = async (): Promise<number> =>
      Number(
        await page.evaluate(
          "document.querySelector('.selection-inspector').getBoundingClientRect().top + window.scrollY",
        ),
      );
    const before = await pageTop();

    await page.locator('.chart-point[data-body="sun"]').click();
    await expect(inspector.locator('.selection-inspector-facts')).toContainText('Sun');
    await expect(inspector.getByRole('button', { name: 'Clear', exact: true })).toBeVisible();
    // The inspector's own top never moves (page-relative: the click scrolls the dial into view).
    expect(await pageTop()).toBeCloseTo(before, 0);

    await inspector.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(inspector).toContainText('to explore it');
  });

  test('a house number on the wheel selects that house, in the inspector and in its table row (#511)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const inspector = page.locator('.selection-inspector');

    await page.locator('.chart-house[data-house="5"]').click();
    await expect(inspector.locator('.chart-isolation-head strong')).toContainText('on the cusp of house 5');
    await expect(page.locator('.chart-house[data-house="6"]')).toHaveClass(/chart-dimmed/);

    // The same selection is on the Placements table, reachable and clearable from the keyboard.
    await page.getByRole('link', { name: 'Placements', exact: true }).click();
    await expect(page.locator('tr.data-table-row-selected')).toContainText('5');
    await page.getByRole('button', { name: 'Clear', exact: true }).first().click();
    await expect(page.locator('tr.data-table-row-selected')).toHaveCount(0);
    await page.getByRole('link', { name: 'Wheel', exact: true }).click();
    await expect(inspector).toContainText('to explore it');
  });

  test('the chart row pins Overlays and Extended settings at the far right, drops the static prefix, and folds both into Chart actions at 40rem and below (#817, #818)', async () => {
    test.setTimeout(90_000);
    // #976: above 640px the Overlay and Extended settings triggers are page actions in the PageHeader's action group,
    // so the view tab row holds only the view links. At 640px and below they sit in the tab row's Chart actions sheet.
    // Above 640px the triggers are the PageHeader's; at 640px and below they are in the tab row's sheet. Each locator
    // is scoped to where the trigger sits at that width, so one name, "Overlay settings", finds the right one.
    const overlays = page.locator(
      '.page-header-actions button.chart-overlay-trigger, .tab-row__actions-panel button.chart-overlay-trigger',
    );
    const tabRow = page.locator('.tab-row');
    const settings = page.locator(
      '.page-header-actions button.extended-settings-trigger, .tab-row__actions-panel button.extended-settings-trigger',
    );
    const toggle = page.getByRole('button', { name: 'Chart actions', exact: true });
    const box = async (locator: Locator): Promise<{ left: number; right: number }> => {
      const rect = await locator.boundingBox();
      if (rect === null) throw new Error('expected the element to have a layout box');
      return { left: rect.x, right: rect.x + rect.width };
    };

    // The static "Extended settings:" text is gone at every width, and no in-flow Overlays row sits under the tab row.
    const noPrefixNoRow = async (): Promise<void> => {
      await expect(page.locator('.tab-row__prefix')).toHaveCount(0);
      await expect(page.locator('.chart-view-prefix')).toHaveCount(0);
      await expect(page.getByText('Extended settings:', { exact: true })).toHaveCount(0);
      await expect(page.locator('button.primitive-disclosure-trigger', { hasText: 'overlay settings' })).toHaveCount(0);
    };

    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(toggle).toBeHidden();
    await expect(settings).toBeVisible();
    await expect(overlays).toBeVisible();
    // #976: both triggers sit in the PageHeader's top-right action group, to the right of the title row's own
    // actions, and Extended settings ends the group at the page's right edge. The tab row holds neither.
    const header = await box(page.locator('.page-header-actions'));
    const overlaysBox = await box(overlays);
    const settingsBox = await box(settings);
    expect(overlaysBox.left).toBeGreaterThanOrEqual(header.left);
    expect(overlaysBox.right).toBeLessThanOrEqual(settingsBox.left);
    // The PDF link (#856) is the rightmost action when the chart offers one; otherwise Extended settings ends the group.
    const pdfLink = page.locator('.page-header-actions > .chart-pdf-link');
    if ((await pdfLink.count()) > 0) {
      const pdfBox = await box(pdfLink);
      expect(settingsBox.right).toBeLessThanOrEqual(pdfBox.left + 0.5);
      expect(pdfBox.right).toBeCloseTo(header.right, 0);
    } else {
      expect(settingsBox.right).toBeCloseTo(header.right, 0);
    }
    await expect(tabRow.locator('button.chart-overlay-trigger')).toHaveCount(0);
    await expect(tabRow.locator('button.extended-settings-trigger')).toHaveCount(0);
    await noPrefixNoRow();

    // Overlays opens a right slide-over drawer, not an in-flow row, and the wheel stays visible beside it.
    const drawer = page.locator('.chart-overlay-settings dialog');
    await overlays.click();
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('data-placement', 'right');
    await expect(page.locator('div.chart-wheel')).toBeVisible();
    const drawerBox = await drawer.boundingBox();
    if (drawerBox === null) throw new Error('expected the drawer to have a layout box');
    expect(drawerBox.x + drawerBox.width).toBeGreaterThan(1270);
    expect(drawerBox.width).toBeLessThanOrEqual(42 * 16 + 1);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(overlays).toBeFocused();

    const select = page.locator('.tab-row .chart-view-select select');
    const strip = page.locator('.tab-row__tabs');
    const pinned = async (): Promise<void> => {
      await expect(toggle).toBeHidden();
      await expect(strip).toBeVisible();
      await expect(select).toBeHidden();
      await expect(settings).toBeVisible();
      await expect(overlays).toBeVisible();
      await expect(page.locator('.tab-row__viewport').locator(settings)).toHaveCount(0);
      await expect(page.locator('.tab-row__viewport').locator(overlays)).toHaveCount(0);
      // #976: the tab row holds only view links; the page actions sit in the PageHeader's action group.
      await expect(tabRow.locator('button')).toHaveCount(0);
      await expect(page.locator('.page-header-actions button.extended-settings-trigger')).toHaveCount(1);
      await expect(page.locator('.page-header-actions button.chart-overlay-trigger')).toHaveCount(1);
      await noPrefixNoRow();
    };
    const collapsed = async (): Promise<void> => {
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(select).toBeVisible();
      await expect(strip).toBeHidden();
      await expect(settings).toBeHidden();
      await expect(overlays).toBeHidden();
      await noPrefixNoRow();
    };

    // At 40rem and below (390px) the labelled select replaces the tabs and Overlays and Extended settings sit behind
    // the one "Chart actions" text toggle (a Button) until it is opened.
    await page.setViewportSize({ width: 390, height: 844 });
    await collapsed();
    // #976: on a phone the page header holds no trigger; both sit in the Chart actions sheet, not the PageHeader.
    await expect(page.locator('.page-header-actions button.chart-overlay-trigger')).toHaveCount(0);
    await expect(page.locator('.page-header-actions button.extended-settings-trigger')).toHaveCount(0);
    await expect(page.locator('.tab-row__actions-toggle button.primitive-button-compact')).toHaveText(/^Chart actions/);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(settings).toBeVisible();
    await expect(overlays).toBeVisible();
    // The sheet holds Overlays and Extended settings only; the PDF creator link is in the PageHeader (#915).
    await expect(page.locator('.tab-row__actions-panel > *')).toHaveCount(2);
    await expect(page.locator('.tab-row__actions-panel > a')).toHaveCount(0);
    await expect(page.locator('.tab-row__actions-panel .chart-overlay-trigger')).toHaveCount(1);
    await overlays.click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    // Closing the drawer also closes the sheet and puts focus on its toggle.
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // 640px is the inclusive edge of the narrow rule (max-width: 40rem): still the select and the toggle.
    await page.setViewportSize({ width: 640, height: 900 });
    await collapsed();
    await toggle.click();
    await expect(overlays).toBeVisible();
    await expect(settings).toBeVisible();
    await toggle.click();

    // 641px is the first width above it: the scrolling strip shows and both triggers are pinned.
    await page.setViewportSize({ width: 641, height: 900 });
    await pinned();

    // Tablet (768px) is above 40rem too: the scrolling tab row, no labelled select, both triggers pinned.
    await page.setViewportSize({ width: 768, height: 1024 });
    await pinned();
  });

  test('the chart tab row scrolls with the wheel, its fades follow the hidden tabs and never catch pointer events, and the touch-pan CSS contract holds (#818)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    const scroller = page.locator('.tab-row__scroll');
    const startFade = page.locator('.tab-row__fade--start');
    const endFade = page.locator('.tab-row__fade--end');
    interface ScrollMetrics {
      readonly left: number;
      readonly max: number;
      readonly scrollWidth: number;
      readonly clientWidth: number;
    }
    // The page has no DOM typings in e2e, so the browser-side reads are strings, as elsewhere in these specs.
    const metrics = async (): Promise<ScrollMetrics> =>
      page.evaluate<ScrollMetrics>(`(() => {
        const el = document.querySelector('.tab-row__scroll');
        return { left: el.scrollLeft, max: el.scrollWidth - el.clientWidth, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      })()`);

    // #976 moved the page actions into the PageHeader, so the view row now fits at every width above 640px except the
    // first one, 641px, where it overflows by about 50px (measured: scrollWidth 652, clientWidth 599). The scroll-and-fade
    // contract is therefore tested at 641px, the width where the row overflows (owner decision on #818, 2026-11-01).
    await page.setViewportSize({ width: 641, height: 800 });
    await expect.poll(async () => (await metrics()).scrollWidth > (await metrics()).clientWidth).toBe(true);

    // Touch-capable CSS contract (computed styles only; touch momentum itself is not exercised headlessly).
    await expect(scroller).toHaveCSS('overflow-x', 'auto');
    await expect(scroller).toHaveCSS('touch-action', 'pan-x');
    await expect(scroller).toHaveCSS('overscroll-behavior-x', 'contain');
    await expect(scroller).toHaveCSS('scrollbar-width', 'none');

    // At the start only the end fade shows.
    await expect.poll(async () => (await metrics()).left).toBe(0);
    await expect(endFade).toHaveCSS('opacity', '1');
    await expect(startFade).toHaveCSS('opacity', '0');

    // A real wheel over the row moves the tabs sideways, to the far end.
    const rect = await scroller.boundingBox();
    if (rect === null) throw new Error('expected the scroll container to have a layout box');
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await expect
      .poll(async () => {
        await page.mouse.wheel(0, 400);
        const { left, max } = await metrics();
        return left > 0 && left >= max - 1;
      })
      .toBe(true);
    await expect(startFade).toHaveCSS('opacity', '1');
    await expect(endFade).toHaveCSS('opacity', '0');

    // Neither fade takes pointer events, and the point under each one belongs to something else.
    for (const fade of [startFade, endFade]) {
      await expect(fade).toHaveCSS('pointer-events', 'none');
    }
    for (const fade of [startFade, endFade]) {
      const box = await fade.boundingBox();
      if (box === null) throw new Error('expected the fade to have a layout box');
      const topClass = await page.evaluate(
        `document.elementFromPoint(${String(box.x + box.width / 2)}, ${String(box.y + box.height / 2)})?.className ?? ''`,
      );
      expect(String(topClass)).not.toContain('tab-row__fade');
    }
  });
});
