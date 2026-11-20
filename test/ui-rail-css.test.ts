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

describe('icon rail CSS (#1747, #1851)', () => {
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

  it('opens the expanded toggle tooltip below the button, on hover and focus-visible, not after Escape (#1851)', () => {
    const block = railMediaBlock(css).text;
    const rule =
      /\.workspace-shell:not\(\.workspace-shell-collapsed\)\s+\.rail-collapse-item:not\(\[data-tooltip-dismissed\]\):is\(:hover, :has\(:focus-visible\)\)\s+\.rail-nav-tooltip \{([^}]*)\}/.exec(
        block,
      )?.[1];
    expect(rule).toBeDefined();
    expect(rule).toContain('top: calc(100% + var(--space-2));');
    expect(rule).toContain('right: 0;');
    expect(rule).toContain('display: block;');
  });

  it('keeps the toggle states and hides it below 64rem', () => {
    const block = railMediaBlock(css).text;
    const base = /button\.rail-collapse-button \{([^}]*)\}/.exec(block)?.[1] ?? '';
    expect(base).toContain('background: transparent;');
    expect(base).toContain('border: 1px solid var(--line);');
    expect(base).toContain('color: var(--muted);');
    // Changed in #1851: was a full-width pill (--radius-full) in the footer; now a square, matching the menu button.
    expect(base).toContain('border-radius: var(--radius-md);');
    expect(base).toContain('width: var(--rail-target-size);');
    expect(base).toContain('height: var(--rail-target-size);');
    expect(block).toMatch(/button\.rail-collapse-button:focus-visible \{[^}]*outline: 2px solid/);
    expect(css).toMatch(/\n\.rail-nav-tooltip,\n\.rail-collapse-button \{\n {2}display: none;/);
    // The toggle's tooltip wrapper is hidden below 64rem too, and shown inside the rail block.
    expect(css).toMatch(/\n\.rail-collapse-item \{\n {2}display: none;/);
    expect(block).toMatch(/\.rail-collapse-item \{\s*display: block;/);
  });

  it('swaps the rest icon for the active icon on hover and focus-visible (#1851)', () => {
    const block = railMediaBlock(css).text;
    expect(block).toMatch(/\.rail-toggle-icon-active,[^{]*\{[^}]*display: none;/);
    expect(block).toMatch(
      /\.rail-toggle-icon-rest,\s*button\.rail-collapse-button:is\(:hover, :focus-visible\) \.rail-toggle-icon-active \{[^}]*display: inline-flex;/,
    );
    expect(block).toMatch(
      /button\.rail-collapse-button:is\(:hover, :focus-visible\) \.rail-toggle-icon-rest \{[^}]*display: none;/,
    );
    const swapRules = [
      ...block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/[^{}]*rail-toggle-icon[^{}]*\{[^}]*\}/g),
    ].map((m) => m[0]);
    expect(swapRules).toHaveLength(2);
    for (const rule of swapRules) expect(rule).not.toContain('transition');
  });

  it('hides the collapsed brand monogram and keeps no content: A rule (#1851)', () => {
    const block = railMediaBlock(css).text;
    expect(block).toMatch(/\.workspace-shell-collapsed \.app-header-brand \{[^}]*display: none;/);
    expect(css).not.toContain("content: 'A'");
    expect(css).not.toContain('.app-header-brand::before');
    expect(block).toMatch(/\.workspace-shell-collapsed \.app-header-brand-row \{[^}]*justify-content: center;/);
  });

  it('puts the brand and the toggle in one space-between row, with the status on its own line (#1851)', () => {
    const block = railMediaBlock(css).text;
    expect(block).toMatch(/\.app-header-brand-row \{[^}]*justify-content: space-between;/);
    expect(block).toMatch(/\.app-header-start \{[^}]*flex-direction: column;/);
    expect(block).toMatch(/\.app-header-start \{[^}]*min-height: var\(--rail-target-size\);/);
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
