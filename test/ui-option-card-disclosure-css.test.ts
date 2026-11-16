/**
 * #1600 owner verdicts: an option card's title and consequence sit on separate lines (the settings drawer's
 * plain-radio `label { display: inline }` rule must not reach the grid card), and the disclosure trigger is a pill
 * while its container, which also holds the expanded panel, keeps the small radius.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/ui/app.css'), 'utf-8');
const rule = (selector: string): string => {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) return '';
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
};

describe('option card title and consequence on separate lines (#1600)', () => {
  it('the card is a grid and the title takes its own row in column 2, above the consequence', () => {
    expect(rule('.primitive-option-card')).toContain('display: grid;');
    expect(rule('.primitive-option-card-title')).toContain('grid-column: 2;');
    expect(rule('.primitive-option-card-consequence')).toContain('grid-column: 2;');
  });

  it('the settings drawer keeps the card a grid despite its plain-radio inline label rule', () => {
    expect(rule(".settings-card-group [role='radiogroup'] label.primitive-option-card")).toContain('display: grid;');
  });
});

describe('disclosure trigger is a pill, its container stays rounded (#1600)', () => {
  it('the trigger uses var(--radius-full) and the container keeps var(--radius-sm)', () => {
    expect(rule('.primitive-disclosure-trigger')).toContain('border-radius: var(--radius-full);');
    expect(rule('.primitive-disclosure')).toContain('border-radius: var(--radius-sm);');
  });
});
