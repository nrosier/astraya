/**
 * #1357 — one disabled treatment (opacity 0.55, cursor not-allowed) for buttons and fields,
 * one full-strength --color-focus outline for every focus ring, and a global :focus-visible
 * rule that sets only the outline. CSS-reading test against src/ui/app.css.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

/** The declaration block of the first rule whose selector text is exactly `selector`. */
function blockOf(selector: string): string {
  const match = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&')} \\{`, 'm').exec(css);
  expect(match, `rule ${selector}`).not.toBeNull();
  const start = match?.index ?? 0;
  return css.slice(start, css.indexOf('}', start));
}

describe('disabled treatment is shared across controls (#1357)', () => {
  it('dims disabled buttons to opacity 0.55 with a not-allowed cursor', () => {
    const block = blockOf('button:disabled');
    expect(block).toContain('opacity: 0.55;');
    expect(block).toContain('cursor: not-allowed;');
  });

  it('dims disabled primitive fields to opacity 0.55 with a not-allowed cursor', () => {
    const start = css.indexOf('.primitive-field input:disabled,');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('}', start));
    expect(block).toContain('opacity: 0.55;');
    expect(block).toContain('cursor: not-allowed;');
    expect(block).not.toContain('opacity: 0.6;');
  });
});

describe('focus rings use --color-focus at full strength (#1357)', () => {
  it('no focus outline is mixed down to 55% accent', () => {
    expect(css).not.toMatch(/outline:[^;]*color-mix\([^;]*var\(--accent\) 55%/);
  });

  it('focus outlines use the full --color-focus token', () => {
    expect(css).toMatch(/outline: 2px solid var\(--color-focus\);/);
  });
});

describe('global :focus-visible sets only the outline (#1357)', () => {
  it('does not set border-radius on :focus-visible', () => {
    expect(blockOf(':focus-visible')).not.toContain('border-radius');
    expect(blockOf(':focus-visible')).toContain('outline: 2px solid var(--color-focus);');
  });
});
