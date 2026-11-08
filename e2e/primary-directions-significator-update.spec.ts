/**
 * Regression e2e for #1302: changing a significator on Primary Directions must visibly re-emphasize
 * the bi-wheel (Bug 1 — the chart never reflected which significators were chosen) and must never let
 * the result region show an extra, stale "ready" frame while recomputing (Bug 2 — the table popped up
 * then disappeared behind the chart for one commit, because the directed-chart effect ran one render
 * behind the significators-keyed load effect). Runs against the real built app, the real ephemeris
 * engine and a shared test person — not a fixture or a unit-level mock.
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

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

// A fresh context per test, holding the shared people (#799); this test only reads Einstein's record.
test.beforeEach(async ({ browser }) => {
  context = await newSeededContext(browser, baseUrl);
  page = await context.newPage();
});

test.afterEach(async () => {
  await context.close();
});

/** The directed-ring (ring 1) glyph for one body, as drawn by `renderMultiWheelSvg` / `glyph-layout.ts`. */
function directedGlyph(targetPage: Page, bodyKey: string) {
  return targetPage.locator(`g.chart-point[data-ring="1"][data-body="${bodyKey}"]`);
}

test('changing a significator dims/undims the bi-wheel, and the result region never shows a second, stale show/hide cycle', async () => {
  test.setTimeout(60_000);

  await openSharedPerson(page, baseUrl, EINSTEIN);
  await page.getByRole('link', { name: 'Progressions & Directions', exact: true }).click();
  await page.getByRole('tab', { name: 'Primary Directions (Placidus)', exact: true }).click();

  const stack = page.locator('.timing-stack');
  await expect(stack.locator('.chart-wheel')).toBeVisible();
  await expect(stack.locator('tbody tr').first()).toBeVisible();

  // Bug 1 baseline: Sun is one of the four default significators, so its directed-ring glyph starts
  // at full strength (not dimmed).
  const sun = directedGlyph(page, 'sun');
  await expect(sun).not.toHaveClass(/chart-point-muted/);

  // Record every DOM mutation's "is this a complete, settled frame" state in the real browser, from
  // just before the change until well after it resettles, so a transient stale-wheel-plus-new-table
  // commit (the reported flash) cannot hide behind a coarser poll. This mirrors the commit-by-commit
  // check `test/ui-primary-directions-stale-wheel.test.tsx` makes with a React Profiler, but against
  // the actual shipped app in a real browser rather than a jsdom render.
  // A string script, not a TS closure: the e2e tsconfig has no DOM types (see `shared-people.ts`'s
  // `pinE2eFont`), so this body cannot name `document`/`MutationObserver` as typed TypeScript.
  await page.evaluate(`(() => {
    const el = document.querySelector('.timing-stack');
    if (el === null) throw new Error('no .timing-stack to observe');
    window.__pdSamples = [];
    const sample = () => {
      const busy = el.getAttribute('aria-busy') === 'true';
      const wheel = el.querySelector('.chart-wheel') !== null;
      const rows = el.querySelectorAll('tbody tr').length;
      window.__pdSamples.push(!busy && wheel && rows > 0);
    };
    sample();
    const observer = new MutationObserver(sample);
    observer.observe(el, { childList: true, subtree: true, attributes: true });
    window.__pdObserver = observer;
  })()`);

  const significators = page.getByRole('group', { name: 'Significators' });
  await significators.getByLabel('Sun', { exact: true }).uncheck();

  // Settle: unchecked, the directed-ring Sun glyph is dimmed, and the table (now computed without
  // Sun as a significator) is visible again.
  await expect(significators.getByLabel('Sun', { exact: true })).not.toBeChecked();
  await expect(sun).toHaveClass(/chart-point-muted/);
  await expect(stack.locator('tbody tr').first()).toBeVisible();

  const samples = await page.evaluate<boolean[]>(`(() => {
    window.__pdObserver.disconnect();
    return window.__pdSamples;
  })()`);

  // Collapse consecutive duplicates, then count how many times the signal rises from "not settled" to
  // "settled". One rise — the recompute's own loading-to-done transition — is correct; a second rise is
  // the reported flash: a stale wheel showing together with the already-updated table for one commit,
  // then both hidden again before the real, up-to-date frame appears.
  const changes = samples.filter((value, index) => index === 0 || value !== samples[index - 1]);
  const rises = changes.filter((value, index) => index > 0 && value && !changes[index - 1]).length;
  expect(rises).toBe(1);
});
