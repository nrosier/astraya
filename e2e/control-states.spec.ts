/**
 * The shared control primitives across languages and themes (#508): every screen built from them passes axe's
 * WCAG 2 A/AA rules (contrast included) in light and dark, in English and Dutch, in their resting, invalid and
 * focused states; and no label or control is cut off, or pushes the page sideways, at desktop or phone width.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
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

/** Screens made of the primitives that need no person: a blank new person form and the tool screens. */
const SCREENS: readonly (readonly [string, string])[] = [
  ['the new person form', '#/people'],
  ['cycles', '#/explore/cycles'],
  ['eclipses', '#/explore/eclipses'],
  ['horary', '#/explore/horary'],
  ['electional', '#/explore/electional'],
  ['rectification', '#/explore/rectification'],
];

const LOCALES = ['en', 'nl'] as const;
const THEMES = ['light', 'dark'] as const;

async function settle(page: Page, hash: string, locale: string, theme: string): Promise<void> {
  await page.addInitScript(
    ([language, mode]) => {
      localStorage.setItem('astraya:reportLocale', language ?? 'en');
      localStorage.setItem('astraya.theme', mode ?? 'light');
    },
    [locale, theme],
  );
  await gotoAndSettle(page, `${baseUrl}/${hash}`);
  // The person form opens on a freshly created, still-empty person (every field invalid to begin with).
  if (hash === '#/people')
    await page
      .getByRole('button', { name: locale === 'nl' ? 'Persoon toevoegen' : 'Add a person', exact: true })
      .click();
  // The section tab row (#882) also holds a display:none fallback Select above 40rem; wait for a rendered field.
  await expect(page.locator('.primitive-field:visible').first()).toBeVisible();
}

/** Labels cut off, controls off-screen or too narrow, and sideways page scroll, at the current viewport width. */
const FIT_PROBLEMS = `(() => {
  const found = [];
  for (const field of document.querySelectorAll('.primitive-field')) {
    if (field.getClientRects().length === 0) continue; // the width's hidden tab-row fallback Select
    const label = field.querySelector('label');
    const control = field.querySelector('input, select, textarea');
    const name = label === null ? '' : label.textContent;
    if (label !== null && !label.classList.contains('sr-only') && label.scrollWidth > label.clientWidth + 1) found.push('label cut off: ' + name);
    if (control !== null) {
      const box = control.getBoundingClientRect();
      if (box.right > window.innerWidth + 1 || box.left < -1) found.push('control off-screen: ' + name);
      if (box.width < 40) found.push('control too narrow (' + box.width + 'px): ' + name);
    }
  }
  if (document.documentElement.scrollWidth > window.innerWidth + 1) found.push('page scrolls sideways');
  return found;
})()`;

// One test per screen and language (#1093: was one per screen, language, theme and width, 48 in all). Each loads the
// screen once per theme: axe resting and focused in both themes, and the fit at 1280 and 390 wide in light, since
// geometry does not depend on the theme. Soft expects, so one failing case does not hide the others.
for (const [name, hash] of SCREENS) {
  for (const locale of LOCALES) {
    test(`${name} in ${locale}: passes axe in light and dark, resting and focused, and fits 1280 and 390px wide`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      for (const theme of THEMES) {
        await page.setViewportSize({ width: 1280, height: 900 });
        await settle(page, hash, locale, theme);
        const resting = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect
          .soft(
            resting.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
            `axe resting, ${theme}`,
          )
          .toEqual([]);

        // A focused control draws its own ring; contrast must hold there too.
        await page.locator('.primitive-field:visible input, .primitive-field:visible select').first().focus();
        const focused = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect
          .soft(
            focused.violations.map((v) => v.id),
            `axe focused, ${theme}`,
          )
          .toEqual([]);

        if (theme !== 'light') continue;
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 900 });
          await expect(page.locator('.primitive-field:visible').first()).toBeVisible();
          expect.soft(await page.evaluate(FIT_PROBLEMS), `fits ${String(width)}px wide`).toEqual([]);
        }
      }
    });
  }
}
