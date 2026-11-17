// @vitest-environment jsdom
/**
 * Issue 1532: the wheel's colour and dash roles, read from `app.css` and the rendered wheel markup, and the hard-coded
 * copies of the palette (`standalone-svg.ts`, `pdf-export-plan.ts`, `chart-birth-map.test.ts`) checked against `app.css`.
 * Reference: docs/ui/mockups/1532-instrument-bar-v3.md. jsdom parses the rendered SVG so the geometry is measured, not grepped.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { HousePositions } from '../src/ephemeris/types.js';
import { standaloneSvg } from '../src/chart/standalone-svg.js';
import { renderMultiWheelSvg, type WheelRingInput } from '../src/chart/multi-wheel.js';
import { resolveSheetGeometry } from '../src/chart/sheet-geometry.js';

const root = join(import.meta.dirname, '..');
const css = readFileSync(join(root, 'src/ui/app.css'), 'utf8');
const toneCss = readFileSync(join(root, 'src/ui/chart-aspect-tones.css'), 'utf8');

const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '');

/** Declarations of every rule whose selector list contains `selector` exactly, outside any @media block. */
function declarationsOf(source: string, selector: string): string {
  const flat = stripComments(source);
  const out: string[] = [];
  for (const m of flat.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const selectors = (m[1] ?? '').split(',').map((s) => s.trim());
    if (selectors.includes(selector)) out.push(m[2] ?? '');
  }
  if (out.length === 0) throw new Error(`rule not found: ${selector}`);
  return out.join(';');
}

/** The light-theme token block (`:root[data-theme='light']`). */
function lightTokens(): string {
  const start = css.indexOf(":root[data-theme='light']");
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}
const light = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(lightTokens());
  if (m?.[1] === undefined) throw new Error(`--${name} missing in light`);
  return m[1];
};

const HOUSES: HousePositions = {
  cusps: [0, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
  ascendant: 0,
  midheaven: 270,
  armc: 0,
  vertex: 0,
  equatorialAscendant: 0,
  coAscendantKoch: 0,
  coAscendantMunkasey: 0,
  polarAscendant: 0,
  system: 'A',
};
const pair = (a: number, b: number): WheelRingInput['bodies'] => [
  { body: 1, key: 'sun', longitude: a },
  { body: 2, key: 'moon', longitude: b },
];
const natal = (bodies: WheelRingInput['bodies']): WheelRingInput => ({
  label: 'Natal',
  role: 'natal',
  houses: HOUSES,
  bodies,
});
const transit = (bodies: WheelRingInput['bodies']): WheelRingInput => ({
  label: 'Transit',
  role: 'transit',
  houses: HOUSES,
  bodies,
});

function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, 'image/svg+xml');
}
const radius = (x: string | null, y: string | null): number => Math.hypot(Number(x) - 400, Number(y) - 400);

describe('wheel geometry (issue 1532)', () => {
  const doc = parse(renderMultiWheelSvg([natal(pair(10, 100))], [], { size: 800 }));
  const g = resolveSheetGeometry(800);

  it('lists the tracks outside in: zodiac dial, degree ruler, planet band, house collar, aspect core', () => {
    expect(g.zodiacOuter).toBeGreaterThan(g.zodiacInner);
    expect(g.zodiacInner - g.tickMajorLength).toBeGreaterThan(g.planetRingOuter);
    expect(g.planetRingOuter).toBeGreaterThan(g.houseRing);
    expect(g.houseRing).toBeGreaterThan(g.aspectCircle);
    for (const cls of ['wheel-ring-outer', 'wheel-ring-inner', 'wheel-ring-house', 'wheel-ring-aspect']) {
      expect(doc.querySelectorAll(`circle.${cls}`)).toHaveLength(1);
    }
  });

  it('draws a 360 degree tick ring and twelve sign dividers', () => {
    const ticks = ['wheel-tick-major', 'wheel-tick-medium', 'wheel-tick-minor'].map(
      (c) => doc.querySelectorAll(`line.${c}`).length,
    );
    expect(ticks).toEqual([36, 36, 288]);
    expect(ticks.reduce((a, b) => a + b, 0)).toBe(360);
    expect(doc.querySelectorAll('line.wheel-sign-boundary')).toHaveLength(12);
  });

  it('runs the four cardinal axes from the aspect core to the outer dial edge and no further', () => {
    const axes = [...doc.querySelectorAll('line.chart-multiwheel-axis')];
    expect(axes).toHaveLength(4);
    for (const axis of axes) {
      const near = Math.min(
        radius(axis.getAttribute('x1'), axis.getAttribute('y1')),
        radius(axis.getAttribute('x2'), axis.getAttribute('y2')),
      );
      const far = Math.max(
        radius(axis.getAttribute('x1'), axis.getAttribute('y1')),
        radius(axis.getAttribute('x2'), axis.getAttribute('y2')),
      );
      expect(near).toBeCloseTo(g.aspectCircle, 1);
      expect(far).toBeCloseTo(g.zodiacOuter, 1);
    }
  });
});

