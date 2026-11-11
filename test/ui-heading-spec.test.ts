/**
 * Guards the heading spec in src/ui/app.css and docs/ui/UI-UX_GUIDELINES.md (issue 1354): one h2 and one h3 size,
 * weight and margin for cards, prose and pages. Read from the files themselves.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, '../src/ui/app.css'), 'utf-8');
const guide = readFileSync(join(import.meta.dirname, '../docs/ui/UI-UX_GUIDELINES.md'), 'utf-8');

function token(name: string): string {
  const m = new RegExp(`^\\s*--${name}:\\s*([^;]+);`, 'm').exec(css);
  if (m?.[1] === undefined) throw new Error(`token not found: ${name}`);
  return m[1].trim();
}

interface Rule {
  selector: string;
  body: string;
}

function headingRules(): Rule[] {
  const rules: Rule[] = [];
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of bare.matchAll(/^([^\n{}@/*][^{}]*)\{([^{}]*)\}/gm)) {
    const selector = (m[1] ?? '').trim();
    if (/\bh[23]\b/.test(selector)) rules.push({ selector, body: m[2] ?? '' });
  }
  return rules;
}

/** Sizes a heading rule may set other than the spec tokens: none. */
const ALLOWED_SIZES = new Set(['var(--h2-size)', 'var(--h3-size)', 'var(--text-lg)', 'var(--text-base)']);

describe('heading spec tokens', () => {
  it('h2 is --text-lg, weight 600, margin 0', () => {
    expect(token('h2-size')).toBe('var(--text-lg)');
    expect(token('h2-weight')).toBe('600');
    expect(token('h2-margin')).toBe('0');
  });

  it('h3 is --text-base, weight 600, margin 0', () => {
    expect(token('h3-size')).toBe('var(--text-base)');
    expect(token('h3-weight')).toBe('600');
    expect(token('h3-margin')).toBe('0');
  });
});

describe('heading rules in app.css', () => {
  const rules = headingRules();

  it('finds the heading rules', () => {
    expect(rules.length).toBeGreaterThan(20);
  });

  it('no heading rule sets a font-size outside the spec', () => {
    for (const { selector, body } of rules) {
      for (const m of body.matchAll(/font-size:\s*([^;]+);/g)) {
        expect(ALLOWED_SIZES.has((m[1] ?? '').trim()), `${selector}: font-size ${m[1]}`).toBe(true);
      }
    }
  });

  it('no heading rule sets a font-weight or margin outside the spec', () => {
    for (const { selector, body } of rules) {
      for (const m of body.matchAll(/(?<![-\w])font-weight:\s*([^;]+);/g)) {
        expect(['var(--h2-weight)', 'var(--h3-weight)'], `${selector}: weight ${m[1]}`).toContain((m[1] ?? '').trim());
      }
      for (const m of body.matchAll(/(?<![-\w])margin:\s*([^;]+);/g)) {
        const v = (m[1] ?? '').trim();
        if (/h[23]\s*[,{]|h[23]$/.test(selector) && !selector.startsWith('.chart-overlay-provenance ul')) {
          expect(['var(--h2-margin)', 'var(--h3-margin)', '0'], `${selector}: margin ${v}`).toContain(v);
        }
      }
    }
  });
});

describe('guide records the heading spec', () => {
  it('states both specs, the prose decision and the exceptions', () => {
    expect(guide).toContain('**Headings (#1354).**');
    expect(guide).toMatch(/h2 is `--h2-size` \(`--text-lg`.*`--h2-weight` 600 and `--h2-margin` 0/);
    expect(guide).toMatch(/h3 is `--h3-size` \(`--text-base`.*`--h3-weight` 600 and `--h3-margin` 0/);
    expect(guide).toContain('Prose h2 and h3 follow the same spec as cards');
    expect(guide).toContain('**Exceptions**');
    expect(guide).toContain('`.shell > h2`');
    expect(guide).toContain('`.birth-record-card h3`');
  });
});
