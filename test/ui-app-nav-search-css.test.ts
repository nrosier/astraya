/**
 * The command palette trigger's CSS (#1654, task 1654-5; #1769 Step 2). The trigger is one icon-only circle at
 * `--control-height` at every width, with a CSS tooltip shown on hover and focus. Token-only rules in app.css, read as text.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

describe('command palette trigger CSS (#1654)', () => {
  it('styles the trigger as a control-height, full-radius circle at every width (#1769)', () => {
    const start = css.indexOf('\n.app-nav-search,\nbutton.app-nav-search.primitive-button-circle {');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('\n}\n', start) + 3);
    expect(block).toContain('width: var(--control-height);');
    expect(block).toContain('height: var(--control-height);');
    expect(block).toContain('aspect-ratio: 1;');
    expect(block).toContain('border-radius: var(--radius-full);');
    expect(block).toContain('border: 1px solid var(--line);');
    expect(block).toContain('background: var(--surface);');
  });

  it('draws the search icon at 1.125rem with the stroke settings from Lucide', () => {
    const start = css.indexOf('\n.app-nav-search svg {');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('\n}\n', start) + 3);
    expect(block).toContain('width: 1.125rem;');
    expect(block).toContain('height: 1.125rem;');
    expect(block).toContain('stroke-width: 2;');
    expect(block).toContain('stroke-linecap: round;');
    expect(block).toContain('stroke-linejoin: round;');
  });

  it('shows the tooltip on hover and on keyboard focus, and no longer styles the removed text or hint', () => {
    expect(css).toContain('.app-nav-search-wrap:hover > .app-nav-search-tip,');
    expect(css).toContain('.app-nav-search-wrap:focus-within > .app-nav-search-tip {');
    expect(css).not.toContain('.app-nav-search-text');
    expect(css).not.toContain('.app-nav-search-hint');
  });
});
