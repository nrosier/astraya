/**
 * The command palette trigger's CSS (#1654, task 1654-5). The trigger is a pill at 2.75rem on a wide screen
 * and an icon-only circle at 390px with a 44px touch floor. Token-only rules in app.css, read as text.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

describe('command palette trigger CSS (#1654)', () => {
  it('styles the wide-screen trigger as a 2.75rem full-radius pill', () => {
    const start = css.indexOf('\n.app-nav-search {');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('\n}\n', start) + 3);
    expect(block).toContain('height: 2.75rem;');
    expect(block).toContain('border-radius: var(--radius-full);');
  });

  it('leaves the 390px circle size to the shared circle class, and hides the text and hint at 390px', () => {
    const start = css.indexOf('@media (max-width: 40rem) {\n  /* Icon only');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('\n}\n', start) + 3);
    expect(block).not.toContain('width: 2.25rem;');
    expect(block).not.toContain('min-width: 44px;');
    expect(block).toContain('display: none;');
    const shared = css.indexOf('.primitive-button-circle,\nbutton.primitive-button-circle {');
    expect(shared).toBeGreaterThan(-1);
    const sharedBlock = css.slice(shared, css.indexOf('\n}\n', shared) + 3);
    expect(sharedBlock).toContain('width: var(--control-height-compact);');
    expect(sharedBlock).toContain('border-radius: var(--radius-full);');
  });
});
