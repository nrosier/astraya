/**
 * #1615: the Overlay settings drawer follows the owner layout spec on the app's existing tokens. On the phone sheet a
 * row with a single field (Progressed, Directed) spans both columns; the drawer rules add no hex colour and the only
 * radius is the --radius-full badge pill.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

/** Every rule body whose selector mentions the drawer's own classes. */
function drawerRules(): string[] {
  const rules: string[] = [];
  for (const match of css.matchAll(/([^{}]*chart-overlay-(?:row|globals|draft)[^{}]*)\{([^}]*)\}/g)) {
    rules.push(match[2] ?? '');
  }
  return rules;
}

describe('overlay drawer layout (#1615)', () => {
  it('spans the lone Progressed and Directed date field over both columns at the phone breakpoint', () => {
    const phone = /@media \(max-width: 40rem\) \{\s*\.chart-overlay-row \{[\s\S]*?\n\}\n/.exec(css)?.[0] ?? '';
    expect(phone).toMatch(/\.chart-overlay-row-inputs > :only-child \{\s*grid-column: 1 \/ -1;/);
  });

  it('adds no hex value and no radius other than the full-radius pill to the drawer rules', () => {
    const rules = drawerRules();
    expect(rules.length).toBeGreaterThan(5);
    for (const body of rules) {
      expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      for (const radius of body.matchAll(/border-radius:\s*([^;]+);/g)) {
        expect(radius[1]).toMatch(/^(var\(--radius(?:-sm|-full)?\))$/);
      }
    }
  });
});