describe('collision spacing (issue 1532)', () => {
  const leaders = (svg: string): number => parse(svg).querySelectorAll('line.chart-glyph-leader').length;
  it('keeps 6 degrees for natal bodies: bodies 6.5 degrees apart stay put, 5.5 degrees apart are spread', () => {
    expect(leaders(renderMultiWheelSvg([natal(pair(10, 16.5))], [], { size: 800 }))).toBe(0);
    expect(leaders(renderMultiWheelSvg([natal(pair(10, 15.5))], [], { size: 800 }))).toBeGreaterThan(0);
  });
  it('keeps 7 degrees for transit bodies: bodies 6.5 degrees apart are spread, 7.5 degrees apart stay put', () => {
    const calm = natal(pair(100, 200));
    expect(leaders(renderMultiWheelSvg([calm, transit(pair(10, 16.5))], [], { size: 800 }))).toBeGreaterThan(0);
    expect(leaders(renderMultiWheelSvg([calm, transit(pair(10, 17.5))], [], { size: 800 }))).toBe(0);
  });
});

describe('wheel colour roles in app.css (issue 1532)', () => {
  const roles: readonly (readonly [string, string, string])[] = [
    ['.wheel-ring-outer', 'stroke', 'var(--muted)'],
    ['.wheel-sign-boundary', 'stroke', 'var(--muted)'],
    ['.wheel-ring-zodiac', 'stroke', 'var(--line)'],
    ['.wheel-ring-inner', 'stroke', 'var(--line)'],
    ['.wheel-ring-house', 'stroke', 'var(--line)'],
    ['.chart-multiwheel-axis', 'stroke', 'var(--solar)'],
    ['.chart-multiwheel-cusp-angle', 'stroke', 'var(--solar)'],
    ['.chart-glyph-transit path', 'stroke', 'var(--ring-1-color)'],
    ['.chart-glyph-transit .glyph-fill', 'fill', 'var(--ring-1-color)'],
  ];
  for (const [selector, property, value] of roles) {
    it(`${selector} sets ${property} to ${value}`, () => {
      const declarations = declarationsOf(css, selector)
        .split(';')
        .map((d) => d.trim().replace(/\s+/g, ' '));
      expect(declarations).toContain(`${property}: ${value}`);
    });
  }

  it('colours the axis labels with --solar', () => {
    expect(declarationsOf(css, '.chart-multiwheel .chart-axis-label')).toContain('fill: var(--solar)');
  });

  it('sets the axis labels and the degree labels to the chart-label size and weight (issue 1649)', () => {
    const axis = declarationsOf(css, '.chart-multiwheel .chart-axis-label');
    expect(axis).toContain('font-size: var(--text-2xs)');
    expect(axis).toContain('font-weight: 700');
    expect(declarationsOf(css, '.chart-multiwheel .chart-axis-degree')).toContain('font-size: var(--text-2xs)');
  });

  it('uses only tokens in the wheel roles: no hex value in these rules', () => {
    for (const [selector] of roles) expect(declarationsOf(css, selector)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('aspect chord families (issue 1532)', () => {
  const dash: readonly (readonly [string, string])[] = [
    ['hard', 'none'],
    ['soft', '5 3'],
    ['minor', '1 2'],
  ];
  for (const [tone, value] of dash) {
    it(`${tone} chords take their own token colour and dash ${value}`, () => {
      const body = declarationsOf(toneCss, `.chart-aspect[data-tone='${tone}']`);
      expect(body).toContain(`stroke: var(--aspect-${tone})`);
      expect(body).toContain(`stroke-dasharray: ${value}`);
    });
  }

  it('prints black ink with the same dash per family (#564)', () => {
    const print = toneCss.slice(toneCss.indexOf('@media print'));
    for (const [tone, value] of dash) {
      const m = new RegExp(`\\.chart-aspect\\[data-tone='${tone}'\\]\\s*\\{([^}]*)\\}`).exec(print);
      expect(m?.[1], tone).toContain('stroke: #000');
      expect(m?.[1], tone).toContain(`stroke-dasharray: ${value}`);
    }
  });
});

describe('standalone SVG export matches the on-screen roles (issue 1532)', () => {
  const style = standaloneSvg('<svg></svg>');
  const rule = (selector: string): string => {
    const start = style.indexOf(selector);
    if (start === -1) throw new Error(`standalone rule not found: ${selector}`);
    return style.slice(style.indexOf('{', start), style.indexOf('}', start));
  };

  it('draws the outer circle in --muted, the other rings in --line, the axes and axis labels in --solar', () => {
    expect(rule('.wheel-ring-outer')).toContain(`stroke: ${light('muted')}`);
    expect(rule('.wheel-ring-zodiac')).toContain(`stroke: ${light('line')}`);
    expect(rule('.wheel-ring-house')).toContain(`stroke: ${light('line')}`);
    expect(rule('.chart-multiwheel-axis')).toContain(`stroke: ${light('solar')}`);
    expect(rule('.chart-axis-label')).toContain(`fill: ${light('solar')}`);
  });

  it('draws transit glyphs in --ring-1-color', () => {
    expect(rule('.chart-glyph-transit circle')).toContain(`stroke: ${light('ring-1-color')}`);
    expect(rule('.chart-glyph-transit .glyph-fill')).toContain(`fill: ${light('ring-1-color')}`);
  });

  it('carries the dash per chord family', () => {
    expect(rule(".chart-aspect[data-tone='hard']")).toContain(`stroke: ${light('aspect-hard')}`);
    expect(rule(".chart-aspect[data-tone='soft']")).toContain('stroke-dasharray: 5 3');
    expect(rule(".chart-aspect[data-tone='minor']")).toContain('stroke-dasharray: 1 2');
  });

  it('holds the light values of the adopted palette', () => {
    for (const name of ['element-fire', 'element-earth', 'element-air'] as const) {
      expect(style, name).toContain(`.chart-sign-${name} path { stroke: ${light(name)}; }`);
    }
    expect(light('accent')).toBe('#3b49df');
    expect(light('solar')).toBe('#835208');
    expect(rule('.chart-sign-glyph circle')).toContain(`stroke: ${light('accent')}`);
  });
});

describe('hard-coded palette copies match app.css (issue 1532)', () => {
  it('pdf-export-plan MAP_COLORS.pin is the light --accent', () => {
    const source = readFileSync(join(root, 'src/ui/pdf-export-plan.ts'), 'utf8');
    expect(/MAP_COLORS = \{[^}]*pin: '(#[0-9a-fA-F]{6})'/.exec(source)?.[1]).toBe(light('accent'));
  });

  it('the birth-map test fixture pin is the light --accent', () => {
    const source = readFileSync(join(root, 'test/chart-birth-map.test.ts'), 'utf8');
    expect(/COLORS = \{[^}]*pin: '(#[0-9a-fA-F]{6})'/.exec(source)?.[1]).toBe(light('accent'));
  });

  it('--glow-a and --glow-b follow --accent and --solar in both themes', () => {
    const rgb = (hex: string): string =>
      [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16).toString()).join(' ');
    const dark = /:root \{[\s\S]*?\n\}/.exec(css)?.[0] ?? '';
    const pick = (block: string, name: string): string =>
      new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(block)?.[1] ?? '';
    expect(dark).toContain(`--glow-a: rgb(${rgb(pick(dark, 'accent'))} /`);
    expect(dark).toContain(`--glow-b: rgb(${rgb(pick(dark, 'solar'))} /`);
    expect(lightTokens()).toContain(`--glow-a: rgb(${rgb(light('accent'))} /`);
    expect(lightTokens()).toContain(`--glow-b: rgb(${rgb(light('solar'))} /`);
  });
});

describe('transit ring fill (issue 1532, owner decision 2026-11-14: accent at 18%)', () => {
  const dark = (name: string): string => {
    const start = css.indexOf(':root {');
    const open = css.indexOf('{', start);
    const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(css.slice(open + 1, css.indexOf('}', open)));
    if (m?.[1] === undefined) throw new Error(`--${name} missing in dark`);
    return m[1];
  };

  it('draws one filled annulus for the transit band, and none without a transit ring', () => {
    const doc = parse(renderMultiWheelSvg([natal(pair(10, 100)), transit(pair(20, 200))], [], { size: 800 }));
    const bands = doc.querySelectorAll('path.chart-ring-band-transit');
    expect(bands).toHaveLength(1);
    expect(bands[0]?.getAttribute('fill-rule')).toBe('evenodd');
    const plain = parse(renderMultiWheelSvg([natal(pair(10, 100))], [], { size: 800 }));
    expect(plain.querySelectorAll('path.chart-ring-band-transit')).toHaveLength(0);
  });

  it('fills with --accent at 18%, a token that resolves in both themes', () => {
    expect(declarationsOf(css, '.chart-ring-band-transit')).toContain(
      'fill: color-mix(in oklab, var(--accent) 18%, transparent)',
    );
    expect(dark('accent')).toBe('#8b9cff');
    expect(light('accent')).toBe('#3b49df');
  });

  it('carries the light accent at 18% in the standalone export', () => {
    const style = standaloneSvg('<svg></svg>');
    const start = style.indexOf('.chart-ring-band-transit');
    const rule = style.slice(style.indexOf('{', start), style.indexOf('}', start));
    expect(rule).toContain(`fill: ${light('accent')}`);
    expect(rule).toContain('fill-opacity: 0.18');
  });
});
