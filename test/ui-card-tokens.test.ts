/**
 * Every card shares one token set (#1850, #1851, #1853, #1867; docs/ui/UI-UX_GUIDELINES.md, Radius): `--radius` corners,
 * `--space-4` padding, a 1px `--line` border, the `--surface` fill and a title at `--h2-size` / `--h2-weight`. A
 * disclosure inside a card drops its own box. Reads the stylesheet as text, so no DOM is needed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, '..', 'src', 'ui', 'app.css'), 'utf8');

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, `rule ${selector}`).not.toBeNull();
  return match?.[1] ?? '';
}

describe('card token set', () => {
  it.each(['.birth-record-card', '.flat-card', '.relationship-summary', '.selection-inspector', '.preferences-card'])(
    '%s uses --radius corners, --space-4 padding and the --line / --surface pair',
    (selector) => {
      const body = rule(selector);
      expect(body).toMatch(/border-radius:\s*var\(--radius(?:-lg)?\);/);
      expect(body).toMatch(/padding:\s*var\(--space-4\);/);
      expect(body).toMatch(/border:[^;]*var\(--line\)/);
      if (selector !== '.flat-card') expect(body).toMatch(/background:\s*var\(--surface\);/);
    },
  );

  it('keeps the flat card on the 70% surface mix', () => {
    expect(rule('.flat-card')).toContain('color-mix(in oklab, var(--surface) 70%, transparent)');
  });

  it('gives the consultation section and glance --radius, --space-4 and --line', () => {
    const body = /\n\.consultation-section,\n\.consultation-glance \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(body).toMatch(/border-radius:\s*var\(--radius\);/);
    expect(body).toMatch(/padding:\s*var\(--space-4\);/);
    expect(body).toMatch(/border:[^;]*var\(--line\)/);
    expect(body).toMatch(/background:\s*var\(--surface\);/);
  });

  it.each([
    '.birth-record-card h3',
    '.selection-inspector-title',
    '.relationship-summary h2',
    '.consultation-section > h2,\n.consultation-glance > h2',
  ])('titles in %s use --h2-size and --h2-weight', (selector) => {
    const body = rule(selector);
    expect(body).toMatch(/font-size:\s*var\(--h2-size\);/);
    expect(body).toMatch(/font-weight:\s*var\(--h2-weight\);/);
  });

  it('gives the preferences card title the h2 weight', () => {
    expect(rule('.preferences-card-title')).toMatch(/font-weight:\s*var\(--h2-weight\);/);
  });

  it('does not use the small radius on a card', () => {
    for (const selector of ['.flat-card', '.relationship-summary', '.birth-record-card', '.selection-inspector']) {
      expect(rule(selector)).not.toContain('--radius-sm');
    }
  });
});

describe('a card holds no second card', () => {
  it('flattens the disclosure inside every card, with no literal colour', () => {
    const body =
      /:is\(\.birth-record-card, \.consultation-section, \.consultation-glance, dialog\.settings-card\) \.primitive-disclosure \{([^}]*)\}/.exec(
        css,
      )?.[1] ?? '';
    expect(body).toMatch(/border:\s*0;/);
    expect(body).toMatch(/border-radius:\s*0;/);
    expect(body).toMatch(/background:\s*transparent;/);
  });

  it('places the flattening rule after the base disclosure rule', () => {
    const base = css.indexOf('\n.primitive-disclosure {');
    const flat = css.indexOf('dialog.settings-card) .primitive-disclosure {');
    expect(base).toBeGreaterThan(-1);
    expect(flat).toBeGreaterThan(base);
  });
});
