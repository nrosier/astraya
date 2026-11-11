/**
 * #1442: the seven technique colour tokens exist in both themes, each reaches the 3:1 graphical-object minimum
 * (WCAG 1.4.11) on its theme's surface, and the Gantt bar uses its row's colour at 0.85 opacity. Read from `app.css`
 * itself, so a changed hex is measured rather than assumed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TIMING_TIMELINE_TRACKS } from '../src/domain/timing-timeline.js';
import { techniqueColorVar } from '../src/ui/timeline-gantt.js';

const css = readFileSync(join(import.meta.dirname, '../src/ui/app.css'), 'utf-8');

function tokenBlock(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`token block not found: ${selector}`);
  const open = css.indexOf('{', start);
  const body = css.slice(open + 1, css.indexOf('\n}', open));
  const tokens: Record<string, string> = {};
  for (const [, name, hex] of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    if (name !== undefined && hex !== undefined) tokens[name] = hex;
  }
  return tokens;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const TECH = ['zr', 'firdaria', 'profection', 'pd', 'sec', 'sa', 'transit'] as const;
const DECIDED = {
  dark: {
    zr: '#facc15',
    firdaria: '#2dd4bf',
    profection: '#34d399',
    pd: '#a855f7',
    sec: '#fb7185',
    sa: '#fb923c',
    transit: '#38bdf8',
  },
  light: {
    zr: '#a88704',
    firdaria: '#209c8d',
    profection: '#229d70',
    pd: '#a855f7',
    sec: '#fa4963',
    sa: '#e16805',
    transit: '#0794d2',
  },
} as const;
const THEMES = {
  dark: tokenBlock(":root[data-theme='dark']"),
  light: tokenBlock(":root[data-theme='light']"),
};

describe.each(Object.entries(THEMES))('technique colours in %s mode (#1442)', (name, tokens) => {
  const theme = name as keyof typeof DECIDED;
  it.each(TECH)('--color-tech-%s is the decided hue and reaches 3:1 on the surface', (tech) => {
    expect(tokens[`color-tech-${tech}`]).toBe(DECIDED[theme][tech]);
    expect(contrast(tokens[`color-tech-${tech}`] ?? '', tokens.surface ?? '')).toBeGreaterThanOrEqual(3);
  });
});

describe('technique colours in the system-light media block (#1442)', () => {
  it('match the explicit light theme', () => {
    const media = tokenBlock('@media (prefers-color-scheme: light)');
    for (const tech of TECH) expect(media[`color-tech-${tech}`]).toBe(DECIDED.light[tech]);
  });
});

describe('the Gantt bar (#1442)', () => {
  it('fills with its row colour at 0.85 opacity', () => {
    const rule = /\.gantt-bar \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('fill: var(--tech');
    expect(rule).toContain('fill-opacity: 0.85');
  });

  it('every track maps to one of the seven tokens', () => {
    for (const track of TIMING_TIMELINE_TRACKS) {
      const token = /var\((--color-tech-[a-z]+)\)/.exec(techniqueColorVar(track))?.[1];
      expect(token === undefined ? undefined : css.includes(`${token}:`)).toBe(true);
    }
  });
});
