/**
 * #1696 — the rail's person switcher may shrink so its label truncates (`min-width: 0`), and the rail
 * keeps its own padding token (`--space-4`) so the label and nav items stay inside the 16rem rail,
 * clear of the `«` collapse control. Token-only CSS rules in app.css.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

describe('sidebar overlap CSS (#1696)', () => {
  it('lets the rail person switcher shrink so its label truncates', () => {
    const rule = /\n {2}\.app-nav-person \{\n {4}max-width: none;\n {4}min-width: 0;\n([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule?.[0]).toContain('min-width: 0;');
  });

  it('keeps the rail padding on the --space-4 token', () => {
    const rail = css.indexOf('@media (min-width: 64rem)');
    const block = css.slice(rail);
    const match = /\.app-header,\s*\.app-header-with-person \{\s*position: sticky;[^}]*\}/.exec(block);
    expect(match).not.toBeNull();
    expect(match?.[0]).toContain('padding: var(--space-4);');
    expect(match?.[0]).toContain('width: 16rem;');
  });
});
