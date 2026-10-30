/**
 * The PDF export builder (#441): reached from the header's Export menu, builds and downloads a
 * real PDF for a chosen preset. No unit test exercises the actual jsPDF/svg2pdf.js/jspdf-autotable
 * rendering — `test/ui-pdf-export-plan.test.ts` covers the plan those libraries draw, but never the
 * drawing itself, which needs a real browser (`src/ui/pdf-export-plan.ts`'s own doc comment explains
 * why svg2pdf.js in particular cannot be imported under Vitest at all).
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { createPerson, gotoAndSettle, pdfTextRuns, signIn } from './support.ts';

const BOOTSTRAP_TOKEN = 'e2e-pdf-builder-bootstrap-token';
const USERNAME = 'pdf-reader';
const PASSWORD = 'correct-horse-battery-e2e';

let dir: string;
let app: FastifyInstance;
let baseUrl: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-e2e-'));
  process.env.LOG_LEVEL = 'silent';
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
  process.env.ASTRAYA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  app = await build({ dbPath: join(dir, 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
  // One account, for the saved interpretation picker, which is only offered when signed in (#759).
  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup',
    payload: { token: BOOTSTRAP_TOKEN, username: USERNAME, password: PASSWORD },
  });
  if (setup.statusCode >= 400) throw new Error(`setup failed: ${String(setup.statusCode)}`);
  delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
  delete process.env.ASTRAYA_ENCRYPTION_KEY;
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

/** The advanced groups start collapsed (#916): open one by its title before using what is inside it. */
async function openGroup(page: Page, title: string): Promise<void> {
  const trigger = page.getByRole('button', { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
}

const ADA = {
  name: 'Ada Lovelace',
  date: '1815-12-10',
  time: '07:45:00',
  latitude: '51.5072',
  longitude: '-0.1276',
};

test('the header’s PDF-builder link opens the PDF builder, and a preset downloads a real PDF', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);

  // A plain link, not a dropdown (#506/#509) — it is the only export action left in the header.
  const header = page.getByRole('banner');
  const builderLink = header.getByRole('link', { name: 'PDF', exact: true });
  await expect(builderLink).not.toHaveAttribute('aria-current', 'page');
  await builderLink.click();
  await expect(page).toHaveURL(/#\/documents$/);
  // The rail marks where you are, from the same feature registry as the rest of the navigation.
  await expect(builderLink).toHaveAttribute('aria-current', 'page');
  // One page, one h1 (#916): the Documents page is the builder itself, with the shared PageHeader and no back link.
  await expect(page.getByRole('heading', { name: 'Build a PDF', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByRole('link', { name: '← Back' })).toHaveCount(0);

  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Ada Lovelace' });
  await page
    .getByLabel('Starting point', { exact: true })
    .selectOption({ label: 'Executive summary (natal wheel, positions, interpretation)' });

  const buildButton = page.getByRole('button', { name: 'Build PDF', exact: true });
  await expect(buildButton).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), buildButton.click()]);
  expect(download.suggestedFilename()).toBe('ada-lovelace-executive-summary.pdf');

  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(1000);
  // The interpretation sets each Sabian symbol apart (#653) as a callout (#655): a KEY INSIGHT tag, then the reading in
  // a font other than the body text's (the oblique). Read through the embedded font's ToUnicode map (`pdfTextRuns`).
  const runs = pdfTextRuns(pdf.toString('latin1'));
  const tag = runs.findIndex((run) => run.text === 'KEY INSIGHT');
  expect(tag).toBeGreaterThan(0);
  const body = runs.find((run) => run.text.startsWith('Your core drive'));
  const reading = runs[tag + 1];
  expect(reading?.text.length).toBeGreaterThan(10);
  expect(reading?.font).not.toBe(body?.font);
  // The cover names the person in capitals, and every contents line links to its page (#711).
  expect(runs.some((run) => run.text === 'ADA LOVELACE')).toBe(true);
  expect(pdf.toString('latin1').split('/Subtype /Link').length - 1).toBeGreaterThan(3);
  // The prime of a degree draws as itself, no longer as an apostrophe.
  expect(runs.some((run) => /\d+°\d{2}′/.test(run.text))).toBe(true);

  await expect(page.getByRole('status')).toHaveText('✓');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('signed in, the picker offers the stored interpretations in the PDF’s language, and both build into the PDF (#759)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const entries = [
    {
      id: 'saved-one',
      mode: 'freeform',
      locale: 'en',
      createdAt: '2026-10-01T09:00:00.000Z',
      description: null,
      kind: 'whole-chart',
      basis: { kind: 'whole-chart' },
    },
    {
      id: 'saved-two',
      mode: 'focus',
      locale: 'en',
      createdAt: '2026-10-02T09:00:00.000Z',
      description: null,
      kind: 'focus',
      basis: { kind: 'focus', body: 'sun', perspective: 'natal' },
    },
  ];
  // Stubbed: the stored list and each stored result. No model is ever called.
  await page.route('**/api/interpretation/results*', async (route) => {
    await route.fulfill({ json: { results: entries } });
  });
  await page.route('**/api/interpretation/results/*', async (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    const entry = entries.find((candidate) => candidate.id === id);
    if (entry === undefined) {
      await route.fulfill({ status: 404, json: { error: 'not found' } });
      return;
    }
    await route.fulfill({ json: { ...entry, sections: [{ heading: `Stored ${id}`, body: 'A stored reading.' }] } });
  });

  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await signIn(page, USERNAME, PASSWORD);
  await page.goto(`${baseUrl}/#/documents/pdf`);
  await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Ada Lovelace' });

  const picker = page.getByRole('group', { name: 'Saved AI interpretations', exact: true });
  await picker.getByRole('button', { name: 'Choose interpretations', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose saved AI interpretations' });
  const boxes = dialog.getByRole('checkbox');
  await expect(boxes).toHaveCount(2);
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(picker.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('checkbox', { name: /consent/i })).toHaveCount(0);

  const buildButton = page.getByRole('button', { name: 'Build PDF', exact: true });
  await expect(buildButton).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), buildButton.click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  await expect(page.getByRole('status')).toHaveText('✓');
});

test('the Documents page keeps its starting point and Build PDF in the header, with the summary beside the selection (#916)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoAndSettle(page, `${baseUrl}/#/documents`);
  const header = page.locator('.page-header');
  await expect(header.getByLabel('Starting point', { exact: true })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Build PDF', exact: true })).toBeVisible();
  // Desktop: the summary column sits to the right of the selection, and no Build bar is pinned.
  const selection = await page.getByRole('heading', { name: 'Document sections', level: 2 }).boundingBox();
  const summary = await page.getByRole('complementary', { name: 'Export summary' }).boundingBox();
  expect(selection && summary && summary.x > selection.x).toBe(true);
  // The advanced groups start collapsed (#916), and the Charts section has no checkbox of its own.
  await expect(page.getByRole('button', { name: /^Charts/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('checkbox', { name: 'Charts', exact: true })).toHaveCount(0);
  // Consultation notes are off, and planned until #919.
  await expect(page.getByRole('checkbox', { name: 'Include consultation notes', exact: true })).toBeDisabled();
  await expect(page.getByText('Planned', { exact: true })).toBeVisible();
});

test('on a phone the Build PDF bar is pinned to the bottom of the screen (#916)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, `${baseUrl}/#/documents`);
  // Wait for the lazy screen to be ready before measuring or scanning it.
  await expect(page.getByRole('heading', { name: 'Build a PDF', level: 1 })).toBeVisible();
  const bar = page.locator('.pdf-build-actions');
  await expect(bar).toBeVisible();
  const position = await page.evaluate("getComputedStyle(document.querySelector('.pdf-build-actions')).position");
  expect(position).toBe('fixed');
  const bottomGap = await page.evaluate<number>(
    "window.innerHeight - document.querySelector('.pdf-build-actions').getBoundingClientRect().bottom",
  );
  expect(Math.abs(bottomGap)).toBeLessThanOrEqual(1);
  expect(await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(1);
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
  { width: 3440, height: 1440 },
] as const) {
  test(`the Documents layout at ${String(viewport.width)}x${String(viewport.height)}: 60/40 on desktop, one column on a phone, full-width person picker (#916)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await gotoAndSettle(page, `${baseUrl}/#/documents`);
    await expect(page.getByRole('heading', { name: 'Build a PDF', level: 1 })).toBeVisible();
    expect(await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(1);
    const left = await page.locator('.pdf-builder-grid > .pdf-builder-column').first().boundingBox();
    const right = await page.getByRole('complementary', { name: 'Export summary' }).boundingBox();
    const person = await page.getByLabel('Person', { exact: true }).boundingBox();
    if (left === null || right === null || person === null) throw new Error('the Documents columns did not render');
    // The person dropdown spans its whole column.
    expect(Math.abs(person.width - left.width)).toBeLessThanOrEqual(1);
    if (viewport.width < 1024) {
      // A phone: one column, the summary below the selection.
      expect(right.y).toBeGreaterThan(left.y);
      expect(Math.abs(right.x - left.x)).toBeLessThanOrEqual(1);
    } else {
      // Desktop: side by side, the left column 3fr and the right 2fr (60/40).
      expect(right.x).toBeGreaterThan(left.x + left.width - 1);
      const share = left.width / (left.width + right.width);
      expect(share).toBeGreaterThan(0.57);
      expect(share).toBeLessThan(0.63);
    }
    // The advanced groups start collapsed at every size.
    await expect(page.getByRole('button', { name: /^Charts/ })).toHaveAttribute('aria-expanded', 'false');
  });
}

test('Documents starts on the person whose pages were open, not the first in the list (#709)', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, ADA);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await createPerson(page, { ...ADA, name: 'Zoe Later' });
  await page.getByRole('link', { name: 'Birth record', exact: true }).click();
  await page.getByRole('banner').getByRole('link', { name: 'PDF', exact: true }).click();
  const picker = page.getByLabel('Person', { exact: true });
  await expect(picker.locator('option:checked')).toHaveText('Zoe Later');
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

  test('ticking a chart type reveals its own tables and wheel checkbox, and unticking collapses them', async () => {
    test.setTimeout(60_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.goto(`${baseUrl}/#/documents/pdf`);
    await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Albert Einstein' });
    await openGroup(page, 'Charts');

    await expect(page.getByLabel('Wheel', { exact: true })).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Harmonic', exact: true }).check();
    await expect(page.getByLabel('Wheel', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Harmonic number', { exact: true })).toHaveValue('5');
    await page.getByRole('checkbox', { name: 'Harmonic', exact: true }).uncheck();
    await expect(page.getByLabel('Wheel', { exact: true })).toHaveCount(0);
  });

  test('signed out, the saved interpretation picker is disabled, asks the server nothing, and has no consent tick (#759)', async () => {
    test.setTimeout(60_000);
    const listed: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/interpretation/results')) listed.push(request.url());
    });
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.goto(`${baseUrl}/#/documents/pdf`);
    await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Albert Einstein' });

    const picker = page.getByRole('group', { name: 'Saved AI interpretations', exact: true });
    await expect(picker).toBeVisible();
    await expect(picker.getByText('Sign in to include your saved AI interpretations.')).toBeVisible();
    await expect(picker.getByRole('button', { name: 'Choose interpretations', exact: true })).toBeDisabled();
    // Nothing is generated at export, so there is no consent to give.
    await expect(page.getByRole('checkbox', { name: /consent/i })).toHaveCount(0);
    expect(listed).toEqual([]);
  });

  test('synastry and composite each get their own partner picker, and both build into one PDF (#441)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.goto(`${baseUrl}/#/documents/pdf`);
    await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Albert Einstein' });
    await openGroup(page, 'Relationship charts');

    // Neither partner picker exists until its own checkbox is ticked.
    await expect(page.getByLabel('Compare with', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Compose with', { exact: true })).toHaveCount(0);

    await page.getByRole('checkbox', { name: 'Synastry', exact: true }).check();
    await page.getByLabel('Compare with', { exact: true }).selectOption({ label: 'Max Born' });
    await page.getByRole('checkbox', { name: 'Composite', exact: true }).check();
    await page.getByLabel('Compose with', { exact: true }).selectOption({ label: 'Max Born' });

    const buildButton = page.getByRole('button', { name: 'Build PDF', exact: true });
    await expect(buildButton).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent('download'), buildButton.click()]);
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
    const pdf = Buffer.concat(chunks);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
    await expect(page.getByRole('status')).toHaveText('✓');
  });

  test('unticking Synastry hides its partner picker and drops it from the selection', async () => {
    test.setTimeout(60_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.goto(`${baseUrl}/#/documents/pdf`);
    await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Albert Einstein' });
    await openGroup(page, 'Relationship charts');

    await page.getByRole('checkbox', { name: 'Synastry', exact: true }).check();
    await expect(page.getByLabel('Compare with', { exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Synastry', exact: true }).uncheck();
    await expect(page.getByLabel('Compare with', { exact: true })).toHaveCount(0);
  });

  test('ticking Progressions reveals its technique/MC-method controls, which collapse the MC method for non-secondary techniques (#441)', async () => {
    test.setTimeout(60_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.goto(`${baseUrl}/#/documents/pdf`);
    await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Albert Einstein' });

    await openGroup(page, 'Progressions, solar arc, profections & astrocartography');

    const predictive = page.getByRole('group', { name: 'Progressions, solar arc, profections & astrocartography' });
    await expect(predictive.getByLabel('Technique', { exact: true })).toHaveCount(0);
    await predictive.getByRole('checkbox', { name: 'Progressions', exact: true }).check();
    await expect(predictive.getByLabel('Technique', { exact: true })).toHaveValue('secondary');
    await expect(predictive.getByLabel('MC method', { exact: true })).toBeVisible();

    await predictive.getByLabel('Technique', { exact: true }).selectOption({ label: 'Minor' });
    await expect(predictive.getByLabel('MC method', { exact: true })).toHaveCount(0);

    await predictive.getByRole('checkbox', { name: 'Progressions', exact: true }).uncheck();
    await expect(predictive.getByLabel('Technique', { exact: true })).toHaveCount(0);
  });

  test('ticking Astrocartography reveals its map/line-type/body controls, which collapse when unticked (#441)', async () => {
    test.setTimeout(60_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.goto(`${baseUrl}/#/documents/pdf`);
    await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Albert Einstein' });

    await openGroup(page, 'Progressions, solar arc, profections & astrocartography');

    const predictive = page.getByRole('group', { name: 'Progressions, solar arc, profections & astrocartography' });
    await expect(predictive.getByLabel('Map', { exact: true })).toHaveCount(0);
    await predictive.getByRole('checkbox', { name: 'Astrocartography', exact: true }).check();
    await expect(predictive.getByLabel('Map', { exact: true })).toBeChecked();
    await expect(predictive.getByRole('checkbox', { name: 'MC', exact: true })).toBeChecked();
    await expect(predictive.getByRole('checkbox', { name: 'Sun', exact: true })).toBeChecked();
    await expect(predictive.getByRole('checkbox', { name: 'Uranus', exact: true })).not.toBeChecked();

    await predictive.getByRole('checkbox', { name: 'Astrocartography', exact: true }).uncheck();
    await expect(predictive.getByLabel('Map', { exact: true })).toHaveCount(0);
  });

  test('selecting the Full predictive report preset fills progressions and solar arc, and builds a real PDF (#441)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.goto(`${baseUrl}/#/documents/pdf`);
    await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Albert Einstein' });
    await page
      .getByLabel('Starting point', { exact: true })
      .selectOption({ label: 'Full predictive report (natal wheel, transits, progressions, solar arc)' });

    await openGroup(page, 'Progressions, solar arc, profections & astrocartography');

    const predictive = page.getByRole('group', { name: 'Progressions, solar arc, profections & astrocartography' });
    await expect(predictive.getByRole('checkbox', { name: 'Progressions', exact: true })).toBeChecked();
    await expect(predictive.getByRole('checkbox', { name: 'Solar arc directions', exact: true })).toBeChecked();
    await expect(predictive.getByRole('checkbox', { name: 'Profections', exact: true })).not.toBeChecked();
    await expect(predictive.getByRole('checkbox', { name: 'Astrocartography', exact: true })).not.toBeChecked();

    const buildButton = page.getByRole('button', { name: 'Build PDF', exact: true });
    await expect(buildButton).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent('download'), buildButton.click()]);
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
    const pdf = Buffer.concat(chunks);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
    await expect(page.getByRole('status')).toHaveText('✓');
  });

  test('ticking Profections and Astrocartography on their own builds a real PDF with both sections (#441)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.goto(`${baseUrl}/#/documents/pdf`);
    await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Albert Einstein' });

    await openGroup(page, 'Progressions, solar arc, profections & astrocartography');

    const predictive = page.getByRole('group', { name: 'Progressions, solar arc, profections & astrocartography' });
    await predictive.getByRole('checkbox', { name: 'Profections', exact: true }).check();
    await predictive.getByRole('checkbox', { name: 'Astrocartography', exact: true }).check();

    const buildButton = page.getByRole('button', { name: 'Build PDF', exact: true });
    await expect(buildButton).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent('download'), buildButton.click()]);
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
    const pdf = Buffer.concat(chunks);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
    await expect(page.getByRole('status')).toHaveText('✓');
  });

  test('ticking Transits reveals its filter/wheel/table/date controls, and ticking Forecast reveals its tier checkboxes, both collapsing when unticked (#441)', async () => {
    test.setTimeout(60_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.goto(`${baseUrl}/#/documents/pdf`);
    await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Albert Einstein' });

    await openGroup(page, 'Transits & Forecast');

    const transitsGroup = page.getByRole('group', { name: 'Transits & Forecast' });
    await expect(transitsGroup.getByLabel('Contacts shown', { exact: true })).toHaveCount(0);
    await transitsGroup.getByRole('checkbox', { name: 'Transits', exact: true }).check();
    await expect(transitsGroup.getByLabel('Contacts shown', { exact: true }).first()).toHaveValue('important');
    await expect(transitsGroup.getByRole('checkbox', { name: 'Wheel', exact: true })).toBeChecked();
    await expect(transitsGroup.getByRole('checkbox', { name: 'Aspects', exact: true })).toBeChecked();
    await transitsGroup.getByRole('checkbox', { name: 'Transits', exact: true }).uncheck();
    await expect(transitsGroup.getByLabel('Contacts shown', { exact: true })).toHaveCount(0);

    await expect(transitsGroup.getByRole('checkbox', { name: 'Daily', exact: true })).toHaveCount(0);
    await transitsGroup.getByRole('checkbox', { name: 'Forecast', exact: true }).check();
    await expect(transitsGroup.getByRole('checkbox', { name: 'Daily', exact: true })).toBeChecked();
    await expect(transitsGroup.getByRole('checkbox', { name: 'Weekly', exact: true })).toBeChecked();
    await expect(transitsGroup.getByRole('checkbox', { name: 'Monthly', exact: true })).toBeChecked();
    await expect(transitsGroup.getByRole('checkbox', { name: 'Yearly', exact: true })).toBeChecked();
    await transitsGroup.getByRole('checkbox', { name: 'Forecast', exact: true }).uncheck();
    await expect(transitsGroup.getByRole('checkbox', { name: 'Daily', exact: true })).toHaveCount(0);
  });

  test('ticking Eclipses reveals its from/to year controls, collapsing when unticked, and builds a real PDF (#441, #484)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.goto(`${baseUrl}/#/documents/pdf`);
    await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Albert Einstein' });

    await openGroup(page, 'Eclipses');

    const eclipsesGroup = page.getByRole('group', { name: 'Eclipses', exact: true });
    await expect(eclipsesGroup.getByLabel('From year', { exact: true })).toHaveCount(0);
    await eclipsesGroup.getByRole('checkbox', { name: 'Eclipses', exact: true }).check();
    const thisYear = new Date().getUTCFullYear();
    await expect(eclipsesGroup.getByLabel('From year', { exact: true })).toHaveValue(String(thisYear - 1));
    await expect(eclipsesGroup.getByLabel('To year', { exact: true })).toHaveValue(String(thisYear + 3));

    const buildButton = page.getByRole('button', { name: 'Build PDF', exact: true });
    await expect(buildButton).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent('download'), buildButton.click()]);
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
    const pdf = Buffer.concat(chunks);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
    await expect(page.getByRole('status')).toHaveText('✓');

    await eclipsesGroup.getByRole('checkbox', { name: 'Eclipses', exact: true }).uncheck();
    await expect(eclipsesGroup.getByLabel('From year', { exact: true })).toHaveCount(0);
  });

  test('the PDF builder has its own Sabian symbol notes option, starting from the device setting, and unticking it leaves them out of the PDF (#660)', async () => {
    test.setTimeout(90_000);
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await gotoAndSettle(page, `${baseUrl}/#/documents`);
    await page.getByLabel('Person', { exact: true }).selectOption({ label: 'Albert Einstein' });
    await page
      .getByLabel('Starting point', { exact: true })
      .selectOption({ label: 'Executive summary (natal wheel, positions, interpretation)' });

    // The option appears with the written report, and starts from the device setting, which is on by default: the PDF
    // matches the Report on screen until the reader changes it here.
    await page.getByRole('checkbox', { name: 'Written report (included at no extra cost)', exact: true }).check();
    const option = page.getByRole('checkbox', { name: 'Include Sabian symbol notes', exact: true });
    await expect(option).toBeChecked();
    await option.uncheck();
    await expect(option).not.toBeChecked();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Build PDF', exact: true }).click(),
    ]);
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
    const runs = pdfTextRuns(Buffer.concat(chunks).toString('latin1'));
    expect(runs.some((run) => run.text.startsWith('Core identity'))).toBe(true);
    expect(runs.some((run) => run.text === 'KEY INSIGHT')).toBe(false);
  });
});
