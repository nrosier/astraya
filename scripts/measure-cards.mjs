#!/usr/bin/env node
/**
 * Card measurement for the owner visual review (docs/ops/VISUAL-REVIEW.md, "Cards share one surface, border, radius,
 * padding and title size"). `measureCards(page)` reads the computed style of every card and of every disclosure inside
 * one; e2e/visual-review.spec.ts calls it beside each screenshot and writes `<slug>__<w>__<theme>.cards.json`.
 * `node scripts/measure-cards.mjs <dir>` prints those files as one JSON line per card or disclosure:
 * slug, width, theme, kind, cls, radius, padding, title size and weight, border, background, nested flag.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CARD_SELECTOR =
  '.birth-record-card, .consultation-section, .consultation-glance, .relationship-summary, .flat-card, .selection-inspector, .preferences-card, dialog.settings-card';

/** Runs in the page: one record per visible card and per disclosure inside a card. */
export async function measureCards(page) {
  return page.evaluate((selector) => {
    const names = [
      'birth-record-card',
      'consultation-section',
      'consultation-glance',
      'relationship-summary',
      'flat-card',
      'selection-inspector',
      'preferences-card',
      'settings-card',
    ];
    const box = (el) => {
      const cs = getComputedStyle(el);
      return {
        radius: cs.borderTopLeftRadius,
        padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft],
        border: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth],
        background: cs.backgroundColor,
      };
    };
    const out = [];
    for (const el of document.querySelectorAll(selector)) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const name = names.find((c) => el.classList.contains(c));
      const cls = (el.tagName === 'DIALOG' ? 'dialog.' : '.') + String(name);
      const title = [...el.querySelectorAll('h2, h3, .selection-inspector-title, .preferences-card-title')].find(
        (t) =>
          t.closest(selector) === el &&
          t.closest('.primitive-disclosure') === null &&
          t.getBoundingClientRect().width > 1,
      );
      const tcs = title === undefined ? null : getComputedStyle(title);
      out.push({
        kind: 'card',
        cls,
        ...box(el),
        titleSize: tcs === null ? null : tcs.fontSize,
        titleWeight: tcs === null ? null : tcs.fontWeight,
        nested: el.parentElement !== null && el.parentElement.closest(selector) !== null,
      });
      for (const d of el.querySelectorAll('.primitive-disclosure')) {
        if (d.closest(selector) !== el) continue;
        out.push({
          kind: 'disclosure',
          cls: `${cls} .primitive-disclosure`,
          ...box(d),
          titleSize: null,
          titleWeight: null,
          nested: true,
        });
      }
    }
    return out;
  }, CARD_SELECTOR);
}

function main(dir) {
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.cards.json'))
    .sort()) {
    const [slug, width, theme] = file.replace('.cards.json', '').split('__');
    for (const record of JSON.parse(readFileSync(join(dir, file), 'utf8'))) {
      console.log(JSON.stringify({ slug, width: Number(width), theme, ...record }));
    }
  }
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const dir = process.argv[2];
  if (dir === undefined) {
    console.error('Usage: node scripts/measure-cards.mjs <visual-review dir>');
    process.exit(1);
  }
  main(dir);
}
