/**
 * Form-action buttons are 2.75rem (38.5px) on every surface, including quiet and primary buttons and buttons in a
 * settings-card footer (#1650, owner decisions: "Form action wins" and "Form action sets footer height"). Other footer
 * buttons keep the standard control height.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/ui/app.css'), 'utf-8');

/** The declarations of the first rule whose selector list matches `selector` exactly. */
function ruleBody(selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css)?.[1];
}

describe('form-action buttons are 2.75rem (#1650)', () => {
  it('a quiet, danger or primary form action sets min-height to the form-action height', () => {
    const rule = ruleBody(
      '.primitive-button-form-action.quiet,\n.primitive-button-form-action.danger,\n.primitive-button-form-action.primitive-button-primary',
    );
    expect(rule).toContain('min-height: max(2.75rem, var(--target-min));');
  });

  it('a form action inside a settings-card footer sets height to the form-action height and clears min-height', () => {
    const rule = ruleBody('.settings-card-footer-group button.primitive-button-form-action');
    expect(rule).toContain('height: max(2.75rem, var(--target-min));');
    expect(rule).toContain('min-height: 0;');
  });

  it('the footer rule leaves every other footer button on the standard control height', () => {
    expect(ruleBody('.settings-card-footer-group button')).toContain('height: var(--control-height);');
    expect(css).not.toMatch(
      /\.settings-card-footer-group button:not\(\.primitive-button-form-action\)\s*\{[^}]*height/,
    );
  });

  it('the form-action footer rule is declared after the generic footer rule so it wins at equal specificity', () => {
    const generic = css.indexOf('.settings-card-footer-group button {');
    const formAction = css.indexOf('.settings-card-footer-group button.primitive-button-form-action {');
    expect(generic).toBeGreaterThan(-1);
    expect(formAction).toBeGreaterThan(generic);
  });
});
