/**
 * #1358 — field placeholders use the --muted token, and compact fields return to standard
 * control height on coarse pointers. Token-only CSS rules in app.css.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

describe('field placeholder and compact touch CSS (#1358)', () => {
  it('styles the field placeholder with the --muted token', () => {
    const match = /\.primitive-field input::placeholder,\s*\.primitive-field textarea::placeholder \{([^}]*)\}/.exec(
      css,
    );
    expect(match).not.toBeNull();
    expect(match?.[1]).toContain('color: var(--muted);');
  });

  it('returns compact fields to standard control height under pointer: coarse', () => {
    const coarse = css.indexOf('@media (pointer: coarse) {\n  .primitive-field .primitive-control-compact,');
    expect(coarse).toBeGreaterThan(-1);
    const block = css.slice(coarse, css.indexOf('\n}\n', coarse) + 3);
    expect(block).toContain('min-height: var(--control-height);');
  });
});
