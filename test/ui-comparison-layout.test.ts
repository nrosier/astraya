/**
 * The Comparison layout (#886) is a named token class in app.css, not an inline 1fr 1fr grid,
 * and it stacks at the shell's 40rem phone breakpoint.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tsx = readFileSync(new URL('../src/ui/ChartView.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

describe('Comparison layout', () => {
  it('carries the comparison-layout class and no inline gridTemplateColumns', () => {
    const line = tsx.split('\n').find((l) => l.includes('comparison-container'));
    expect(line).toBeDefined();
    expect(line).toContain('comparison-layout');
    expect(line).not.toContain('gridTemplateColumns');
    expect(line).not.toContain('style=');
  });

  it('defines two columns with a gap token and stacks at 40rem, with no colour literals', () => {
    const start = css.indexOf('.comparison-layout {');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start);
    expect(block).toMatch(/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(block).toMatch(/gap: var\(--space-8\)/);
    expect(block).toMatch(
      /@media \(max-width: 40rem\) \{\s*\.comparison-layout \{\s*grid-template-columns: minmax\(0, 1fr\)/,
    );
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
  });
});
