/**
 * Automated a11y regression coverage (#69): axe-core catches the mechanical stuff
 * (missing labels, contrast, ARIA misuse) on every CI run, cheaply and repeatably.
 *
 * This is a floor, not the ceiling — axe cannot tell you whether keyboard navigation
 * or a screen reader's announcement of the chart actually makes sense, only whether
 * markup violates a known rule. A human pass with a real screen reader is still the
 * only thing that verifies #69's "tested with a screen reader" item.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { createPerson, gotoAndSettle, openChart, openNatalChart, signIn } from './support.ts';

const BOOTSTRAP_TOKEN = 'e2e-a11y-bootstrap-token';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'correct-horse-battery-e2e';

let dir: string;
let app: FastifyInstance;
let baseUrl: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-e2e-'));
  process.env.LOG_LEVEL = 'silent';
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;

  app = await build({ dbPath: join(dir, 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;

  // The bootstrap route mints the first account as an admin, which #357's admin-area
  // tests below need to sign in as.
  const response = await fetch(new URL('/api/setup', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: BOOTSTRAP_TOKEN, username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  if (!response.ok) throw new Error(`bootstrap failed with status ${String(response.status)}`);
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.ASTRAYA_BOOTSTRAP_TOKEN;
});

test('the bare landing page redirects to the people list with no automatically detectable accessibility violations', async ({
  page,
}) => {
  // #/ no longer has a screen of its own (#234): it redirects to #/people as soon as the app
  // mounts. Scanning immediately after `goto` would catch the page mid-redirect, so wait for
  // it to land first — the same thing the "empty People list" test below waits for.
  await gotoAndSettle(page, `${baseUrl}/`);
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('a gated chart-type tab renders as a genuinely disabled control (#234)', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('button', { name: 'Add a person' }).click();
  await expect(page.getByRole('heading', { name: 'New person' })).toBeVisible();

  // No birth data has been entered yet, so every tab but Birth record is gated.
  await expect(page.getByRole('button', { name: /^Charts/ })).toBeDisabled();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('the empty People list has no automatically detectable accessibility violations', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

// #456's remaining acceptance item ("test with keyboard navigation and screen readers"): the tooltipped header has a
// real button reachable by Tab, named for its column, whose popup is announced as a `tooltip`. What this cannot verify is
// what VoiceOver/NVDA/JAWS actually speak; that stays a manual check (axe is "a floor, not the ceiling").

test('the AI-Customized Generate button renders as a genuinely disabled control with an accessible reason (#360)', async ({
  page,
}) => {
  test.setTimeout(60_000);

  // Signs in before creating the person (unlike this file's other tests) so there is no
  // local-only data at sign-in time: this spec deliberately never sets
  // `ASTRAYA_ENCRYPTION_KEY`, so the sync relay — and the "adopt local changes" flow that
  // needs it — is intentionally disabled here.
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await signIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
  await createPerson(page, {
    name: 'Ada Lovelace',
    date: '1815-12-10',
    time: '07:45:00',
    latitude: '51.5072',
    longitude: '-0.1276',
  });
  await page.getByRole('link', { name: 'Interpretation', exact: true }).click();
  await page.getByRole('tab', { name: 'AI-Customized' }).click();

  // Unchecked consent, empty prompt: disabled, with a name explaining why — not a bare
  // "Generate" that gives no clue it's inert (mirrors PersonNav's disabled-tab pattern).
  const generate = page.getByRole('button', { name: /Generate — check the consent box first/ });
  await expect(generate).toBeDisabled();

  await page.getByRole('checkbox').check();
  await expect(
    page.getByRole('button', { name: /Generate — enter style, tone, and focus instructions first/ }),
  ).toBeDisabled();

  // A clean instruction clears the disabled reason entirely — the button's name reverts to
  // plain "Generate" rather than keeping a now-stale explanation.
  await page.getByRole('textbox', { name: 'Style, tone, and focus instructions' }).fill('warm and encouraging');
  await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('the admin screen has no automatically detectable accessibility violations (#357)', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await signIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('the corpus-overrides admin screen has no automatically detectable accessibility violations (#357)', async ({
  page,
}) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await signIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('link', { name: 'Corpus overrides', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Corpus corrections' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('the corpus-overrides table wraps its text instead of scrolling sideways, at desktop and phone width (#428)', async ({
  page,
}) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await signIn(page, ADMIN_USERNAME, ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('link', { name: 'Corpus overrides', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Corpus corrections' })).toBeVisible();
  const scroll = page.locator('div.data-table-scroll').first();
  await expect(scroll).toBeVisible();

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const tableBox = await scroll.locator('table').boundingBox();
    const scrollBox = await scroll.boundingBox();
    const overflow = (tableBox?.width ?? Number.POSITIVE_INFINITY) - (scrollBox?.width ?? 0);
    expect(overflow, `no sideways scroll at ${String(width)}px`).toBeLessThanOrEqual(1);
  }
  // Tier and category are words with an explanation, not the internal values.
  await expect(page.locator('.data-table-wrap tbody tr').first().locator('.cell-explanation').first()).toBeVisible();
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

  test("a person's detail form has no automatically detectable accessibility violations", async () => {
    await openSharedPerson(page, baseUrl, EINSTEIN);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('the chart view (wheel plus data tables) has no automatically detectable accessibility violations', async () => {
    test.setTimeout(60_000);

    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('every view of the natal chart has no automatically detectable accessibility violations (#511)', async () => {
    test.setTimeout(90_000);

    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    for (const name of ['Aspects', 'Aspect matrix', 'Elements & modalities', 'Placements', 'Patterns & condition']) {
      await page.getByRole('link', { name, exact: true }).click();
      await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, `view ${name}`).toEqual([]);
    }
  });

  test('column-header and dispositor tooltips are reachable on keyboard focus, not just mouse hover (#456)', async () => {
    test.setTimeout(60_000);

    // axe-core (the test above) only catches markup-rule violations; it would not have caught
    // `title`-only tooltips being invisible to a keyboard user, because a bare `title` attribute
    // isn't itself a rule violation. This test asserts the actual accessible-description wiring.
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await page.getByRole('link', { name: 'Patterns & condition', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dignities', level: 3 })).toBeVisible();

    // A column header with a glossary tooltip ("Ruler") has a real "About Ruler" button beside its sort button; the
    // same visible text appears on keyboard focus, on hover, and when it is clicked open (the shared Tooltip, #508).
    const definition = 'Ruler (domicile): the planet is in the sign it rules — its own sign, where it is strongest';
    const rulerHelp = page.getByRole('button', { name: 'About Ruler', exact: true });
    const popup = page.getByRole('tooltip');
    await rulerHelp.focus();
    await expect(popup).toHaveText(definition);
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await rulerHelp.hover();
    await expect(popup).toHaveText(definition);
    await page.mouse.move(0, 0);
    await expect(popup).toHaveCount(0);
    await rulerHelp.click();
    await expect(popup).toHaveText(definition);
    // Clicked open, it stays open when the pointer leaves, until Escape.
    await page.mouse.move(0, 0);
    await expect(popup).toHaveText(definition);
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);

    // The dispositors "?" is a focusable button with its own accessible name, not a bare non-interactive
    // <span title>; its explanation shows in the same shared tooltip popup on keyboard focus (#508).
    const dispositorsHelp = page.getByRole('button', { name: 'About dispositors', exact: true });
    await expect(dispositorsHelp).toBeVisible();
    await dispositorsHelp.focus();
    await expect(dispositorsHelp).toBeFocused();
    await expect(popup).toHaveText(
      "A dispositor is the ruler of a planet's sign. Dispositor chains trace where each planet's rulership flows.",
    );
  });

  test('a tooltipped table column header is reachable by keyboard and exposes its tooltip text (#456)', async () => {
    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openNatalChart(page);
    await page.getByRole('link', { name: 'Placements', exact: true }).click();

    const rxHelp = page.getByRole('button', { name: 'About Rx', exact: true });
    await rxHelp.focus();
    await expect(rxHelp).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveText(/retrograde/i);
  });

  test('the profections screen (#168) has no automatically detectable accessibility violations', async () => {
    test.setTimeout(60_000);

    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('button', { name: 'Progressions & Directions', exact: true }).click();
    await page.getByRole('link', { name: 'Profections', exact: true }).click();
    await expect(page.getByRole('cell', { name: 'Year' })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('the transit screen (#172) has no automatically detectable accessibility violations', async () => {
    test.setTimeout(60_000);

    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('button', { name: 'Transits & Forecast', exact: true }).click();
    await page.getByRole('link', { name: 'Transits', exact: true }).click();
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('the synastry screen (#172) has no automatically detectable accessibility violations', async () => {
    test.setTimeout(60_000);

    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('button', { name: 'Relationship Charts', exact: true }).click();
    await page.getByRole('link', { name: 'Synastry', exact: true }).click();
    await page.getByLabel('Compare with').selectOption({ label: 'Max Born' });
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('the composite screen (#169) has no automatically detectable accessibility violations', async () => {
    test.setTimeout(60_000);

    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('button', { name: 'Relationship Charts', exact: true }).click();
    await page.getByRole('link', { name: 'Composite', exact: true }).click();
    await page.getByLabel('Compose with').selectOption({ label: 'Max Born' });
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('the harmonic screen (#170) has no automatically detectable accessibility violations', async () => {
    test.setTimeout(60_000);

    await openSharedPerson(page, baseUrl, EINSTEIN);
    await openChart(page, 'Harmonic');
    await expect(page.locator('div.chart-wheel')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('the periodic transit forecast screen (#207) has no automatically detectable accessibility violations', async () => {
    test.setTimeout(60_000);

    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('button', { name: 'Transits & Forecast', exact: true }).click();
    await page.getByRole('link', { name: 'Forecast', exact: true }).click();
    await expect(page.getByText(/Solar return for \d{4}/)).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('the astrocartography screen (#171) has no automatically detectable accessibility violations', async () => {
    test.setTimeout(60_000);

    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('link', { name: 'Astrocartography', exact: true }).click();
    await expect(page.locator('div.acg-map svg')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('the interpretation view has no automatically detectable accessibility violations, on either sub-tab (#360)', async () => {
    test.setTimeout(60_000);

    await openSharedPerson(page, baseUrl, EINSTEIN);
    await page.getByRole('link', { name: 'Interpretation', exact: true }).click();
    await expect(page.getByRole('tablist', { name: 'Interpretation mode' })).toBeVisible();

    let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);

    // Signed out: the AI-Customized panel shows only the sign-in prompt, no controls.
    await page.getByRole('tab', { name: 'AI-Customized' }).click();
    await expect(page.getByText('Sign in to generate an AI-customized interpretation')).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate/ })).toHaveCount(0);

    results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
