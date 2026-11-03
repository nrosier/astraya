/**
 * The horary form on a phone (#782): at 390px wide, in English and in Dutch, the chosen house
 * system's label fits its select, the coordinates are dimmed until a place search fills them, and
 * neither the page nor any input runs past the viewport. Makes no network call: no place is searched.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { gotoAndSettle, setLanguage } from './support.ts';

let dir: string;
let app: FastifyInstance;
let baseUrl: string;

test.use({ viewport: { width: 390, height: 844 } });

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

interface Measure {
  readonly label: string;
  readonly textWidth: number;
  readonly innerWidth: number;
}

interface OverflowReport {
  readonly documentScrollWidth: number;
  readonly elements: readonly {
    readonly tag: string;
    readonly id: string;
    readonly className: string;
    readonly right: number;
    readonly scrollWidth: number;
    readonly clientWidth: number;
    readonly computedWidth: string;
    readonly outerHtml: string;
  }[];
}

/** The selected option's label, and its drawn width against the select's inner width (a select has no useful scrollWidth). */
async function measureHouseSelect(page: Page, selectLabel: string): Promise<Measure> {
  const id = await page.getByLabel(selectLabel, { exact: true }).getAttribute('id');
  // The e2e project has no DOM lib, so the browser-side code is a string, as in the other specs.
  return page.evaluate<Measure>(
    `(() => {
      const select = document.getElementById(${JSON.stringify(id)});
      const style = getComputedStyle(select);
      const context = document.createElement('canvas').getContext('2d');
      context.font = style.font;
      const label = select.selectedOptions[0].text;
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      return { label, textWidth: context.measureText(label).width, innerWidth: select.clientWidth - padding };
    })()`,
  );
}

async function checkForm(page: Page, house: string, coords: readonly string[], expectedLabel: string): Promise<void> {
  const measured = await measureHouseSelect(page, house);
  await test.info().attach('house.json', { body: JSON.stringify(measured), contentType: 'application/json' });
  expect(measured.label).toBe(expectedLabel);
  expect(measured.textWidth).toBeLessThanOrEqual(measured.innerWidth);

  // The coordinates are dimmed (dashed border) until a place search fills them.
  await expect(page.locator('.horary-coords')).toHaveClass(/horary-coords--pending/);
  for (const name of coords)
    await expect(page.getByLabel(name, { exact: true })).toHaveCSS('border-top-style', 'dashed');

  const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth');
  test.info().annotations.push({ type: 'overflow', description: String(overflow) });

  // Diagnostic only: which elements extend past the viewport, and the sizing of the card and grid parents.
  const offenders = await page.evaluate<OverflowReport>(
    `(() => {
      const vw = window.innerWidth;
      const elements = Array.from(document.querySelectorAll('body *'))
        .map((el) => ({ el, right: el.getBoundingClientRect().right }))
        .filter(({ right }) => right > vw)
        .map(({ el, right }) => ({
          tag: el.tagName.toLowerCase(),
          id: el.id,
          className: typeof el.className === 'string' ? el.className : '',
          right: Math.round(right),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          computedWidth: getComputedStyle(el).width,
          outerHtml: el.outerHTML.slice(0, 200),
        }));
      return { documentScrollWidth: document.documentElement.scrollWidth, elements };
    })()`,
  );
  await test.info().attach('overflow-document.json', {
    body: JSON.stringify(offenders.documentScrollWidth),
    contentType: 'application/json',
  });
  await test.info().attach('overflow-elements.json', {
    body: JSON.stringify(offenders.elements.slice(0, 30), null, 2),
    contentType: 'application/json',
  });
  const sizing = await page.evaluate<string>(
    `(() => {
      const select = document.getElementById(${JSON.stringify(await page.getByLabel(house, { exact: true }).getAttribute('id'))});
      const coords = document.querySelector('.horary-coords');
      const pick = (el) => {
        if (el === null) return null;
        const s = getComputedStyle(el);
        return { tag: el.tagName.toLowerCase(), cls: String(el.className), minWidth: s.minWidth, width: s.width, flexShrink: s.flexShrink };
      };
      const chain = (start) => {
        const out = [];
        let el = start;
        for (let i = 0; i < 3 && el !== null; i++) { out.push(pick(el)); el = el.parentElement; }
        return out;
      };
      return JSON.stringify({ house: chain(select), coords: chain(coords) });
    })()`,
  );
  await test.info().attach('sizing.json', { body: sizing, contentType: 'application/json' });
  expect(overflow).toBeLessThanOrEqual(0);

  const viewportWidth = await page.evaluate<number>('window.innerWidth');
  const inputs = await page.locator('input:visible').all();
  expect(inputs.length).toBeGreaterThan(0);
  const rights: number[] = [];
  for (const input of inputs) {
    const box = await input.boundingBox();
    if (box === null) throw new Error('visible input has no box');
    rights.push(box.x + box.width);
  }
  test.info().annotations.push({ type: 'input-rights', description: JSON.stringify(rights) });
  for (const right of rights) expect(right).toBeLessThanOrEqual(viewportWidth);
}

test('the horary form fits a 390px phone in English and in Dutch', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/explore/horary`);
  await expect(page.getByLabel('House system', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Latitude', { exact: true })).toBeVisible();
  await checkForm(page, 'House system', ['Latitude', 'Longitude'], 'Regiomontanus (the horary tradition’s)');

  await setLanguage(page, 'NL');
  await expect(page.getByLabel('Huizensysteem', { exact: true })).toBeVisible();
  await checkForm(
    page,
    'Huizensysteem',
    ['Breedtegraad', 'Lengtegraad'],
    'Regiomontanus (dat van de horaire traditie)',
  );
});
