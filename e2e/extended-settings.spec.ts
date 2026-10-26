/**
 * The chart's Extended settings card (#442): a summary button that opens a modal card, groups tagged by how they
 * apply, Apply and Cancel, starting points, and the phone layout.
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
import { closeSettings, createPerson, gotoAndSettle, openNatalChart, openSettings } from './support.ts';

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

    // The groups, in the order a chart is set up, each saying how it applies.
    await openSettings(page);
    const card = page.locator('dialog.settings-card');
    await expect(card.getByRole('heading', { name: 'Extended settings', level: 2 })).toBeVisible();
    await expect(card.locator('fieldset.settings-card-group > legend')).toHaveText([
      'Calculation profile',
      'Chart frame',
      'Bodies and points',
      'Station window and motion score',
      'Traditional scheme',
      'Aspects and orbs',
      'Wheel colours',
      'Rulership & dignities',
      'How planetary and zodiac symbols are displayed',
    ]);
    await expect(
      card.getByText('Shown at once, kept when you apply or save, and put back by Cancel.').first(),
    ).toBeVisible();
    await expect(card.getByRole('button', { name: /^Apply and redraw/ })).toBeDisabled();

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

    // The orbs now in force are spelled out, not only a percentage.
    await card.getByRole('slider', { name: 'Orb scale' }).fill('-10');
    await expect(card.getByText(/major aspects 6[.,]3°/)).toBeVisible();

    // Escape closes without applying.
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

    await openSettings(page);
    const card = page.locator('dialog.settings-card');
    const bodiesGroup = card.locator('fieldset.settings-card-group', { hasText: 'Bodies and points' });

    // Starts on no named preset (the shipped default isn't exactly Core/Traditional/All).
    const presets = bodiesGroup.getByRole('radiogroup', { name: 'Object visibility preset', exact: true });
    await expect(presets.getByRole('radio', { name: /^Custom/ })).toBeChecked();

    // Choosing "Core" applies a complete policy at once: Jupiter (not core) drops out, Sun stays.
    await presets.getByRole('radio', { name: /^Core/ }).check();
    await expect(bodiesGroup.getByLabel('Jupiter — visible', { exact: true })).not.toBeChecked();
    await expect(bodiesGroup.getByLabel('Sun — visible', { exact: true })).toBeChecked();
    await expect(presets.getByRole('radio', { name: /^Core/ })).toBeChecked();

    // The Planets group's own "All" button turns every planet back on, independent of the preset.
    const planetsGroup = bodiesGroup
      .locator('fieldset.field-group')
      .filter({ has: page.locator('legend', { hasText: /^Planets$/ }) });
    await planetsGroup.getByRole('button', { name: 'All', exact: true }).click();
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

  test('the Apply button enables when only Symbols are changed (#459)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    await openSettings(page);
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
    await openSettings(page);
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

  test('the card works on a phone: it fills the screen, scrolls inside, and keeps Apply in reach', async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('link', { name: 'Charts', exact: true }).click();
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    await openSettings(page);
    const card = page.locator('dialog.settings-card');
    const box = await card.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(388);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(790);
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
