/**
 * Target sizes (#1073, guidelines §6, WCAG 2.5.8): on a touch phone (390×844, coarse pointer) every control on the
 * screens a person uses is at least 44×44 CSS px, and on a desktop pointer (1280×800) at least 24×24. A control that
 * shrinks back below its target fails here by name and page.
 *
 * Exempt, as WCAG 2.5.8 allows and the CSS block "Target sizes (#1073)" in `src/ui/app.css` documents:
 * - a link or glossary term inside a sentence or heading (the inline exception);
 * - a glossary term inside a checkbox or radio label, whose whole option row is the target;
 * - native checkbox and radio inputs, measured through their label row instead;
 * - the aspect matrix cells, a visualisation whose every cell has a full-size "Show" equivalent in the Aspects list.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { EINSTEIN, newSeededContext, openSharedPerson } from './shared-people.ts';
import { gotoAndSettle } from './support.ts';

const PERSON_ROUTES = [
  'overview',
  'birth-record',
  'charts/natal/wheel',
  'charts/natal/aspects',
  'charts/natal/placements',
  'charts/natal/patterns',
  'consultation',
  'interpretation',
  'timing/transits',
  'timing/forecast',
  'timing/primary-directions',
];
const GLOBAL_ROUTES = ['people', 'explore/horary', 'explore/eclipses', 'documents/pdf', 'preferences', 'about'];

const POINTERS = [
  { name: 'touch', min: 44, options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  { name: 'desktop', min: 24, options: { viewport: { width: 1280, height: 800 } } },
] as const;

interface Offender {
  readonly what: string;
  readonly width: number;
  readonly height: number;
}

/** Runs in the page (a string: the e2e tsconfig has no DOM types). Returns every visible control below `min`. */
const MEASURE = (min: number): string => `(() => {
  const min = ${String(min)};
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const inline = (el) => {
    const isLink = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
    const isTerm = el.classList.contains('primitive-tooltip-trigger') && !el.closest('.primitive-tooltip-icon, .birth-record-status');
    if (!isLink && !isTerm) return false;
    if (isTerm && el.closest('.primitive-choice')) return true;
    const block = el.closest('p, li, h1, h2, h3, h4, h5, label, legend, figcaption, caption, dd, dt, td');
    if (block === null) return false;
    return /^H[1-5]$/.test(block.tagName) || (block.textContent || '').trim().length > (el.textContent || '').trim().length + 3;
  };
  const out = [];
  for (const el of document.querySelectorAll('button, a[href], input, select, textarea, summary, [role="tab"]')) {
    if (!visible(el) || el.closest('[inert], [aria-hidden="true"]')) continue;
    if (el.matches('input[type="hidden"], .mgrid-pair') || inline(el)) continue;
    let target = el;
    if (el.matches('input[type="checkbox"], input[type="radio"]')) target = el.closest('label') || el;
    const r = target.getBoundingClientRect();
    if (r.width + 0.5 >= min && r.height + 0.5 >= min) continue;
    const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('name') || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
    const cls = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '';
    out.push({ what: el.tagName.toLowerCase() + (cls ? '.' + cls : '') + ' "' + name + '"', width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10 });
  }
  return out;
})()`;

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

for (const pointer of POINTERS) {
  test(`every control meets the ${String(pointer.min)}px target on a ${pointer.name} pointer (#1073)`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const context = await newSeededContext(browser, baseUrl, pointer.options);
    const page = await context.newPage();
    try {
      await openSharedPerson(page, baseUrl, EINSTEIN);
      await page.waitForURL(/#\/people\/[^/]+\//);
      const personId = /#\/people\/([^/]+)\//.exec(page.url())?.[1] ?? '';
      const routes = [...GLOBAL_ROUTES, ...PERSON_ROUTES.map((route) => `people/${personId}/${route}`)];

      const offenders: string[] = [];
      for (const route of routes) {
        await gotoAndSettle(page, `${baseUrl}/#/${route}`);
        await page.waitForFunction('document.querySelector(\'[aria-busy="true"]\') === null');
        const found = await page.evaluate<Offender[]>(MEASURE(pointer.min));
        const where = route.replace(personId, ':id');
        for (const o of found) offenders.push(`${where}: ${o.what} ${String(o.width)}x${String(o.height)}`);
      }
      expect(offenders).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
