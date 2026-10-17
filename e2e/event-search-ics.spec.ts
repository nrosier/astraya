/**
 * Event search downloads an iCalendar file (#639): real server, real ephemeris, the file read back from disk
 * and checked for the structure RFC 5545 requires.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { gotoAndSettle, openTool } from './support.ts';

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

test('the event search downloads its results as a valid .ics file', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await openTool(page, 'Ephemeris research');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // March 2024: it holds the 25 March full Moon, and Mercury stationed retrograde on 1 April.
  await page.getByLabel('From', { exact: true }).fill('2024-03-01');
  await page.getByLabel('To', { exact: true }).fill('2024-04-30');
  await page.getByRole('button', { name: 'Search events', exact: true }).click();
  await expect(page.getByText(/events found/)).toBeVisible({ timeout: 90_000 });

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download calendar (.ics)', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^astraya-event-search-\d{4}-\d{2}-\d{2}\.ics$/);
  const text = readFileSync(await download.path(), 'utf8');

  // RFC 5545: CRLF line ends, folded at 75 octets, a VCALENDAR with VERSION and PRODID.
  expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:')).toBe(true);
  expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
  expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  for (const line of text.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);

  // The 25 March 2024 full Moon is in the file, as a UTC instant, with a UID, a stamp and no end time.
  const events = text.split('BEGIN:VEVENT\r\n').slice(1);
  // The default filters find these 8 events in March and April 2024; the file has one VEVENT for each.
  expect(events).toHaveLength(8);
  for (const event of events) {
    expect(event).toMatch(/^UID:[0-9a-f]{16}@astraya\r\n/);
    expect(event).toMatch(/\r\nDTSTAMP:\d{8}T\d{6}Z\r\n/);
    expect(event).toMatch(/\r\nDTSTART:\d{8}T\d{6}Z\r\n/);
    expect(event).not.toContain('DTEND');
  }
  const startOf = (summary: string): string | undefined =>
    events.find((event) => event.includes(`SUMMARY:${summary}\r\n`))?.match(/DTSTART:(\d{8}T\d{6}Z)/)?.[1];
  // Instants known from the ephemeris (also in the page's own results table), to the minute.
  expect(startOf('Full Moon')).toMatch(/^20240325T0700\d\dZ$/);
  expect(startOf('New Moon')).toMatch(/^20240310T0900\d\dZ$/);
  expect(startOf('mercury turns retrograde')).toMatch(/^20240401T2214\d\dZ$/);
  expect(new Set(events.map((event) => event.split('\r\n')[0])).size).toBe(events.length);
});
