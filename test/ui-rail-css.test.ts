/**
 * #1747 — the icon rail's CSS. The collapsed rules live only under `min-width: 64rem` (below it the Menu
 * panel is unchanged and the collapsed preference is ignored), use design tokens only, and the old
 * floating `.workspace-rail-toggle` is gone. Reads the stylesheet as text, so no DOM is needed.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

/** The text of the `@media (min-width: 64rem)` block that holds the rail, by brace matching. */
function railMediaBlock(source: string): { start: number; end: number; text: string } {
  const start = source.indexOf('@media (min-width: 64rem) {\n  .workspace-shell {');
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return { start, end: i + 1, text: source.slice(start, i + 1) };
  }
  throw new Error('unbalanced rail media block');
}

describe('icon rail CSS (#1747)', () => {
  it('has no .workspace-rail-toggle rule left', () => {
    expect(css).not.toContain('workspace-rail-toggle');
  });

  it('puts every collapsed-rail rule inside the min-width: 64rem block', () => {
    const block = railMediaBlock(css);
    const outside = css.slice(0, block.start) + css.slice(block.end);
    expect(block.text).toContain('.workspace-shell-collapsed');
    expect(outside).not.toContain('.workspace-shell-collapsed');
  });

  it('no longer collapses the rail to width: 0', () => {
    const collapsed = /\.workspace-shell-collapsed \.app-header,[^{]*\{([^}]*)\}/.exec(css);
    expect(collapsed?.[1]).toBeDefined();
    expect(collapsed?.[1]).not.toMatch(/width:\s*0\b/);
    expect(collapsed?.[1]).toContain('overflow: visible;');
  });

  it('sizes the collapsed rail from a 36px target plus --space-3 padding', () => {
    expect(css).toContain('--rail-target-size: 36px;');
    expect(css).toContain('--rail-icon-size: 18px;');
    expect(css).toContain('calc(var(--rail-target-size) + 2 * var(--space-3) + 1px)');
  });

  it('draws the collapsed targets as circles and the active pill from tokens', () => {
    const block = railMediaBlock(css).text;
    expect(block).toMatch(
      /\.workspace-shell-collapsed \.rail-nav-item \.app-nav-item \{[^}]*border-radius: var\(--radius-full\);/,
    );
    expect(block).toMatch(/\.app-nav-item\.active \{[^}]*background: var\(--surface-hover\);/);
  });

  it('shows the tooltip on hover and focus-visible, not on disabled buttons', () => {
    const block = railMediaBlock(css).text;
    expect(block).toContain(':has(button:disabled)');
    expect(block).toContain(':hover');
    expect(block).toContain(':has(:focus-visible)');
  });

  it('keeps the footer button states and hides it below 64rem', () => {
    const block = railMediaBlock(css).text;
    const base = /button\.rail-collapse-button \{([^}]*)\}/.exec(block)?.[1] ?? '';
    expect(base).toContain('background: transparent;');
    expect(base).toContain('border: 1px solid var(--line);');
    expect(base).toContain('color: var(--muted);');
    expect(block).toMatch(/button\.rail-collapse-button:focus-visible \{[^}]*outline: 2px solid/);
    expect(css).toMatch(/\n\.rail-nav-tooltip,\n\.rail-collapse-button \{\n {2}display: none;/);
  });

  it('uses design tokens only: no raw colour values in the rail rules', () => {
    const rules = [
      railMediaBlock(css).text,
      css.slice(css.indexOf('.rail-nav-tooltip,'), css.indexOf('@media (min-width: 64rem) {\n  .workspace-shell {')),
    ];
    for (const raw of rules) {
      const rules_ = raw.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(rules_).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(rules_).not.toMatch(/\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\(/);
    }
  });
});
