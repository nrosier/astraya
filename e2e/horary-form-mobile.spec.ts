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
import { gotoAndSettle } from './support.ts';

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
  test.info().annotations.push({ type: 'house', description: JSON.stringify(measured) });
  expect(measured.label).toBe(expectedLabel);
  expect(measured.textWidth).toBeLessThanOrEqual(measured.innerWidth);

  // The coordinates are dimmed (dashed border) until a place search fills them.
  await expect(page.locator('.horary-coords')).toHaveClass(/horary-coords--pending/);
  for (const name of coords)
    await expect(page.getByLabel(name, { exact: true })).toHaveCSS('border-top-style', 'dashed');

  const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth');
  test.info().annotations.push({ type: 'overflow', description: String(overflow) });
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

  await page.locator('.language-toggle').click();
  await expect(page.getByLabel('Huizensysteem', { exact: true })).toBeVisible();
  await checkForm(
    page,
    'Huizensysteem',
    ['Breedtegraad', 'Lengtegraad'],
    'Regiomontanus (dat van de horaire traditie)',
  );
});
