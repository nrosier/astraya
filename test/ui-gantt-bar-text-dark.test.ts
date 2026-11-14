/**
 * Issue 1401 (owner review, 2026-11-14): in dark theme the text inside Gantt bars is the --bg token (dark), except on the
 * primary-directions bars, which keep white because dark text on their purple fill is 3.92:1 and white is 4.96:1.
 * Read from `app.css` itself. Light theme keeps white.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, '../src/ui/app.css'), 'utf-8');

function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`block not found: ${selector}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unclosed block: ${selector}`);
}

const textToken = (body: string): string | undefined => /--gantt-bar-text:\s*([^;]+);/.exec(body)?.[1]?.trim();

describe('Gantt bar text colour (#1401)', () => {
  it('is the --bg token in dark theme, for the default and the explicit override', () => {
    expect(textToken(block(":root[data-theme='dark']"))).toBe('var(--bg)');
    expect(textToken(block(':root {'))).toBe('var(--bg)');
  });

  it('stays white in light theme', () => {
    expect(textToken(block(":root[data-theme='light']"))).toBe('white');
  });

  it('keeps white on primary-directions bars only', () => {
    expect(textToken(block(".gantt-row[data-track='primary-directions']"))).toBe('white');
    expect(css).not.toMatch(/\.gantt-row\[data-track='(?!primary-directions)/);
  });

  it('draws both in-bar texts with the token', () => {
    expect(block('.gantt-bar-label {')).toContain('color: var(--gantt-bar-text)');
    expect(block('.gantt-bar-pass {')).toContain('color: var(--gantt-bar-text)');
  });
});
