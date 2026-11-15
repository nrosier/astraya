/**
 * The segmented control is a content-hugging pill (#1600 WP2, owner decision on #1508): the container and each option
 * use the full-pill radius token, no divider sits between options, and the active option has a solid accent fill with an
 * outline that survives forced-colours mode.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/ui/app.css'), 'utf-8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css);
  return match?.[1] ?? '';
}

describe('segmented control pill shape (#1600 WP2)', () => {
  it('the container hugs its content and uses the full-pill radius', () => {
    const container = rule('.primitive-choice-group-segmented');
    expect(container).toContain('border-radius: var(--radius-full);');
    expect(container).toContain('width: fit-content;');
    expect(container).toContain('max-width: 100%;');
  });

  it('each option is a pill', () => {
    expect(rule('.primitive-choice-group-segmented .primitive-choice')).toContain('border-radius: var(--radius-full);');
  });

  it('no divider rule remains between options', () => {
    expect(css).not.toMatch(/\.primitive-choice \+ \.primitive-choice\s*\{/);
  });

  it('the active option is a solid accent fill with a background-colour label and an outline', () => {
    const active = rule('.primitive-choice-group-segmented .primitive-choice:has(input:checked)');
    expect(active).toContain('background: var(--accent);');
    expect(active).toContain('color: var(--bg);');
    expect(active).toContain('outline: 2px solid var(--fg);');
  });
});
