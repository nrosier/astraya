/**
 * The Timing Timeline (#554, #1237): a Gantt chart with one labelled row per technique over one shared date axis, the same
 * events in a searchable table, and a technique filter beside it; the header holds the centre date, the 5Y/10Y range, Now
 * and Export. The chart is a picture of the table, so the two are checked against each other.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';

let dir: string;
let app: FastifyInstance;
let baseUrl: string;
let context: BrowserContext;
let page: Page;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-e2e-'));
  process.env.LOG_LEVEL = 'silent';
  app = await build({ dbPath: join(dir, 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

// A fresh context per test, holding the shared people (#799); no test here saves, edits or deletes one.
test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

async function openTimeline(): Promise<void> {
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('tab', { name: 'Timing timeline', exact: true }).click();
  await expect(page.locator('.gantt')).toBeVisible({ timeout: 60_000 });
}

test('shows every technique as a row of the chart, with the centre date marked, and the same events in the table', async () => {
  test.setTimeout(90_000);
  await openTimeline();

  await expect(page.locator('.gantt-row')).toHaveCount(8);
  await expect(page.locator('.gantt-target')).toHaveCount(8);
  await expect(page.getByRole('img', { name: /^Firdaria: \d+ events?$/ })).toBeVisible();
  const table = page.getByRole('table', { name: 'Timing events' });
  await expect(table).toBeVisible();
  // The chart and the table read the same events: every bar and tick is a table row.
  const marks = await page.locator('.gantt-bar, .gantt-point').count();
  await expect(table.locator('tbody tr')).toHaveCount(marks);
});

test('cards on the timing pages are one default gap apart, whatever sits between them (#1236, #1237)', async () => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTimeline();

  // The measure is the page's own spacing token, so no number is written here.
  const gap = await page.evaluate<number>(`(() => {
    const unit = document.createElement('div');
    unit.style.height = 'var(--space-4)';
    document.body.append(unit);
    const px = unit.getBoundingClientRect().height;
    unit.remove();
    return px;
  })()`);
  // Cards in one column, one above the other: the space from one's bottom to the next's top.
  const between = async (): Promise<readonly number[]> =>
    page.evaluate<readonly number[]>(`(() => {
      const cards = [...document.querySelectorAll('.timing-card')].map((card) => card.getBoundingClientRect());
      return cards.flatMap((card, index) => {
        const next = cards[index + 1];
        return next !== undefined && Math.abs(next.left - card.left) < 1 && next.top >= card.bottom
          ? [Math.round((next.top - card.bottom) * 10) / 10]
          : [];
      });
    })()`);

  // The Gantt card, then the events card: the same gap as between any two cards.
  const timeline = await between();
  expect(timeline.length).toBeGreaterThan(0);
  for (const space of timeline) expect(space).toBeCloseTo(gap, 0);

  await page.getByRole('tab', { name: 'Profections', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Profection/ }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.profection-meanings')).toBeVisible({ timeout: 60_000 });
  const profections = await between();
  expect(profections.length).toBeGreaterThan(0);
  for (const space of profections) expect(space).toBeCloseTo(gap, 0);
});

test('the bodies filter keeps events without a body and splits the rest between major planets and asteroids (#1260)', async () => {
  test.setTimeout(120_000);
  await openTimeline();

  // Events per technique, read from the chart rows' own labels ("Firdaria: 3 events").
  const counts = async (): Promise<Map<string, number>> => {
    const labels = await page.getByRole('img', { name: /: \d+ events?$/ }).all();
    const names = await Promise.all(labels.map(async (label) => (await label.getAttribute('aria-label')) ?? ''));
    return new Map(
      names.flatMap((name) => {
        const match = /^(.*): (\d+) events?$/.exec(name);
        return match?.[1] === undefined || match[2] === undefined ? [] : [[match[1], Number(match[2])] as const];
      }),
    );
  };
  const choose = async (name: string): Promise<void> => {
    await page.getByRole('radiogroup', { name: 'Bodies' }).getByText(name, { exact: true }).click();
  };

  const all = await counts();
  await choose('Major planets');
  const major = await counts();
  await choose('Asteroids and Lilith');
  const minor = await counts();

  expect(all.size).toBeGreaterThan(0);
  for (const [track, total] of all) {
    const inMajor = major.get(track) ?? 0;
    const inMinor = minor.get(track) ?? 0;
    if (['Zodiacal releasing', 'Firdaria', 'Profections'].includes(track)) {
      // These name no body, so no filter takes them out.
      expect(inMajor).toBe(total);
      expect(inMinor).toBe(total);
    } else {
      // Every other event names bodies and falls on exactly one side.
      expect(inMajor + inMinor).toBe(total);
    }
  }

  await choose('All');
  expect(await counts()).toEqual(all);
});

test('searches the events, and the technique filter takes a technique out of the chart and the table', async () => {
  test.setTimeout(90_000);
  await openTimeline();
  const table = page.getByRole('table', { name: 'Timing events' });
  const all = await table.locator('tbody tr').count();

  await page.getByLabel('Search the events').fill('Firdaria');
  const found = await table.locator('tbody tr').count();
  expect(found).toBeGreaterThan(0);
  expect(found).toBeLessThan(all);
  await page.getByLabel('Search the events').fill('no such event anywhere');
  await expect(page.getByText('No event matches that search.')).toBeVisible();
  await page.getByLabel('Search the events').fill('');

  await page.getByRole('group', { name: 'Techniques shown' }).getByLabel('Firdaria').uncheck();
  await expect(page.locator('.gantt-row')).toHaveCount(7);
  await expect(page.getByRole('img', { name: /^Firdaria/ })).toHaveCount(0);
  // The search found exactly the firdaria rows, so the table now holds the others.
  await expect(table.locator('tbody tr')).toHaveCount(all - found);
});

test('the 10Y range widens the axis, and Now returns the centre date to today', async () => {
  test.setTimeout(90_000);
  await openTimeline();
  const axis = page.locator('.gantt');
  const label5 = await axis.getAttribute('aria-label');

  await page.getByRole('radiogroup', { name: 'Range', exact: true }).getByLabel('10Y').check();
  await expect.poll(async () => axis.getAttribute('aria-label')).not.toBe(label5);

  await page.getByLabel('Centre date').fill('2000-01-01');
  await expect(page.locator('.gantt')).toBeVisible();
  await page.getByRole('button', { name: 'Now', exact: true }).click();
  await expect(page.getByLabel('Centre date')).not.toHaveValue('2000-01-01');
});
