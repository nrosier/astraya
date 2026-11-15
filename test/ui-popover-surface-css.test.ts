/**
 * Popover and menu surfaces take the PillSelect card's fill and edge, and their containers use the standard radius
 * (#1600 WP6, boxes 6 and 7). Triggers and the items inside a menu keep their own radius.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/ui/app.css'), 'utf-8');

/** The declaration block of the rule whose selector is exactly `selector`. */
function block(selector: string): string {
  const escaped = selector.replace(/[\\.[\]()]/g, '\\$&');
  const m = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css);
  if (m?.[1] === undefined) throw new Error(`no rule for ${selector}`);
  return m[1];
}

const cardSurfaces = [
  '.settings-card-defaults-menu',
  '.timing-popover',
  '.person-switcher-popup',
  '.app-nav-menu',
  '.page-header-export-menu',
  '.primitive-tooltip-popup',
];
const radiusOnly = ['.profile-popover', '.accountpanel-popover', '.syncbadge-popover'];

describe('popover and menu surfaces (#1600 WP6)', () => {
  it('the PillSelect card is the reference', () => {
    const card = block('.primitive-pill-select-card');
    expect(card).toContain('background: var(--surface-hover);');
    expect(card).toContain('border: 1px solid var(--muted);');
    expect(card).toContain('border-radius: var(--radius);');
    expect(card).toContain('box-shadow: var(--shadow-popover);');
  });

  it.each(cardSurfaces)('%s copies the card fill, edge, shadow and radius', (selector) => {
    const b = block(selector);
    expect(b).toContain('background: var(--surface-hover);');
    expect(b).toContain('border: 1px solid var(--muted);');
    expect(b).toContain('border-radius: var(--radius);');
    expect(b).toContain('box-shadow: var(--shadow-popover);');
  });

  it.each(radiusOnly)('%s container uses the radius token, not a literal', (selector) => {
    const b = block(selector);
    expect(b).toMatch(/border-radius: var\(--radius(-md)?\);/);
    expect(b).not.toContain('0.5rem;\n  border');
  });

  it.each([
    '.settings-card-defaults-item:hover:not(:disabled)',
    '.person-switcher-item:hover',
    '.person-switcher-item.active',
    '.app-nav-menu-item:hover:not(.active, .disabled)',
    '.app-nav-menu-item.active',
    '.page-header-export-item:hover:not(:disabled)',
  ])('%s steps to --line, since --surface-hover is the surface itself', (item) => {
    expect(block(item)).toContain('background: var(--line);');
  });
});
