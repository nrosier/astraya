/**
 * One person to and from a file on the birth-record page (#699): each export downloads, and an AAF import replaces
 * another person's birth data after a preview, keeping their name. The page's card layout (#795, #896): a 60/40 pair
 * of columns at 1280px and one column at 390px, with Save changes in the page header, the timezone status row in the
 * location card and the timezone details in their own card in the right column (#895).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { BORN, EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';

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

  // A fresh context per test, holding the shared people (#799); what a test edits stays in that context.
  test.beforeEach(async ({ browser }) => {
    context = await newSeededContext(browser, baseUrl);
    page = await context.newPage();
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('exports a person three ways, and replaces another person’s birth data from the AAF after a preview', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('link', { name: 'Birth record', exact: true }).click();
    const section = page.locator('div.person-file-actions');
    await expect(section.getByRole('heading', { name: 'Export', exact: true })).toBeVisible();

    const download = async (button: string) => {
      const [file] = await Promise.all([
        page.waitForEvent('download'),
        section.getByRole('button', { name: button, exact: true }).click(),
      ]);
      return file;
    };
    const aaf = await download('AAF');
    expect(aaf.suggestedFilename()).toBe('albert-einstein-birth-record.aaf');
    const aafPath = join(dir, 'einstein.aaf');
    await aaf.saveAs(aafPath);
    expect((await download('CSV')).suggestedFilename()).toBe('albert-einstein-birth-record.csv');
    expect((await download('JSON')).suggestedFilename()).toBe('albert-einstein-birth-record.json');

    await openSharedPerson(page, baseUrl, BORN);
    await page.getByRole('link', { name: 'Birth record', exact: true }).click();
    // The replace flow lives in its own card, directly below the export card (#896).
    const replace = page.locator('section.birth-record-card--replace');
    await expect(replace.getByRole('heading', { name: 'Replace data' })).toBeVisible();
    await replace.locator('input[type="file"]').setInputFiles(aafPath);

    // Nothing is saved before the reader confirms: the preview names each change.
    await expect(replace.getByRole('heading', { name: 'What changes' })).toBeVisible();
    await expect(replace.locator('dd', { hasText: '1882-12-11 → 1879-03-14' })).toBeVisible();
    await replace.getByRole('button', { name: 'Replace birth data' }).click();
    await expect(replace.getByText('Birth data replaced.')).toBeVisible();

    // The form now shows Einstein's birth date under Born's name.
    await expect(page.getByLabel('Date', { exact: true })).toHaveValue(EINSTEIN.date);
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(BORN.name);
  });

  test('puts Save at the right content edge, level with the page title, at 1280x800 and 390x844 (#896)', async () => {
    test.setTimeout(60_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('link', { name: 'Birth record', exact: true }).click();
    const save = page.locator('.birth-record-save button');
    const title = page.locator('.page-header-row h1');
    await expect(save).toBeVisible();
    await expect(title).toBeVisible();
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const measured = await Promise.all([
        save.boundingBox(),
        title.boundingBox(),
        // The page's right content edge: the shell's right border edge less its right padding.
        page.evaluate(
          `(() => {
            const shell = document.querySelector('main.shell');
            if (shell === null) return Number.NaN;
            return shell.getBoundingClientRect().right - parseFloat(getComputedStyle(shell).paddingRight);
          })()`,
        ),
      ]);
      const [saveBox, titleBox, contentRight] = measured;
      if (saveBox === null || titleBox === null || typeof contentRight !== 'number') {
        throw new Error('Save, title or content edge not laid out');
      }
      const saveCentre = saveBox.y + saveBox.height / 2;
      const titleCentre = titleBox.y + titleBox.height / 2;
      // The header's Export dropdown sits beside Save (#887, owner 2026-10-30), so Save may sit left of the content
      // edge by the width of that control. Save must still be the rightmost control or sit inside the edge.
      const exportToggle = page.locator('.page-header-row .page-header-export-toggle');
      const exportBox = (await exportToggle.count()) > 0 ? await exportToggle.boundingBox() : null;
      const rightmost =
        exportBox === null
          ? saveBox.x + saveBox.width
          : Math.max(saveBox.x + saveBox.width, exportBox.x + exportBox.width);
      expect(
        rightmost - contentRight,
        `${String(viewport.width)}px header controls stay inside the content edge`,
      ).toBeLessThan(1);
      expect(
        saveBox.x + saveBox.width - contentRight,
        `${String(viewport.width)}px Save stays inside the content edge`,
      ).toBeLessThan(1);
      expect(Math.abs(saveCentre - titleCentre), `${String(viewport.width)}px vertical centre`).toBeLessThan(2);
    }
  });

  test('lays the birth record out as a 60/40 pair of columns at 1280px and one column at 390px (#795, #896)', async () => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('link', { name: 'Birth record', exact: true }).click();
    const card = (name: string) => page.locator(`section.birth-record-card--${name}`);
    const box = async (name: string) => {
      const found = await card(name).boundingBox();
      if (found === null) throw new Error(`${name} card not laid out`);
      return found;
    };
    const save = page.locator('.birth-record-save button');
    await expect(card('location').locator('.birth-record-timezone-status')).toBeVisible();
    await expect(card('timezone').locator('.primitive-disclosure-trigger')).toBeVisible();
    await expect(page.locator('.sticky-actions')).toHaveCount(0);
    await expect(card('notes').locator('button')).toHaveCount(0);
    await expect(card('location').locator('button', { hasText: 'Save' })).toHaveCount(0);
    // Save changes sits in the page header, on the same row as the title (#896).
    const title = await page.locator('.page-header-row h1').boundingBox();
    const saveBox = await save.boundingBox();
    if (title === null || saveBox === null) throw new Error('title row not laid out');
    expect(Math.abs(saveBox.y + saveBox.height / 2 - (title.y + title.height / 2))).toBeLessThan(
      Math.max(title.height, saveBox.height),
    );
    expect(saveBox.x).toBeGreaterThan(title.x + title.width - 1);

    // Desktop: identity and place on the left (60%); notes, the export, replace and danger cards on the right (40%) (#895).
    const [identity, location, notes, files, replace, danger] = await Promise.all(
      ['identity', 'location', 'notes', 'files', 'replace', 'danger'].map(box),
    );
    if (!identity || !location || !notes || !files || !replace || !danger) throw new Error('missing card');
    expect(Math.abs(location.x - identity.x)).toBeLessThan(1);
    for (const right of [notes, files, replace, danger]) expect(Math.abs(right.x - files.x)).toBeLessThan(1);
    expect(files.x).toBeGreaterThan(identity.x + identity.width);
    // 60/40: the left column is about 1.5 times the right column (gap and padding allowed for).
    const ratio = identity.width / files.width;
    expect(ratio).toBeGreaterThan(1.3);
    expect(ratio).toBeLessThan(1.7);
    expect(location.y).toBeGreaterThan(identity.y);
    expect(notes.y).toBeLessThan(files.y);
    // The bottom row shares one bottom edge (#895): the left column's last card and the right column's last card end together.
    expect(Math.abs(location.y + location.height - (danger.y + danger.height))).toBeLessThanOrEqual(1);
    // The 90% rule (#895, H3): with the slack removed, the shorter column's content is at least 90% of the taller one's,
    // and the NOTES card keeps its natural height (it is never the card that absorbs the slack).
    await page.addStyleTag({ content: '.birth-record-column > :last-child { flex-grow: 0 !important; }' });
    const naturalHeight = async (column: number): Promise<number> => {
      const columnBox = await page.locator('.birth-record-column').nth(column).boundingBox();
      const lastBox = await page
        .locator('.birth-record-column')
        .nth(column)
        .locator(':scope > :last-child')
        .boundingBox();
      if (columnBox === null || lastBox === null) throw new Error('birth record column not laid out');
      return lastBox.y + lastBox.height - columnBox.y;
    };
    const leftNatural = await naturalHeight(0);
    const rightNatural = await naturalHeight(1);
    expect(Math.min(leftNatural, rightNatural) / Math.max(leftNatural, rightNatural)).toBeGreaterThanOrEqual(0.9);
    expect(notes.height).toBeLessThan(location.height);
    expect(replace.y).toBeGreaterThan(notes.y);
    expect(danger.y).toBeGreaterThan(replace.y);
    // Date, how the time is known, and the time share one row.
    const tops = await Promise.all(
      ['input[type="date"]', 'select', 'input[type="time"]'].map(async (selector) => {
        const found = await card('identity').locator(selector).boundingBox();
        return found?.y ?? Number.NaN;
      }),
    );
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);

    // Narrow: one column, with the location card above the notes.
    await page.setViewportSize({ width: 390, height: 844 });
    const [narrowIdentity, narrowLocation, narrowNotes] = await Promise.all(['identity', 'location', 'notes'].map(box));
    if (!narrowIdentity || !narrowLocation || !narrowNotes) throw new Error('missing card');
    expect(Math.abs(narrowLocation.x - narrowIdentity.x)).toBeLessThan(1);
    expect(narrowNotes.y).toBeGreaterThan(narrowLocation.y);
    // Nothing pushes the page sideways: every card ends inside the viewport.
    expect(narrowNotes.x + narrowNotes.width).toBeLessThanOrEqual(390);
    expect(narrowLocation.x + narrowLocation.width).toBeLessThanOrEqual(390);
  });

  test('puts AAF, JSON and CSV in one horizontal row at 390x844 and 1280x800 (#896)', async () => {
    test.setTimeout(60_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('link', { name: 'Birth record', exact: true }).click();
    const group = page.locator('.birth-record-export-row');
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const buttons = ['AAF', 'JSON', 'CSV'].map((name) => group.getByRole('button', { name, exact: true }));
      const boxes = await Promise.all(
        buttons.map(async (button) => {
          await expect(button).toBeVisible();
          const found = await button.boundingBox();
          if (found === null) throw new Error(`export button not laid out at ${String(viewport.width)}px`);
          return found;
        }),
      );
      const tops = boxes.map((found) => found.y);
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
    }
  });
});
