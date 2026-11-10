/**
 * #1355 — the textarea in a stacked label comes from the shared field primitive, so app.css carries no
 * hand-styled `label.stacked textarea` field rule. Any padding on a textarea uses --field-padding-x.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/app.css', import.meta.url), 'utf8');

describe('stacked label textarea uses the shared field (#1355)', () => {
  it('has no hand-styled label.stacked textarea field rule', () => {
    expect(css).not.toMatch(/label\.stacked\s+textarea\b/);
  });

  it('any base primitive-field textarea padding uses --field-padding-x', () => {
    // Anchored to the base selector at line start, so density-scoped overrides are not matched.
    const rules = [...css.matchAll(/^\.primitive-field textarea \{([^}]*)\}/gm)].map((match) => match[1] ?? '');
    expect(rules.length).toBeGreaterThan(0);
    for (const body of rules) {
      if (/\bpadding(-inline|-x)?\s*:/.test(body)) {
        expect(body).toContain('--field-padding-x');
      }
    }
  });
});
