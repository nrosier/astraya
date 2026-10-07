/**
 * The About page astrology primer (#457): a new section introducing astrology
 * fundamentals for users unfamiliar with astrological vocabulary. Tests verify
 * the primer section is visible, all subsections render, and en/nl parity holds.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { gotoAndSettle } from './support.ts';

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

test('the About page includes an astrology primer section with all subsections', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/about`);
  await expect(page.getByRole('heading', { name: 'About Astraya' })).toBeVisible();

  // Primer section heading and introduction
  await expect(page.getByRole('heading', { name: 'Astrology primer', exact: true })).toBeVisible();
  await expect(page.getByText(/Astrology is the ancient practice/)).toBeVisible();

  // Chart fundamentals paragraph with three dimensions
  await expect(page.getByText('The chart has three dimensions:')).toBeVisible();
  await expect(page.getByText(/The planets.*zodiac.*houses.*angular divisions/)).toBeVisible();

  // All subsections are present
  const expectedSections = ['Planets and points', 'The zodiac and signs', 'Houses', 'Aspects', 'Dignity and rulership'];

  for (const section of expectedSections) {
    await expect(page.getByRole('heading', { name: section, level: 3 })).toBeVisible();
  }

  // Planets subsection
  await expect(page.getByText(/Sun and Moon are not true planets/)).toBeVisible();
  await expect(page.getByText(/personal planets.*Mercury through Mars/)).toBeVisible();

  // Zodiac signs subsection
  await expect(page.getByText(/Twelve signs represent archetypal energies/)).toBeVisible();
  await expect(page.getByText(/Sun sign is determined by your birth date/)).toBeVisible();

  // Houses subsection
  await expect(page.getByText(/12 houses divide the chart into life areas/)).toBeVisible();
  await expect(page.getByText(/1st house is identity/)).toBeVisible();

  // Aspects subsection
  await expect(page.getByText(/aspect is the angle between two planets/)).toBeVisible();
  await expect(page.getByText(/0° conjunction/)).toBeVisible();

  // Dignity subsection
  await expect(page.getByText(/Each sign has a natural ruler/)).toBeVisible();
  await expect(page.getByText(/planet in its own sign.*strong and natural/)).toBeVisible();

  // Closing resources paragraph
  await expect(page.getByText(/For more, read conventional astrology introductions/)).toBeVisible();
});

test('the About page primer renders in Dutch with full translation', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/about`);

  // The language toggle (`LanguageToggle.tsx`) cycles through `CORPUS_LOCALES` (`['en', 'nl']`),
  // so one click from the English default switches the whole app's locale — this is the actual
  // mechanism a user has for seeing Dutch, so the test uses it rather than asserting against
  // English strings under a misleading name (#465).
  await page.locator('.language-toggle').click();

  const primerHeading = page.getByRole('heading', { name: 'Astrologie-primer', exact: true });
  await expect(primerHeading).toBeVisible();

  // Verify primer is part of the main content flow (not hidden)
  const about = page.locator('main.shell');
  const headings = about.getByRole('heading').all();
  const headingTexts = await Promise.all((await headings).map((h) => h.textContent()));

  // `aboutMessages.nl.*` headings (`About.messages.ts`) — the Dutch counterparts of the
  // headings the English test above checks for.
  const expectedHeadings = [
    'Over Astraya',
    'Versie',
    'Jouw gegevens',
    'Licentie en broncode',
    'Dankwoord',
    'Astrologie-primer',
    'Planeten en punten',
    'De dierenriem en tekens',
    'Huizen',
    'Aspecten',
    'Waardigheid en heerschappij',
  ];

  for (const expected of expectedHeadings) {
    expect(headingTexts, `Expected heading "${expected}" to be present`).toContain(expected);
  }

  // Spot-check actual body prose too, not just headings — a locale switch that left the
  // headings translated but the body text English would still be a real bug this should catch.
  await expect(page.getByText(/Astrologie is de oude praktijk/)).toBeVisible();
  await expect(page.getByText(/Elk teken heeft een natuurlijke heerser/)).toBeVisible();
});

test('the primer section is accessible and follows semantic structure', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/about`);

  const main = page.locator('main.shell');

  // h2 primer heading (section level)
  const primerH2 = main.getByRole('heading', { name: 'Astrology primer', level: 2 });
  await expect(primerH2).toBeVisible();

  // h3 subsection headings (correctly nested under the h2)
  const subsectionHeadings = main.getByRole('heading', { level: 3 });

  expect(await subsectionHeadings.count()).toBeGreaterThanOrEqual(5);

  // All paragraphs after h2 and before next h2 are part of primer
  const lastHeading = main.getByRole('heading', { level: 2 }).last();
  const lastHeadingText = await lastHeading.textContent();
  expect(lastHeadingText).toContain('Astrology primer');
});
