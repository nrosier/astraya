/**
 * The chart's Extended settings drawer (#442, #824): a summary button that opens a right-anchored drawer, its four
 * categories, the pinned Apply and Cancel footer, the staged formula points, and the phone layout (full width at 390).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { BORN, EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import {
  closeSettings,
  createPerson,
  gotoAndSettle,
  openNatalChart,
  openSettings,
  openSettingsTab,
} from './support.ts';

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

  test('the settings open as a card, apply together or are dropped, and the button says what changed', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    const trigger = page.locator('button.extended-settings-trigger');
    await expect(trigger).toHaveText('Extended settings');

    // The drawer: a right-anchored dialog with four categories, and the Profile & frame tab first.
    await openSettings(page);
    const card = page.locator('dialog.settings-card');
    await expect(card).toHaveAttribute('data-placement', 'right');
    await expect(card.getByRole('heading', { name: 'Extended settings', level: 2 })).toBeVisible();
    await expect(card.getByRole('tab')).toHaveText([
      'Profile & frame',
      'Bodies & orbs',
      'Display & glyphs',
      'Special points',
    ]);
    await expect(card.getByRole('tab', { name: 'Profile & frame' })).toHaveAttribute('aria-selected', 'true');
    await expect(card.locator('fieldset.settings-card-group > legend').first()).toHaveText('Calculation profile');
    await expect(card.getByRole('button', { name: /^Apply and redraw/ })).toBeDisabled();
    // The device preference (symbols) is in Display & glyphs and says how it applies.
    await openSettingsTab(page, 'Display & glyphs');
    await expect(
      card.getByText('Shown at once, kept when you apply or save, and put back by Cancel.').first(),
    ).toBeVisible();
    await openSettingsTab(page, 'Profile & frame');

    // Cancel drops the draft: nothing is applied and the button still says nothing.
    await card.getByLabel('House system', { exact: true }).selectOption('W');
    await card.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(card).toBeHidden();
    await expect(trigger).toHaveText('Extended settings');
    await openSettings(page);
    await expect(card.getByLabel('House system', { exact: true })).toHaveValue('P');
    await closeSettings(page);

    // A built-in calculation profile replaces every value it owns in one go; applying it redraws and the button names what changed.
    await openSettings(page);
    await card
      .getByRole('radiogroup', { name: 'Calculation profile', exact: true })
      .getByRole('radio', { name: /^Traditional Western/ })
      .check();
    await expect(card.getByText('also sets the planetary rulers to Traditional')).toBeVisible();
    await card.getByRole('button', { name: 'Apply and redraw', exact: true }).click();
    await expect(card).toBeHidden();
    // Fortune/Chiron visibility now live in one unified policy (#585), so the trigger names the
    // whole policy as changed rather than each affected object individually.
    await expect(trigger).toContainText('Object visibility customized');
    await expect(trigger).toContainText('changed');
    await openSettings(page);
    await expect(
      card
        .getByRole('radiogroup', { name: 'Planetary rulers', exact: true })
        .getByRole('radio', { name: /^Traditional/ }),
    ).toBeChecked();
    await expect(
      card
        .getByRole('radiogroup', { name: 'Calculation profile', exact: true })
        .getByRole('radio', { name: /^Traditional Western/ }),
    ).toBeChecked();

    // The orbs now in force are spelled out, not only a percentage (the orb scale is in Bodies & orbs).
    await openSettingsTab(page, 'Bodies & orbs');
    await card.getByRole('slider', { name: 'Orb scale' }).fill('-10');
    await expect(card.getByText(/major aspects 6[.,]3°/)).toBeVisible();

    // Escape closes without applying (the house system is in Profile & frame).
    await openSettingsTab(page, 'Profile & frame');
    await card.getByLabel('House system', { exact: true }).selectOption('P');
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    await openSettings(page);
    await expect(card.getByLabel('House system', { exact: true })).toHaveValue('W');

    const results = await new AxeBuilder({ page }).include('dialog.settings-card').analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('the unified object-visibility checklist: presets, group actions, and the live count (#585)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    await openSettings(page, 'Bodies & orbs');
    const card = page.locator('dialog.settings-card');
    // The visibility matrix (#824): one dense table, Object then Visible, Aspects and Reports checkboxes.
    const bodiesGroup = card.locator('fieldset.settings-card-group', { hasText: 'Object visibility' });
    await expect(bodiesGroup.locator('.data-table table thead th').nth(1)).toHaveText(/Visible/);

    // Starts on no named preset (the shipped default isn't exactly Core/Traditional/All).
    const presets = bodiesGroup.getByRole('radiogroup', { name: 'Object visibility preset', exact: true });
    await expect(presets.getByRole('radio', { name: /^Custom/ })).toBeChecked();

    // Choosing "Core" applies a complete policy at once: Jupiter (not core) drops out, Sun stays.
    await presets.getByRole('radio', { name: /^Core/ }).check();
    await expect(bodiesGroup.getByLabel('Jupiter — visible', { exact: true })).not.toBeChecked();
    await expect(bodiesGroup.getByLabel('Sun — visible', { exact: true })).toBeChecked();
    await expect(presets.getByRole('radio', { name: /^Core/ })).toBeChecked();

    // The Planets group's own "All" button turns every planet back on, independent of the preset.
    await bodiesGroup
      .getByRole('group', { name: 'Planets', exact: true })
      .getByRole('button', { name: 'All', exact: true })
      .click();
    await expect(bodiesGroup.getByLabel('Jupiter — visible', { exact: true })).toBeChecked();
    // No longer any named preset once a group action diverges from it.
    await expect(presets.getByRole('radio', { name: /^Custom/ })).toBeChecked();

    await card.getByRole('button', { name: 'Apply and redraw', exact: true }).click();
    await expect(card).toBeHidden();
    await expect(page.locator('button.extended-settings-trigger')).toContainText('Object visibility customized');

    // A fresh pass against the checklist's own interactive state, not just the dialog at rest.
    await openSettings(page);
    const results = await new AxeBuilder({ page }).include('dialog.settings-card').analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('the drawer opens focused inside, traps Tab, closes on Escape and returns focus to its trigger (#824)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    const trigger = page.locator('button.extended-settings-trigger');
    const card = page.locator('dialog.settings-card');
    await openSettings(page);
    // The tab bar sits in the header, outside the scrolling body.
    await expect(card.locator('.settings-card-subheader').getByRole('tab')).toHaveCount(4);
    await expect(card.locator('.settings-card-body').getByRole('tab')).toHaveCount(0);

    // Tab many times: focus never leaves the dialog.
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Tab');
      await expect(card.locator(':focus')).toHaveCount(1);
    }
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Shift+Tab');
      await expect(card.locator(':focus')).toHaveCount(1);
    }

    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('a column checkbox sets every object at once, and the segmented control moves with the arrow keys (#824)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    const card = page.locator('dialog.settings-card');
    await openSettings(page, 'Bodies & orbs');
    const matrix = card.locator('fieldset.settings-card-group', { hasText: 'Object visibility' });
    await expect(matrix.locator('.data-table table thead th')).toHaveText([/Object/, /Visible/, /Aspects/, /Reports/]);

    const allReports = matrix.getByRole('checkbox', { name: 'All in the report', exact: true });
    await expect(allReports).toBeChecked();
    await allReports.uncheck();
    await expect(matrix.getByLabel('Sun — included in the written report', { exact: true })).not.toBeChecked();
    await expect(matrix.getByLabel('Jupiter — included in the written report', { exact: true })).not.toBeChecked();
    await expect(matrix.getByLabel('Sun — visible', { exact: true })).toBeChecked();
    await allReports.check();
    await expect(matrix.getByLabel('Jupiter — included in the written report', { exact: true })).toBeChecked();

    // The orb scale is a horizontal segmented control: a labelled radiogroup the arrow keys walk through.
    const scale = card.getByRole('radiogroup', { name: 'Orb scale step', exact: true });
    await expect(scale).toHaveClass(/primitive-choice-group-segmented/);
    await expect(scale.getByRole('radio')).toHaveCount(3);
    await scale.getByRole('radio', { name: '0%', exact: true }).check();
    await scale.getByRole('radio', { name: '0%', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(scale.getByRole('radio', { name: '+40%', exact: true })).toBeChecked();
    await page.keyboard.press('ArrowLeft');
    await expect(scale.getByRole('radio', { name: '0%', exact: true })).toBeChecked();
    const labels = scale.locator('label');
    const tops = await Promise.all([0, 1, 2].map(async (index) => (await labels.nth(index).boundingBox())?.y ?? -1));
    expect(new Set(tops.map((top) => Math.round(top))).size).toBe(1);

    // The 42rem cap holds on a wide screen.
    const box = await card.boundingBox();
    expect(box?.width ?? Infinity).toBeLessThanOrEqual(672 + 1);
    await closeSettings(page);
  });

  test('the Apply button enables when only Symbols are changed (#459)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    await openSettings(page, 'Display & glyphs');
    const card = page.locator('dialog.settings-card');
    const applyButton = card.getByRole('button', { name: /^Apply and redraw/ });

    // Initially disabled
    await expect(applyButton).toBeDisabled();

    // Change only the symbol class (the default is already 'drawn') - should enable the apply button
    await card.getByLabel('Symbols', { exact: true }).selectOption('unicode');

    // The button should now be enabled
    await expect(applyButton).toBeEnabled();

    // Cancel puts the symbols back: nothing sticks, and reopening shows the original choice (#510)
    await card.getByRole('button', { name: 'Cancel', exact: true }).click();
    await openSettings(page, 'Display & glyphs');
    await expect(card.getByLabel('Symbols', { exact: true })).toHaveValue('drawn');
    await expect(card.getByRole('button', { name: /^Apply and redraw/ })).toBeDisabled();

    await closeSettings(page);
  });

  test('saving a profile as the device default changes new people only, never one who already has a copy (#510, #806)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    // Save Sidereal (Lahiri) as this device's default, without applying it to the chart open now.
    await openSettings(page);
    const card = page.locator('dialog.settings-card');
    await card
      .getByRole('radiogroup', { name: 'Calculation profile', exact: true })
      .getByRole('radio', { name: /^Sidereal/ })
      .check();
    await card.getByRole('button', { name: 'Save as my default', exact: true }).click();
    await expect(card).toBeHidden();
    // Einstein was given a copy of the default when he was created, so the card shows his own settings (#806).
    await openSettings(page);
    await expect(card.getByLabel('House system', { exact: true })).toHaveValue('P');
    await closeSettings(page);

    // The reload checks that the new default persists across a real page load.
    await page.reload();
    await page.waitForLoadState('load');

    // A person created after the change receives a copy of the new default.
    await gotoAndSettle(page, `${baseUrl}/#/people`);
    await createPerson(page, {
      name: 'Late Arrival',
      date: '1990-06-15',
      time: '17:00',
      latitude: '51.5072',
      longitude: '-0.1276',
    });
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    await openSettings(page);
    await expect(
      card
        .getByRole('radiogroup', { name: 'Calculation profile', exact: true })
        .getByRole('radio', { name: /^Sidereal/ }),
    ).toBeChecked();
    await expect(card.getByLabel('House system', { exact: true })).toHaveValue('W');
    await closeSettings(page);

    // The seeded person who already held a copy is still on Placidus.
    await openSharedPerson(page, baseUrl, BORN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();
    await openSettings(page);
    await expect(card.getByLabel('House system', { exact: true })).toHaveValue('P');
    await closeSettings(page);
  });

  test('the drawer works on a phone: full width at 390, scrolls inside, keeps Apply and Cancel in reach (#824)', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('link', { name: 'Charts', exact: true }).click();
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    await openSettings(page);
    const card = page.locator('dialog.settings-card');
    const box = await card.boundingBox();
    // Full width on a 390px screen (D-824c: the drawer is full width below its 42rem maximum).
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(388);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(840);
    // The drawer's tabs are the labelled select on a phone, not a scrolling tab row.
    await expect(card.getByRole('combobox', { name: 'Category', exact: true })).toBeVisible();
    await expect(card.getByRole('tablist')).toBeHidden();
    await expect(card.getByRole('button', { name: /^Apply and redraw/ })).toBeInViewport();
    await expect(card.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
    expect(
      await page.evaluate(
        "document.querySelector('dialog.settings-card').scrollWidth - document.querySelector('dialog.settings-card').clientWidth",
      ),
    ).toBeLessThanOrEqual(1);
    const results = await new AxeBuilder({ page }).include('dialog.settings-card').analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('opening and cancelling the card keeps what is selected on the wheel (applying redraws, which clears it)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    await page.getByRole('link', { name: 'Placements', exact: true }).click();
    await page.getByRole('button', { name: 'Show Sun on the chart', exact: true }).click();
    await expect(page.locator('tr.data-table-row-selected')).toContainText('Sun');

    await openSettings(page);
    await closeSettings(page);
    await expect(page.locator('tr.data-table-row-selected')).toContainText('Sun');
  });

  test('formula points are staged in the drawer: an add and a delete save only on Apply, and Cancel drops them (#824, D-824b)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    const card = page.locator('dialog.settings-card');
    const formulaSection = card.locator('fieldset.settings-card-group', { hasText: 'Custom formula points' });
    // The saved list is read from the chart itself: a saved point is a body on the wheel (the inline editor is gone, #815).
    const savedList = page.locator('g.chart-body-stack[data-body="Kept point"]');

    // Stage a new point and cancel: it never reaches the person, and the open page's own list stays empty.
    await openSettings(page, 'Bodies & orbs');
    await formulaSection.getByLabel('Name', { exact: true }).fill('Staged point');
    await formulaSection.getByLabel('Formula', { exact: true }).fill('Asc + Sun - MC');
    await formulaSection.getByRole('button', { name: 'Add formula point', exact: true }).click();
    await expect(formulaSection.locator('tbody tr td:first-child').filter({ hasText: 'Staged point' })).toBeVisible();
    await expect(formulaSection.getByText('Draft, saved on Apply')).toBeVisible();
    await expect(savedList).toHaveCount(0);
    await card.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(card).toBeHidden();
    await expect(savedList).toHaveCount(0);
    await openSettings(page, 'Bodies & orbs');
    await expect(formulaSection.locator('tbody tr td:first-child').filter({ hasText: 'Staged point' })).toHaveCount(0);

    // Stage it again and Apply: now it is saved on the person.
    await formulaSection.getByLabel('Name', { exact: true }).fill('Kept point');
    await formulaSection.getByLabel('Formula', { exact: true }).fill('Asc + Sun - MC');
    await formulaSection.getByRole('button', { name: 'Add formula point', exact: true }).click();
    await card.getByRole('button', { name: 'Apply and redraw', exact: true }).click();
    await expect(card).toBeHidden();
    await expect(savedList).toHaveCount(1);
    await expect(savedList.first()).toBeVisible();

    // A delete is staged too: marked removed in the drawer, still saved until Apply, restored by Cancel.
    await openSettings(page, 'Bodies & orbs');
    await formulaSection.getByRole('button', { name: 'Remove Kept point', exact: true }).click();
    await expect(formulaSection.getByText('Removed, saved on Apply')).toBeVisible();
    await expect(savedList).toHaveCount(1);
    await card.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(savedList).toHaveCount(1);
    await openSettings(page, 'Bodies & orbs');
    await formulaSection.getByRole('button', { name: 'Remove Kept point', exact: true }).click();
    await card.getByRole('button', { name: 'Apply and redraw', exact: true }).click();
    await expect(card).toBeHidden();
    await expect(savedList).toHaveCount(0);
  });

  test('the card is not part of the printed page', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('button.extended-settings-trigger')).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
    await expect(page.locator('button.extended-settings-trigger')).toBeVisible();
  });
});
