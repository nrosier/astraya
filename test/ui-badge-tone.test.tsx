/**
 * #826 S1: the Badge `tone` prop. Omitted renders exactly as before; each tone sets `data-tone`
 * and its CSS block uses only the allowed existing tokens.
 */
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge, type BadgeTone } from '../src/ui/primitives/Badge.tsx';

const TOKENS: Record<BadgeTone, string> = {
  warning: '--color-warning',
  success: '--color-success',
  danger: '--color-danger',
  accent: '--accent',
  soft: '--aspect-soft',
  hard: '--aspect-hard',
};

describe('Badge tone (#826)', () => {
  it('renders the neutral chip unchanged when tone is omitted', () => {
    expect(renderToStaticMarkup(<Badge>Aries 3rd house</Badge>)).toBe(
      '<span class="primitive-badge">Aries 3rd house</span>',
    );
  });

  it.each(Object.keys(TOKENS) as BadgeTone[])('sets data-tone for %s and keeps the text', (tone) => {
    expect(renderToStaticMarkup(<Badge tone={tone}>Label</Badge>)).toBe(
      `<span class="primitive-badge" data-tone="${tone}">Label</span>`,
    );
  });

  it('styles each tone from exactly one existing token and no colour literal', () => {
    const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');
    for (const [tone, token] of Object.entries(TOKENS)) {
      const m = new RegExp(`\\.primitive-badge\\[data-tone='${tone}'\\] \\{([^}]*)\\}`).exec(css);
      expect(m, tone).not.toBeNull();
      const body = m?.[1] ?? '';
      const vars = [...body.matchAll(/var\((--[a-z-]+)\)/g)].map((v) => v[1]);
      expect(new Set(vars), tone).toEqual(new Set([token, '--line']));
      expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    }
  });
});
