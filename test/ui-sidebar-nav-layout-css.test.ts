/**
 * #1696 — on the rail (64rem and up) the palette trigger sits on its own row above the nav, and the
 * nav takes the full sidebar width, so its labels are not squeezed into the 78px left beside the
 * trigger. Token-only CSS rules in app.css.
 */
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

it('stacks the palette trigger on its own row above a full-width nav in the rail (#1696)', () => {
  const wrap = /\n {2}\.app-nav-wrap \{\n {4}flex: 1 1 auto;([^}]*)\}/.exec(css);
  const nav = /\n {2}\.app-nav \{\n {4}flex-direction: column;([^}]*)\}/.exec(css);
  expect(wrap?.[1]).toContain('flex-direction: column;');
  expect(nav?.[1]).toContain('width: 100%;');
  expect(nav?.[1]).toContain('min-width: 0;');
});
