/**
 * Every single-line form input is a pill (#1600 WP7, owner answer): the shared pill rule uses the full-radius token,
 * --space-4 side padding and the 2.75rem height; textarea and checkbox rules keep their small radius; the text, number
 * and date primitives all carry the pill class.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/ui/app.css'), 'utf-8');
const source = (file: string): string => readFileSync(join(process.cwd(), 'src/ui/primitives', file), 'utf-8');

describe('single-line inputs are pills (#1600 WP7)', () => {
  it('the pill input rule uses var(--radius-full), var(--space-4) padding and 2.75rem', () => {
    const rule =
      /\.primitive-field input\.primitive-field-pill:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\) \{([^}]*)\}/.exec(
        css,
      )?.[1];
    expect(rule).toContain('border-radius: var(--radius-full);');
    expect(rule).toContain('padding-inline: var(--space-4);');
    expect(rule).toContain('min-height: 2.75rem;');
  });

  it('the date and time pills have a minimum width that fits the date and the picker icon (#1653)', () => {
    const rule =
      /\.primitive-field input\.primitive-field-pill\[type='date'\],\s*\.primitive-field input\.primitive-field-pill\[type='time'\] \{([^}]*)\}/.exec(
        css,
      )?.[1];
    expect(rule).toContain('min-inline-size: 11.25rem;');
  });

  it('the pill input rule keeps var(--space-4) left padding (#1653: width, not padding, fixes the icon)', () => {
    const rule =
      /\.primitive-field input\.primitive-field-pill:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\) \{([^}]*)\}/.exec(
        css,
      )?.[1];
    expect(rule).toContain('padding-inline: var(--space-4);');
  });

  it('the select rule is a pill with var(--space-4) padding', () => {
    const rule = /\n\.primitive-field select \{([^}]*border-radius[^}]*)\}/.exec(css)?.[1];
    expect(rule).toContain('border-radius: var(--radius-full);');
    expect(rule).toContain('padding-inline: var(--space-4);');
  });

  it('textarea keeps the small radius; no checkbox rule is a pill', () => {
    expect(css).toMatch(/\.primitive-field textarea \{[^}]*border-radius: var\(--radius-sm\);/);
    expect(css).not.toMatch(/\.primitive-field textarea[^{]*\{[^}]*--radius-full/);
  });

  it('a top-stacked label is padded to the text inside the capsule', () => {
    expect(css).toMatch(
      /\.primitive-field:has\([^)]*\) > label:not\(\.sr-only\) \{\s*padding-inline-start: var\(--space-4\);/,
    );
  });

  it('text, number and date inputs carry the pill class', () => {
    expect(source('TextField.tsx')).toContain("shape = 'pill'");
    expect(source('NumberField.tsx')).toContain("'primitive-field-pill'");
    expect(source('DateField.tsx')).toContain('className="primitive-field-pill"');
  });

  it('form action buttons are 2.75rem capsules', () => {
    expect(css).toMatch(
      /\.primitive-button-form-action,\s*button\.primitive-button-form-action \{\s*min-height: 2\.75rem;/,
    );
  });
});
