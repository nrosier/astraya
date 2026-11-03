/**
 * Captures what a page actually renders, for the `ui-ux-spec-review` skill: a full-page screenshot and the box and
 * computed-style metrics of every control and card, per viewport and colour scheme. It measures and reports; the
 * comparison against `docs/ui/UI-UX_GUIDELINES.md` is done by the reviewer.
 *
 * Start the app first (`npm run build && npm run serve`, which serves on port 8080), then run
 * `node scripts/audit-ui.mjs [--url http://localhost:8080/#/people] [--out <dir>] [--selector "<css>"]`.
 *
 * The browser starts with empty storage, so routes that need a stored person show their empty state.
 * Output (outside the repo by default): one PNG and one JSON file per viewport and scheme, plus a summary on stdout.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

/* global document, window -- collectMetrics and the settle check run inside the page. */

// Owner-check sizes (decision 2026-11-03); the phone size emulates touch so touch-only sizing applies.
const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844, touch: true },
  { name: '1280x800', width: 1280, height: 800, touch: false },
  { name: '3440x1440', width: 3440, height: 1440, touch: false },
];
const SCHEMES = ['light', 'dark'];
const DEFAULT_SELECTOR = 'button, a[href], input, select, textarea, [role="tab"], [class*="card"]';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:8080/' },
    out: { type: 'string', default: join(tmpdir(), 'astraya-audit-ui') },
    selector: { type: 'string', default: DEFAULT_SELECTOR },
  },
});

/** Runs in the page: one record per visible element matching `selector`. */
function collectMetrics(selector) {
  return Array.from(document.querySelectorAll(selector))
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id,
        class: typeof el.className === 'string' ? el.className : '',
        text: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
        x: Math.round(rect.x * 10) / 10,
        y: Math.round((rect.y + window.scrollY) * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        padding: style.padding,
        margin: style.margin,
        gap: style.gap,
        borderRadius: style.borderRadius,
        color: style.color,
        backgroundColor: style.backgroundColor,
      };
    });
}

mkdirSync(values.out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const viewport of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        hasTouch: viewport.touch,
        isMobile: viewport.touch,
        colorScheme: scheme,
      });
      try {
        const page = await context.newPage();
        await page.goto(values.url, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.querySelector('[aria-busy="true"]') === null);

        const base = join(values.out, `${viewport.name}-${scheme}`);
        await page.screenshot({ path: `${base}.png`, fullPage: true });
        const elements = await page.evaluate(collectMetrics, values.selector);
        writeFileSync(`${base}.json`, JSON.stringify({ url: values.url, viewport, scheme, elements }, null, 2));

        const smallTargets = viewport.touch
          ? elements.filter((el) => el.tag !== 'div' && (el.width < 44 || el.height < 44)).length
          : 0;
        console.log(
          `${viewport.name} ${scheme}: ${String(elements.length)} elements` +
            (viewport.touch ? `, ${String(smallTargets)} below 44x44` : '') +
            ` -> ${base}.{png,json}`,
        );
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
