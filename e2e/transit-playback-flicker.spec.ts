/**
 * Playback on the Transits screen does not flicker (#1440): over a short playback the wheel's svg, the slider and the
 * contacts table are not replaced (a replaced node is what the eye sees as a flicker), the URL is written only when
 * playback pauses, and dragging the slider pauses playback and leaves it where it was put.
 *
 * The counts come from a MutationObserver (removed elements per region), wrappers around `history.replaceState` and
 * `pushState`, and a minimal React DevTools hook that counts commits, all installed before the app loads. The same
 * probe measured the before and after numbers recorded on the issue; set E2E_PLAYBACK_REPORT=1 to print them.
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

test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  // A string script: the e2e tsconfig has no DOM types. It counts, from before the app loads, what a flicker is made of.
  await context.addInitScript(`(() => {
    const probe = { commits: 0, urlWrites: 0, removed: { wheel: 0, slider: 0, table: 0 } };
    window.__playbackProbe = probe;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, isDisabled: false, renderers: new Map(),
      inject() { return 1; }, checkDCE() {}, onScheduleFiberRoot() {}, onCommitFiberUnmount() {},
      onCommitFiberRoot() { probe.commits += 1; },
    };
    for (const name of ['replaceState', 'pushState']) {
      const original = history[name].bind(history);
      history[name] = (...args) => { probe.urlWrites += 1; return original(...args); };
    }
    const regions = { wheel: '.chart-wheel', slider: '.date-animation-scrub', table: '.data-table' };
    // The parts that must never be replaced: the wheel's svg and everything in it that is not a transiting glyph, an
    // aspect line or a ring legend, the slider input, and the table with its head and body.
    const MOVING = '[data-ring="1"], [data-aspect-body-a], [data-ring-legend], [data-ring-legend-arrow]';
    probe.tagStatic = () => {
      probe.staticNodes = [
        ...[...document.querySelectorAll('.chart-wheel svg, .chart-wheel svg *')].filter((el) => !el.closest(MOVING)),
        ...document.querySelectorAll('.date-animation-scrub input, .data-table table, .data-table thead, .data-table tbody'),
      ];
    };
    probe.replacedStatic = () => probe.staticNodes.filter((el) => !el.isConnected).length;
    probe.observe = () => new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        for (const node of record.removedNodes) {
          if (!(node instanceof Element)) continue;
          for (const [where, selector] of Object.entries(regions)) {
            // A node removed inside a region, or a removed subtree that holds the region (a remount from above).
            if (target && target.closest(selector)) probe.removed[where] += 1 + node.querySelectorAll('*').length;
            else {
              const inside = node.matches(selector) ? [node] : [...node.querySelectorAll(selector)];
              for (const hit of inside) probe.removed[where] += 1 + hit.querySelectorAll('*').length;
            }
          }
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  })();`);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

interface Counts {
  /** Static nodes (see the probe) that are no longer in the document. */
  readonly replacedStatic: number;
  readonly commits: number;
  readonly urlWrites: number;
  readonly removed: { readonly wheel: number; readonly slider: number; readonly table: number };
}

async function openTransits(): Promise<void> {
  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Transits & Forecast', exact: true }).click();
  await page.getByRole('tab', { name: 'Transits', exact: true }).click();
  await expect(page.locator('div.chart-wheel svg')).toBeVisible();
  await expect(page.locator('.data-table')).toBeVisible();
}

async function readCounts(): Promise<Counts> {
  return page.evaluate<Counts>(
    '(() => { const p = window.__playbackProbe; return JSON.parse(JSON.stringify({ commits: p.commits, urlWrites: p.urlWrites, removed: p.removed, replacedStatic: p.staticNodes ? p.replacedStatic() : 0 })); })()',
  );
}

/** Plays at `speed` for `ms`, then pauses, and returns what the probe counted while playing and after the pause. */
async function playFor(speed: string, ms: number): Promise<{ playing: Counts; afterPause: Counts }> {
  await page.getByRole('combobox', { name: 'Playback speed' }).selectOption(speed);
  await page.evaluate('window.__playbackProbe.observe(); window.__playbackProbe.tagStatic()');
  const start = await readCounts();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(ms);
  const playing = await readCounts();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForTimeout(800);
  const afterPause = await readCounts();
  const delta = (a: Counts, b: Counts): Counts => ({
    replacedStatic: b.replacedStatic,
    commits: b.commits - a.commits,
    urlWrites: b.urlWrites - a.urlWrites,
    removed: {
      wheel: b.removed.wheel - a.removed.wheel,
      slider: b.removed.slider - a.removed.slider,
      table: b.removed.table - a.removed.table,
    },
  });
  if (process.env.E2E_PLAYBACK_REPORT === '1') {
    console.log(
      `PLAYBACK ${speed}x ${String(ms)}ms playing=${JSON.stringify(delta(start, playing))} afterPause=${JSON.stringify(delta(playing, afterPause))}`,
    );
  }
  return { playing: delta(start, playing), afterPause: delta(playing, afterPause) };
}

for (const [speed, ms] of [
  ['1', 5000],
  ['10', 3000],
] as const) {
  test(`at ${speed}x the wheel, slider and tables are not replaced, and the URL is written only on pause (#1440)`, async () => {
    test.setTimeout(90_000);
    await openTransits();
    const before = await page.getByLabel('As of', { exact: true }).first().inputValue();

    const { playing, afterPause } = await playFor(speed, ms);

    expect(await page.getByLabel('As of', { exact: true }).first().inputValue()).not.toBe(before);
    // The static parts keep their nodes; only a contact entering or leaving orb adds or removes a line or a row.
    expect(playing.replacedStatic, 'static wheel, slider and table nodes replaced while playing').toBe(0);
    expect(afterPause.replacedStatic, 'static nodes replaced by the pause').toBe(0);
    expect(playing.removed.slider, 'slider nodes replaced while playing').toBe(0);
    expect(playing.urlWrites, 'URL writes while playing').toBe(0);
    expect(afterPause.urlWrites, 'URL writes after pause').toBe(1);
  });
}

test('the paused date is in the URL, and a reload reopens the same view (#1440)', async () => {
  test.setTimeout(90_000);
  await openTransits();
  await playFor('10', 2000);
  const paused = await page.getByLabel('As of', { exact: true }).first().inputValue();
  expect(page.url()).toContain(`date=${paused}`);
  await page.reload();
  await expect(page.locator('div.chart-wheel svg')).toBeVisible();
  expect(await page.getByLabel('As of', { exact: true }).first().inputValue()).toBe(paused);
});

test('dragging the slider during playback pauses it and the slider stays where it was put (#1440)', async () => {
  test.setTimeout(90_000);
  await openTransits();
  await page.getByRole('combobox', { name: 'Playback speed' }).selectOption('10');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(500);

  const slider = page.getByRole('slider');
  const box = await slider.boundingBox();
  if (box === null) throw new Error('slider has no box');
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();

  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const putAt = await slider.inputValue();
  const date = await page.getByLabel('As of', { exact: true }).first().inputValue();
  await page.waitForTimeout(1200);
  expect(await slider.inputValue()).toBe(putAt);
  expect(await page.getByLabel('As of', { exact: true }).first().inputValue()).toBe(date);
});
