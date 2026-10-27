/**
 * #826 S2: the StatList primitive renders a definition list of label/value groups, adds no card
 * style of its own, and its CSS uses only existing tokens.
 */
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StatList } from '../src/ui/primitives/StatList.tsx';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

describe('StatList (#826)', () => {
  it('renders a dl of div groups holding a dt label and a dd value', () => {
    const html = renderToStaticMarkup(
      <StatList
        items={[
          { label: 'Planets', value: 10 },
          { label: 'Orb', value: <strong>8°</strong> },
        ]}
      />,
    );
    expect(html).toBe(
      '<dl class="primitive-stat-list"><div><dt>Planets</dt><dd>10</dd></div>' +
        '<div><dt>Orb</dt><dd><strong>8°</strong></dd></div></dl>',
    );
  });

  it('renders an empty dl for no items', () => {
    expect(renderToStaticMarkup(<StatList items={[]} />)).toBe('<dl class="primitive-stat-list"></dl>');
  });

  it('uses only existing tokens, no literals, and no card style of its own', () => {
    const rules = [...css.matchAll(/^[^\n{}]*\.primitive-stat-list[^{]*\{([^}]*)\}/gm)];
    expect(rules.length).toBeGreaterThan(0);
    const body = rules.map((r) => r[1] ?? '').join('\n');
    const vars = new Set([...body.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((v) => v[1]));
    expect([...vars].sort()).toEqual(['--muted', '--space-4', '--space-6', '--text-xs']);
    for (const v of vars) expect(css, String(v)).toMatch(new RegExp(`^\\s*${String(v)}:`, 'm'));
    expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(body).not.toMatch(/background|border-radius|box-shadow|border(?:-color)?:\s*1px/);
  });
});
