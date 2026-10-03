/**
 * The birth record asks how sure the time is before it asks for the time (#420): date, then how
 * the time is known, then the time — in the visual order and the tab order — and the time field
 * says why it is unavailable while the time is unknown.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { gotoAndSettle, labeledField } from './support.ts';

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

test('the form asks how the time is known before it asks for the time', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('button', { name: 'Add a person', exact: true }).click();

  const date = page.locator('input[type="date"]');
  const accuracy = labeledField(page, /^How the time is known/, 'select');
  const time = page.locator('input[type="time"]');

  // Visual order, top to bottom (date and accuracy may share a row, so compare reading order).
  const [dateBox, accuracyBox, timeBox] = await Promise.all([
    date.boundingBox(),
    accuracy.boundingBox(),
    time.boundingBox(),
  ]);
  if (dateBox === null || accuracyBox === null || timeBox === null) throw new Error('fields not laid out');
  const position = (box: { x: number; y: number }): number => box.y * 10_000 + box.x;
  expect(position(dateBox)).toBeLessThan(position(accuracyBox));
  expect(position(accuracyBox)).toBeLessThan(position(timeBox));

  // While the time is unknown, the field is disabled and says why.
  await expect(accuracy).toHaveValue('unknown');
  await expect(time).toBeDisabled();
  const describedBy = (await time.getAttribute('aria-describedby')) ?? '';
  expect(describedBy).not.toBe('');
  for (const id of describedBy.split(' ')) await expect(page.locator(`[id="${id}"]`)).toBeVisible();
  await expect(page.getByText('The time is not used while it is set to Unknown.')).toBeVisible();

  // Tab order: the date, then the accuracy, then (once it is known) the time.
  await accuracy.selectOption('recorded');
  await expect(time).toBeEnabled();
  // An empty known time is an error, and the field is described by that, not by the unknown-time reason.
  expect(await time.getAttribute('aria-describedby')).toBe('time-error');
  await expect(page.getByText('The time is not used while it is set to Unknown.')).toHaveCount(0);
  await accuracy.focus();
  await page.keyboard.press('Tab');
  await expect(time).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(accuracy).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(date).toBeFocused();

  // Choosing Unknown again disables the field and brings the reason back.
  await accuracy.selectOption('unknown');
  await expect(time).toBeDisabled();
  expect(await time.getAttribute('aria-describedby')).not.toBeNull();

  const results = await new AxeBuilder({ page }).include('main').analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
});
